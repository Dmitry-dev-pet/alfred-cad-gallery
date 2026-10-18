import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/*
 * Why this module exists:
 * The original FreeCAD-to-GLB export contains positions + COLOR_0 but NO
 * vertex NORMAL attributes. Lighting-dependent Three.js materials can render
 * all-black on such geometry. We explicitly compute normals on each GLB mesh.
 *
 * This viewer has two independent, always-visible material modes:
 * - Studio: generated grayscale albedo + wear/roughness + bump maps,
 *   moderate metalness, guaranteed diffuse/ambient response.
 * - CAD: deliberately unlit mesh colors (MeshBasicMaterial), visible even
 *   on browsers without an environment map, or if all lights fail.
 *
 * No new OEM CAD, photographs, third-party textures or network requests.
 */
const finishes = {
  paint:  { color: 0x7299aa, metalness: .20, roughness: .62, clearcoat: .18, scale: 10, bump: .000025, seed: 1001 },
  steel:  { color: 0xe0e8e5, metalness: .35, roughness: .35, clearcoat: .08, scale: 15, bump: .000015, seed: 2323 },
  gear:   { color: 0xe4b67c, metalness: .42, roughness: .38, clearcoat: .08, scale: 15, bump: .000024, seed: 3434 },
  wheel:  { color: 0xc6d9e2, metalness: .42, roughness: .38, clearcoat: .08, scale: 15, bump: .000024, seed: 4545 },
  motor:  { color: 0x88a4aa, metalness: .18, roughness: .60, clearcoat: .15, scale: 9,  bump: .000028, seed: 5656 },
  chrome: { color: 0xe0ebe9, metalness: .46, roughness: .26, clearcoat: .16, scale: 18, bump: .000010, seed: 6767 },
};

function finishForPart(name) {
  if (name === "Frame" || name === "MotorBracket" ||
      name.startsWith("Cover_")) return "paint";
  if (name === "MotorBody_Generic") return "motor";
  if (name.startsWith("Pinion")) return "gear";
  if (name.startsWith("Wheel")) return "wheel";
  if (name.startsWith("BearingGeneric")) return "chrome";
  return "steel";
}

/* The same purposefully distinct colors used by the original CAD export. */
export function originalCadColor(name) {
  if (name === "Frame" || name === "MotorBracket" ||
      name.startsWith("Cover_")) return 0x4c7a8d;
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

function surfaceMaps(style, renderer) {
  const size = 256;
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
  const brushed = style.metalness >= .3;
  const coated = !brushed;

  // Deliberately visible at normal card size: broad, anisotropic machining
  // marks and subtle scratches on metal; stippled powder coat / dark motor.
  // Previous attempt used +/- 5 RGB steps repeated dozens of times, which
  // mipmapped to a uniform flat color and was effectively invisible.
  for (let y = 0; y < size; y++) {
    const wideLine = Math.sin(y * .21) * 18 + Math.sin(y * .53) * 7;
    const hairline = y % 47 === 0 ? 27 : y % 53 === 1 ? -24 : 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const noise = (random() - .5) * (brushed ? 19 : 38);
      const cross = coated ? Math.sin((x + y) * .19) * 11 : 0;
      const polish = brushed ? wideLine + hairline + noise : cross + noise;
      // Saturation around 215 preserves highlights and shadow definition.
      const brightness = clamp(216 + polish);
      const roughness = clamp(170 + polish * .55 + (random() - .5) * 28);
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
    tex.needsUpdate = true;
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
  if (!geometry?.getAttribute("position")) {
    throw new Error("Gearbox mesh is missing position data");
  }

  // CRITICAL: The original GLB has no NORMAL attributes at all.
  // Calculate indexed vertex normals first, before per-face UV expansion.
  // This preserves smoothed cylinder sides and correct lighting.
  geometry = geometry.clone();
  geometry.computeVertexNormals();
  if (geometry.index) geometry = geometry.toNonIndexed();

  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  if (!normal || normal.count !== count || count % 3) {
    throw new Error("Invalid triangulated mesh normals: " + mesh.name);
  }

  // Box-planar UVs expressed in meters. Keep only 1–3 repeats per part,
  // rather than hundreds of microscopic/invisible repeats.
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

export function prepareGearboxFinishes(meshes, scene, renderer) {
  const originals = new WeakMap();
  const prepared = new WeakMap();
  const categories = new Map();

  // A genuinely unlit fallback; even with broken lighting and no IBL the
  // user MUST be able to see all components in their original CAD colors.
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
      console.warn("Gearbox surface maps unavailable; using solid PBR paint", err);
    }
    const material = new THREE.MeshPhysicalMaterial({
      color: style.color,
      metalness: style.metalness,
      roughness: style.roughness,
      clearcoat: style.clearcoat,
      clearcoatRoughness: .48,
      vertexColors: false,
      side: THREE.DoubleSide,
      ...maps,
      bumpScale: style.bump,
      // A small fill independent of environment/light intensity; a dark
      // renderer can no longer erase the silhouette to black.
      emissive: new THREE.Color(style.color).multiplyScalar(.35),
      emissiveIntensity: .45,
      envMapIntensity: .85,
    });
    categories.set(kind, material);
  }

  for (const mesh of meshes) {
    const kind = finishForPart(mesh.name);
    addBoxUVs(mesh, finishes[kind].scale);
    prepared.set(mesh, categories.get(kind));
  }

  // Environment improves reflections, but the material does not rely on it.
  // Low metalness + true normals + ambient light is the guaranteed baseline.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .06);
    scene.environment = environment.texture;
    room.dispose();
    pmrem.dispose();
  } catch (err) {
    console.warn("Gearbox environment reflections unavailable; using direct lighting", err);
  }

  return {
    apply(mode) {
      for (const mesh of meshes) {
        mesh.material = mode === "cad" ? originals.get(mesh) : prepared.get(mesh);
      }
    },
    partCount: meshes.length,
    hasGeneratedNormals: meshes.every(m => !!m.geometry.getAttribute("normal")),
    hasGeneratedUVs: meshes.every(m => !!m.geometry.getAttribute("uv")),
  };
}
