import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/*
 * UV diagnostic (?uvcheck=1): 4x4 grid, 20 mm/checker square.
 * Blue frame tile period is now 80 mm rather than 400 mm.
 * Independent, never-black CAD fallback and production-oriented PBR texture
 * sets. Public mesh has 74 genuine FreeCAD-derived components with v2 normals.
 * Original files have no UVs, hence conservative planar UVs per triangle.
 * All textures/HDR are local, internally authored, and require no external API.
 */
const finishes = {
  paint:  { color: 0x33627c, metalness: .05, roughness: .74, clearcoat: .28, scale: 12.5, bump: .000050, seed: 1001, normalStrength: .48 },
  steel:  { color: 0xb9c9ce, metalness: .92, roughness: .33, clearcoat: .03, scale: 6.8, bump: .000025, seed: 2323, normalStrength: .30 },
  gear:   { color: 0xb57930, metalness: .96, roughness: .36, clearcoat: .02, scale: 6.1, bump: .000025, seed: 3434, normalStrength: .27 },
  wheel:  { color: 0x7398a8, metalness: .92, roughness: .38, clearcoat: .02, scale: 6.1, bump: .000028, seed: 4545, normalStrength: .25 },
  motor:  { color: 0x2c4852, metalness: .67, roughness: .66, clearcoat: .11, scale: 4.4, bump: .000035, seed: 5656, normalStrength: .40 },
  chrome: { color: 0xd3dde0, metalness: .97, roughness: .20, clearcoat: .04, scale: 7.0, bump: .000015, seed: 6767, normalStrength: .17 },
  zinc:   { color: 0xb5b3a9, metalness: .87, roughness: .42, clearcoat: .03, scale: 6.0, bump: .000020, seed: 7878, normalStrength: .25 },
};

function finishForPart(name) {
  if (name === "Frame" || name === "MotorBracket" || name.startsWith("Cover_")) return "paint";
  if (name === "MotorBody_Generic") return "motor";
  if (name.startsWith("Pinion")) return "gear";
  if (name.startsWith("Wheel")) return "wheel";
  if (name.startsWith("BearingGeneric")) return "chrome";
  if (name.startsWith("CoverScrew") || name.startsWith("CouplerGrub") || name.startsWith("Circlip_")) return "zinc";
  return "steel";
}

export function originalCadColor(name) {
  if (name === "Frame" || name === "MotorBracket" || name.startsWith("Cover_")) return 0x4c7a8d;
  if (name === "MotorBody_Generic") return 0x4da8a2;
  if (name.startsWith("Pinion")) return 0xf5bc6a;
  if (name.startsWith("Wheel")) return 0x85e2b9;
  if (name.startsWith("BearingGeneric")) return 0xafc1c8;
  if (name.startsWith("Key_")) return 0xf0d7a4;
  if (name.startsWith("Coupler")) return 0xecac79;
  return 0xd8e3e1;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

// Fast generated maps are retained ONLY as a fallback while authored JPEGs
// load, or when connectivity/WebGL limits block the higher fidelity set.
function surfaceMaps(style, renderer) {
  const size = 128;
  const colorCanvas = document.createElement("canvas");
  const reliefCanvas = document.createElement("canvas");
  colorCanvas.width = reliefCanvas.width = size;
  colorCanvas.height = reliefCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");
  const reliefCtx = reliefCanvas.getContext("2d");
  if (!colorCtx || !reliefCtx) return {};
  const img = colorCtx.createImageData(size, size);
  const relief = reliefCtx.createImageData(size, size);
  const random = rng(style.seed);
  const brushed = style.metalness >= .8;
  for (let y = 0; y < size; y++) {
    const wideLine = Math.sin(y * .065) * 25 + Math.sin(y * .16) * 14;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const noise = (random() - .5) * 29;
      const polish = brushed ? wideLine + noise : Math.sin(x * .08) * Math.sin(y * .11) * 23 + noise;
      const brightness = clamp(213 + polish);
      const roughness = clamp(196 + polish * .30 + (random() - .5) * 18);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = brightness;
      img.data[i + 3] = 255;
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = roughness;
      relief.data[i + 3] = 255;
    }
  }
  colorCtx.putImageData(img, 0, 0);
  reliefCtx.putImageData(relief, 0, 0);
  function texture(canvas, colorSpace) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = colorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  return {
    map: texture(colorCanvas, THREE.SRGBColorSpace),
    roughnessMap: texture(reliefCanvas, THREE.NoColorSpace),
    bumpMap: texture(reliefCanvas, THREE.NoColorSpace),
  };
}

