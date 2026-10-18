import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Small, deterministic, seamless-enough industrial surface maps generated
// locally in the visitor's browser. No photo/CDN textures and no source UVs.
// The FreeCAD-to-GLB conversion retains triangle meshes but has no UVs, so
// assign per-face box-planar UVs in METRES (never merely attach a texture to
// the zero-UV mesh). This is a visual finish, not engineering data.
const finishes = {
  paint:  { color: 0x477084, metalness: .30, roughness: .50, clearcoat: .25, scale: 62,  bump: .000012, seed: 1001 },
  steel:  { color: 0xc5d5d9, metalness: .89, roughness: .31, clearcoat: .03, scale: 110, bump: .000008, seed: 2323 },
  gear:   { color: 0xc8a57a, metalness: .94, roughness: .30, clearcoat: 0,   scale: 90,  bump: .000013, seed: 3434 },
  wheel:  { color: 0xb0c3c8, metalness: .94, roughness: .32, clearcoat: 0,   scale: 90,  bump: .000013, seed: 4545 },
  motor:  { color: 0x415963, metalness: .53, roughness: .49, clearcoat: .1,  scale: 64,  bump: .000012, seed: 5656 },
  chrome: { color: 0xd4e1e1, metalness: .98, roughness: .23, clearcoat: 0,   scale: 118, bump: .000007, seed: 6767 },
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

function rng(seed) {
  let n = seed >>> 0;
  return () => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return ((n >>> 0) / 4294967296);
  };
}

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
  const brushed = style.metalness > .7;

  // Directional micro-grain for machined metal; isotropic micro-speckle for
  // powder coat. Keep contrast subtle so parts look physically plausible.
  for (let y = 0; y < size; y++) {
    const line = Math.sin(y * .52) * 4 + Math.sin(y * 2.19) * 1.7;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = (random() - .5) * (brushed ? 12 : 17);
      const streak = brushed ? line : Math.sin((x + y) * .23) * 1.8;
      const luminance = Math.max(212, Math.min(252, Math.round(235 + grain + streak)));
      const microHeight = Math.max(182, Math.min(251, Math.round(221 + grain * 1.7 + streak)));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = luminance;
      img.data[i + 3] = 255;
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = microHeight;
      relief.data[i + 3] = 255;
    }
  }
  colorCtx.putImageData(img, 0, 0);
  reliefCtx.putImageData(relief, 0, 0);

  function tex(canvas, colorSpace) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  }
  return {
    map: tex(colorCanvas, THREE.SRGBColorSpace),
    roughnessMap: tex(reliefCanvas, THREE.NoColorSpace),
    bumpMap: tex(reliefCanvas, THREE.NoColorSpace),
  };
}

export function addBoxUVs(mesh, scale) {
  let geometry = mesh.geometry;
  if (!geometry || !geometry.getAttribute("position")) return;

  // Per-face UVs avoid smearing a brushed texture across cylindrical teeth,
  // angled bearing caps and the flat top of the steel frame.
  if (geometry.index) geometry = geometry.toNonIndexed();
  else geometry = geometry.clone();
  const position = geometry.getAttribute("position");
  const count = position.count;
  if (count % 3 !== 0) throw new Error("Expected triangulated FreeCAD mesh");

  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 3) {
    const ax = position.getX(i), ay = position.getY(i), az = position.getZ(i);
    const bx = position.getX(i + 1), by = position.getY(i + 1), bz = position.getZ(i + 1);
    const cx = position.getX(i + 2), cy = position.getY(i + 2), cz = position.getZ(i + 2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
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

// Returns a no-network, reversible finish controller. The original GLB
// material stays available behind the "CAD" comparison control.
export function prepareGearboxFinishes(meshes, scene, renderer) {
  const originals = new WeakMap();
  const prepared = new WeakMap();
  const categories = new Map();
  for (const mesh of meshes) {
    const old = mesh.material;
    const original = old?.clone() || new THREE.MeshStandardMaterial({color:0x9cb7c0});
    original.side = THREE.DoubleSide;
    originals.set(mesh, original);
  }

  for (const [kind, style] of Object.entries(finishes)) {
    let maps = {};
    try { maps = surfaceMaps(style, renderer); } catch { /* plain PBR fallback */ }
    const material = new THREE.MeshPhysicalMaterial({
      color: style.color,
      metalness: style.metalness,
      roughness: style.roughness,
      clearcoat: style.clearcoat,
      clearcoatRoughness: .42,
      side: THREE.DoubleSide,
      vertexColors: false,
      ...maps,
      bumpScale: style.bump,
      envMapIntensity: 1.2,
    });
    categories.set(kind, material);
  }

  // Compute geometric UVs only once, before the material swap, so material
  // mode changes never modify mesh positions or shaft axes.
  for (const mesh of meshes) {
    const kind = finishForPart(mesh.name);
    addBoxUVs(mesh, finishes[kind].scale);
    prepared.set(mesh, categories.get(kind));
  }

  // Recreate softbox-like reflections entirely in Three.js. If a mobile GPU
  // cannot generate the PMREM environment, scene lights still illuminate
  // the physically based materials.
  try {
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, .06);
    scene.environment = environment.texture;
    room.dispose();
    generator.dispose();
  } catch { /* the direct key/fill lights remain active */ }

  return {
    apply(mode) {
      for (const mesh of meshes) {
        mesh.material = mode === "cad" ? originals.get(mesh) : prepared.get(mesh);
      }
    },
    partCount: meshes.length,
    hasGeneratedUVs: meshes.every(m => !!m.geometry.getAttribute("uv")),
  };
}
