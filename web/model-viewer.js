import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Each mesh comes from the real, unmodified FreeCAD geometry, saved in GLB.
// The scene preserves three independently measured experimental configurations.
// The animation is reproduced here from their verified physical periods.
const experiments = {
  rod: {
    url: new URL("./media/rod-pendulum.glb", import.meta.url).href,
    angle: 15,
    variants: {
      NearEnd: { pivot: -0.265, period: 1.253559 },
      Optimal: { pivot: 0, period: 1.185781 },
      NearCentre: { pivot: 0.265, period: 1.624298 },
    },
  },
  collar: {
    url: new URL("./media/collar-pendulum.glb", import.meta.url).href,
    angle: 20,
    variants: {
      Near: { pivot: -0.275, period: 1.117883 },
      Best: { pivot: 0, period: 1.044868 },
      Far: { pivot: 0.275, period: 1.260983 },
    },
  },
};

const loader = new GLTFLoader();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const viewers = [];
const palette = {
  rod: {
    NearEnd: 0x8bb5c5, Optimal: 0xbff0c2, NearCentre: 0x8cabbc,
  },
  collar: {
    Near: 0x9bb7c7, Best: 0xbff0c2, Far: 0x86b5bd,
  },
};

function materialFor(name, kind) {
  if (name === "FixedSupport") {
    return new THREE.MeshStandardMaterial({ color: 0x517685, metalness: .67, roughness: .37 });
  }
  if (name.startsWith("Collar_")) {
    return new THREE.MeshStandardMaterial({ color: 0xe6b978, metalness: .47, roughness: .3 });
  }
  if (name.startsWith("COM_") || name.startsWith("Centre_")) {
    return new THREE.MeshStandardMaterial({ color: 0xffd88e, emissive: 0x5b3411, metalness: .18, roughness: .37 });
  }
  if (name.startsWith("Axle_") || name.startsWith("Washer_")) {
    return new THREE.MeshStandardMaterial({ color: 0xdee7e5, metalness: .75, roughness: .25 });
  }
  const variant = name.includes("_") ? name.split("_").slice(1).join("_") : "";
  return new THREE.MeshStandardMaterial({
    color: palette[kind]?.[variant] ?? 0x86aebb,
    metalness: .4,
    roughness: .35,
    side: THREE.DoubleSide,
  });
}

function updatePlayButton(viewer) {
  const button = viewer.playButton;
  const isPlaying = viewer.playing;
  button.dataset.ru = isPlaying ? "⏸ Пауза" : "▶ Пуск";
  button.dataset.en = isPlaying ? "⏸ Pause" : "▶ Play";
  button.textContent = document.documentElement.lang === "ru" ? button.dataset.ru : button.dataset.en;
  button.setAttribute("aria-pressed", String(isPlaying));
}

function addPendulumGroups(model, config) {
  const meshes = [];
  model.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });

  const pivotGroups = new Map();
  for (const [variant, item] of Object.entries(config.variants)) {
    const group = new THREE.Group();
    group.name = "Oscillation_" + variant;
    group.position.set(item.pivot, 0, 0);
    model.add(group);
    pivotGroups.set(variant, { group, period: item.period });
  }

  for (const mesh of meshes) {
    const name = mesh.name;
    mesh.material = materialFor(name, config === experiments.rod ? "rod" : "collar");
    mesh.castShadow = false;
    let moving = false;
    for (const [variant, item] of pivotGroups) {
      // Axles and washers do NOT move; the rod, its COM and the fixed collar do.
      if (name === "Rod_" + variant || name === "COM_" + variant ||
          name === "Collar_" + variant || name === "Centre_" + variant) {
        const worldPosition = new THREE.Vector3();
        mesh.getWorldPosition(worldPosition);
        item.group.add(mesh);
        mesh.position.set(worldPosition.x - item.group.position.x, worldPosition.y, worldPosition.z);
        moving = true;
        break;
      }
    }
    if (!moving) mesh.matrixWorldNeedsUpdate = true;
  }
  return pivotGroups;
}