export function addBoxUVs(mesh, scale) {
  let geometry = mesh.geometry;
  if (!geometry?.getAttribute("position")) throw new Error("Gearbox mesh missing positions");
  geometry = geometry.clone();
  // No normal attribute in the original v1 export; v2 has real NORMAL values.
  geometry.computeVertexNormals();
  if (geometry.index) geometry = geometry.toNonIndexed();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  if (!normal || normal.count !== count || count % 3) throw new Error("Invalid mesh normals: " + mesh.name);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 3) {
    const ax = position.getX(i), ay = position.getY(i), az = position.getZ(i);
    const ux = position.getX(i + 1) - ax;
    const uy = position.getY(i + 1) - ay;
    const uz = position.getZ(i + 1) - az;
    const vx = position.getX(i + 2) - ax;
    const vy = position.getY(i + 2) - ay;
    const vz = position.getZ(i + 2) - az;
    const nx = Math.abs(uy * vz - uz * vy);
    const ny = Math.abs(uz * vx - ux * vz);
    const nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      let u, v;
      if (ny >= nx && ny >= nz) {
        u = position.getX(j); v = position.getZ(j);
      } else if (nx >= nz) {
        u = position.getZ(j); v = position.getY(j);
      } else {
        u = position.getX(j); v = position.getY(j);
      }
      uv[j * 2] = u * scale;
      uv[j * 2 + 1] = v * scale;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  mesh.geometry = geometry;
}

// All glTF assets are local and versioned. Color maps are sRGB; normal,
// metalness and roughness maps carry LINEAR data (no color conversion).
const pbrManifests = {
  paint: {
    map: "paint/albedo_2k.jpg",
    roughnessMap: "paint/roughness_2k.jpg",
    normalMap: "paint/normal_2k.jpg",
    metalnessMap: "paint/metalness_2k.jpg",
  },
  steel: {
    map: "steel/albedo_1k.jpg",
    roughnessMap: "steel/roughness_1k.jpg",
    normalMap: "steel/normal_1k.jpg",
  },
  bronze: {
    map: "bronze/albedo_1k.jpg",
    roughnessMap: "bronze/roughness_1k.jpg",
    normalMap: "bronze/normal_1k.jpg",
  },
  motor: {
    map: "motor/albedo_1k.jpg",
    roughnessMap: "motor/roughness_1k.jpg",
    normalMap: "motor/normal_1k.jpg",
  },
};
const categoryToAsset = {paint:"paint",steel:"steel",gear:"bronze",wheel:"steel",motor:"motor",chrome:"steel",zinc:"steel"};

function installPbrAssets(categories, renderer, onAssetsUpdated) {
  const loader = new THREE.TextureLoader();
  const count = Object.values(pbrManifests).reduce((total, item) => total + Object.keys(item).length, 0);
  const progress = { loaded:0, failed:0, total:count };
  const notify = () => onAssetsUpdated?.({ ...progress });
  for (const [setName, slots] of Object.entries(pbrManifests)) {
    for (const [slot, filename] of Object.entries(slots)) {
      const path = new URL("./media/textures/" + filename + "?pbr=20261019-photo1", import.meta.url);
      loader.load(path.href, texture => {
        texture.colorSpace = slot === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
        for (const [kind, assetSet] of Object.entries(categoryToAsset)) {
          if (assetSet !== setName) continue;
          const material = categories.get(kind);
          material[slot] = texture;
          if (slot === "map") {
            // Image already contains the pigment; white tint avoids blue*blue.
            const tint = kind === "wheel" ? 0xe7f0f5 : kind === "zinc" ? 0xe0ddcd : 0xffffff;
            material.color.set(tint);
          }
          if (slot === "roughnessMap") {
            // Multiplicative Three.js maps: real roughness is stored directly.
            material.roughness = kind === "chrome" ? .65 : kind === "wheel" ? 1.05 : 1.0;
          }
          if (slot === "metalnessMap") material.metalness = 1.0;
          if (slot === "normalMap") {
            material.normalScale.set(finishes[kind].normalStrength, finishes[kind].normalStrength);
            material.bumpMap = null; // prevent normal/bump double counting
            material.bumpScale = 0;
          }
          material.needsUpdate = true;
        }
        progress.loaded++;
        notify();
      }, undefined, err => {
        console.warn("Optional local PBR map failed; retaining fallback", filename, err);
        progress.failed++;
        notify();
      });
    }
  }
  notify();
  return progress;
}

export function prepareGearboxFinishes(meshes, scene, renderer, onAssetsUpdated) {
  const originals = new WeakMap();
  const prepared = new WeakMap();
  const categories = new Map();
  // Opt-in UV test paints ONLY the blue structural parts. It is deliberately
  // unlit, so lighting/HDR cannot hide or counterfeit the texture projection.
  const uvCheckEnabled = new URLSearchParams(window.location.search).get("uvcheck") === "1";
  const uvMap = uvCheckEnabled ? new THREE.TextureLoader().load(
    new URL("./media/debug/uv-checker-512.png?grid=20261019-uv1", import.meta.url).href,
    () => onAssetsUpdated?.({ uvCheck: "ready" }),
    undefined,
    () => onAssetsUpdated?.({ uvCheck: "failed" }),
  ) : null;
  if (uvMap) {
    uvMap.colorSpace = THREE.SRGBColorSpace;
    uvMap.wrapS = uvMap.wrapT = THREE.RepeatWrapping;
    uvMap.minFilter = THREE.LinearMipmapLinearFilter;
    uvMap.magFilter = THREE.NearestFilter;
    uvMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const uvDebugMaterial = uvMap ? new THREE.MeshBasicMaterial({
    map: uvMap, side: THREE.DoubleSide, toneMapped: false,
  }) : null;

  for (const mesh of meshes) {
    originals.set(mesh, new THREE.MeshBasicMaterial({
      color: originalCadColor(mesh.name),
      vertexColors: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
  }

  for (const [kind, style] of Object.entries(finishes)) {
    let maps = {};
    try { maps = surfaceMaps(style, renderer); } catch (err) {
      console.warn("Fallback generated maps unavailable", err);
    }
    const material = new THREE.MeshPhysicalMaterial({
      color: style.color,
      metalness: style.metalness,
      roughness: style.roughness,
      clearcoat: style.clearcoat,
      clearcoatRoughness: kind === "paint" ? .49 : .32,
      vertexColors: false,
      side: THREE.DoubleSide,
      ...maps,
      bumpScale: style.bump,
      normalScale: new THREE.Vector2(style.normalStrength,style.normalStrength),
      // Real brushed alloys are directional under area-light reflections.
      anisotropy: ["steel","gear","wheel","chrome"].includes(kind) ? .32 : 0,
      anisotropyRotation: Math.PI * .5,
      // Minimal insurance against an all-black silhouette if HDR is missing.
      emissive: new THREE.Color(style.color).multiplyScalar(.08),
      emissiveIntensity: .13,
    });
    categories.set(kind, material);
  }

  for (const mesh of meshes) {
    const kind = finishForPart(mesh.name);
    addBoxUVs(mesh, finishes[kind].scale);
    prepared.set(mesh, categories.get(kind));
  }

  // Local RoomEnvironment is a fallback until the true offline HDR arrives.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .06);
    scene.environment = environment.texture;
    scene.environmentIntensity = .78;
    room.dispose();
    pmrem.dispose();
  } catch (err) {
    console.warn("Room reflections unavailable; using direct lights", err);
  }

  const progress = installPbrAssets(categories, renderer, onAssetsUpdated);
  return {
    apply(mode) {
      for (const mesh of meshes) {
        if (mode === "cad") mesh.material = originals.get(mesh);
        else if (uvCheckEnabled && finishForPart(mesh.name) === "paint") mesh.material = uvDebugMaterial;
        else mesh.material = prepared.get(mesh);
      }
    },
    uvCheckEnabled,
    paintTileSizeMm: 80,
    progress,
    partCount: meshes.length,
    hasGeneratedNormals: meshes.every(m => !!m.geometry.getAttribute("normal")),
    hasGeneratedUVs: meshes.every(m => !!m.geometry.getAttribute("uv")),
  };
}