function initViewer(stage) {
  const kind = stage.dataset.model;
  const config = experiments[kind];
  if (!config) return;

  const container = stage.closest(".card-media");
  const playButton = container.querySelector(".model-play");
  const resetButton = container.querySelector(".model-reset");
  const viewer = {
    stage, kind, playing: !reducedMotion.matches, playButton, resetButton,
    time: 0, groups: null, renderer: null, visible: false, controls: null,
  };
  viewers.push(viewer);
  updatePlayButton(viewer);

  playButton.addEventListener("click", () => {
    viewer.playing = !viewer.playing;
    updatePlayButton(viewer);
  });

  resetButton.addEventListener("click", () => {
    viewer.time = 0;
    if (viewer.controls) {
      viewer.controls.reset();
      viewer.controls.update();
    }
    renderFrame(viewer);
  });

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, .01, 15);
    camera.position.set(.04, -.17, 1.55);

    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-label", kind === "rod"
      ? "Интерактивная 3D-модель трёх маятников с разными точками подвеса"
      : "Интерактивная 3D-модель трёх маятников с закреплёнными кольцами");
    renderer.domElement.setAttribute("role", "img");
    stage.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe0f7ee, 0x334e68, 2.2));
    const key = new THREE.DirectionalLight(0xf4fff4, 3);
    key.position.set(-.6, .7, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x92d6c9, 1.1);
    fill.position.set(.6, -.3, -.8);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = .65;
    controls.maxDistance = 4;
    controls.target.set(0, -.17, 0);
    controls.update();
    controls.saveState();

    viewer.renderer = renderer;
    viewer.scene = scene;
    viewer.camera = camera;
    viewer.controls = controls;

    function resize() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderFrame(viewer);
    }
    viewer.resize = resize;
    new ResizeObserver(resize).observe(stage);
    resize();

    loader.load(config.url, gltf => {
      const model = gltf.scene;
      viewer.groups = addPendulumGroups(model, config);
      scene.add(model);
      stage.dataset.ready = "true";
      stage.querySelector(".viewer-fallback")?.remove();
      renderFrame(viewer);
    }, undefined, () => {
      // Keep the original FreeCAD video available as a fallback.
      renderer.domElement.style.display = "none";
      stage.dataset.error = "true";
      playButton.disabled = true;
      resetButton.disabled = true;
    });
  } catch (err) {
    stage.dataset.error = "true";
    playButton.disabled = true;
    resetButton.disabled = true;
  }
}

function renderFrame(viewer) {
  if (!viewer.renderer || !viewer.scene || !viewer.camera) return;
  if (viewer.groups) {
    const angleRad = experiments[viewer.kind].angle * Math.PI / 180;
    for (const item of viewer.groups.values()) {
      // FreeCAD geometry is captured at the negative release angle.
      // Relative rotation: 0 -> 2 theta0 -> 0, so the complete swing is
      // -theta0 .. +theta0 without altering the original mesh geometry.
      item.group.rotation.z = angleRad * (1 - Math.cos(2 * Math.PI * viewer.time / item.period));
    }
  }
  viewer.controls?.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
}

document.querySelectorAll(".model-stage[data-model]").forEach(initViewer);
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const viewer = viewers.find(x => x.stage === entry.target);
    if (viewer) {
      viewer.visible = entry.isIntersecting;
      if (viewer.visible) viewer.resize?.();
    }
  }
}, { rootMargin: "150px", threshold: 0 });
viewers.forEach(viewer => observer.observe(viewer.stage));

let previous = performance.now();
function tick(now) {
  const dt = Math.min(.05, (now - previous) / 1000);
  previous = now;
  for (const viewer of viewers) {
    if (!viewer.visible || !viewer.groups || document.hidden) continue;
    if (viewer.playing) viewer.time += dt;
    renderFrame(viewer);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
