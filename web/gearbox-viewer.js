import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareGearboxFinishes } from "./gearbox-materials.js?finish=20261019-v4";

// This viewer uses a reduced 74-part GLB made from the original FreeCAD
// gearbox. The Pololu OEM motor CAD and unlicensed source geometry are NOT
// included; the motor body/shaft and bearings are simple procedural stand-ins.
//
// All input, intermediate and output shaft rotation factors use the validated
// 4:1 kinematic ratios: +1, -1/2, +1/4. This is a visual demonstration;
// it does not simulate mechanical forces, strength, backlash or friction.

const stage = document.querySelector('.model-stage[data-model="gearbox"]');

if (stage) {
  const card = stage.closest(".project-card");
  const media = stage.closest(".card-media");
  const playButton = media.querySelector(".model-play");
  const resetButton = media.querySelector(".model-reset");
  const materialButton = media.querySelector(".model-material");
  const speed = card.querySelector("#gearboxRpm");
  const speedOutput = card.querySelector("#gearboxRpmOutput");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = !reduced;
  let visible = false;
  let inputRpm = Number(speed.value);
  let phase = 0;
  let lastFrame = performance.now();
  let renderer, controls, scene, camera, shafts, finishController;
  let finishMode = "studio";
  let ready = false;

  const shaftsMeta = [
    { id: "input", x: 0, ratio: 1 },
    { id: "middle", x: .06, ratio: -.5 },
    { id: "output", x: .12, ratio: .25 },
  ];

  function groupFor(name) {
    if (
      ["InputShaft", "PinionA", "Key_PinionA", "StepCoupling6to12",
       "MotorShaft_Generic"].includes(name) ||
      name.startsWith("Circlip_PinionA_") ||
      name.startsWith("Circlip_Bearing_InputShaft_") ||
      name.startsWith("CouplerGrub")
    ) return "input";

    if (
      ["MiddleShaft", "PinionB", "WheelA", "Key_PinionB", "Key_WheelA"].includes(name) ||
      name.startsWith("Circlip_Bearing_MiddleShaft_") ||
      name.startsWith("Circlip_PinionB_") ||
      name.startsWith("Circlip_WheelA_")
    ) return "middle";

    if (
      ["OutputShaft", "WheelB", "Key_WheelB"].includes(name) ||
      name.startsWith("Circlip_Bearing_OutputShaft_") ||
      name.startsWith("Circlip_WheelB_")
    ) return "output";

    return null; // the frame, generic bearings, covers, motor housing and screws stay fixed
  }

  function updateLabels() {
    const lang = document.documentElement.lang || "ru";
    const rpmUnit = lang === "ru" ? "об/мин" : "rpm";
    speedOutput.textContent = inputRpm + " → " + (inputRpm / 4).toLocaleString(lang === "ru" ? "ru-RU" : "en-US") + " " + rpmUnit;
    playButton.dataset.ru = playing ? "⏸ Пауза" : "▶ Пуск";
    playButton.dataset.en = playing ? "⏸ Pause" : "▶ Play";
    playButton.textContent = playButton.dataset[lang === "ru" ? "ru" : "en"];
    playButton.setAttribute("aria-pressed", String(playing));
    if (materialButton) {
      materialButton.dataset.ru = finishMode === "studio" ? "◈ PBR" : "▦ CAD";
      materialButton.dataset.en = materialButton.dataset.ru;
      materialButton.textContent = materialButton.dataset.ru;
      materialButton.setAttribute("aria-pressed", String(finishMode === "studio"));
      const title = lang === "ru"
        ? (finishMode === "studio" ? "Показать исходные CAD-цвета" : "Показать PBR-материалы")
        : (finishMode === "studio" ? "Show original CAD colors" : "Show realistic PBR materials");
      materialButton.setAttribute("aria-label", title);
      materialButton.setAttribute("title", title);
    }
  }
  updateLabels();

  speed.addEventListener("input", () => {
    inputRpm = Number(speed.value);
    updateLabels();
  });
  document.getElementById("languageToggle")?.addEventListener("click", updateLabels);

  playButton.addEventListener("click", () => {
    if (!ready) return;
    playing = !playing;
    updateLabels();
  });

  materialButton?.addEventListener("click", () => {
    if (!ready || !finishController) return;
    finishMode = finishMode === "studio" ? "cad" : "studio";
    finishController.apply(finishMode);
    updateLabels();
    draw();
  });

  resetButton.addEventListener("click", () => {
    if (!ready) return;
    phase = 0;
    controls.reset();
    draw();
  });

  function prepareGroups(model) {
    const meshes = [];
    model.traverse(node => {
      if (node.isMesh) meshes.push(node);
    });
    const groups = new Map();

    for (const meta of shaftsMeta) {
      const group = new THREE.Group();
      group.name = "GearboxRotation_" + meta.id;
      group.position.set(meta.x, 0, 0);
      model.add(group);
      groups.set(meta.id, { group, ratio: meta.ratio });
    }

    // After reparenting, group.attach preserves original world transforms.
    // Mesh vertices were exported in assembled FreeCAD world coordinates.
    model.updateMatrixWorld(true);

    // PBR materials include seeded, generated color/roughness/bump maps and
    // per-triangle box UVs. The original GLB colors remain one click away.
    finishController = prepareGearboxFinishes(meshes, scene, renderer);
    if (!finishController.hasGeneratedNormals || !finishController.hasGeneratedUVs) {
      throw new Error("Gearbox geometry has missing normals or UV coordinates");
    }
    finishController.apply(finishMode);

    for (const mesh of meshes) {
      const id = groupFor(mesh.name);
      if (id) groups.get(id).group.attach(mesh);
    }

    for (const part of ["PinionA", "WheelA", "PinionB", "WheelB",
                        "InputShaft", "MiddleShaft", "OutputShaft",
                        "MotorBody_Generic"]) {
      if (!meshes.some(x => x.name === part)) throw new Error("Missing gearbox part: " + part);
    }
    return groups;
  }

  function draw() {
    if (!ready) return;
    for (const { group, ratio } of shafts.values()) {
      group.rotation.y = phase * ratio;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(37, 1, .015, 15);
    camera.position.set(.34, .22, .38);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.domElement.setAttribute("aria-label", "3D FreeCAD gearbox with independently rotating shafts");
    renderer.domElement.setAttribute("role", "img");
    stage.appendChild(renderer.domElement);

    // Ambient light prevents dark metallic parts when a mobile browser cannot
    // generate an environment map. Directional lights add shape and shine.
    scene.add(new THREE.AmbientLight(0xffffff, .72));
    scene.add(new THREE.HemisphereLight(0xeafff6, 0x647989, 1.05));
    const key = new THREE.DirectionalLight(0xffefd9, 2.0);
    key.position.set(-.5, 1.1, 1.1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcde8f9, .85);
    fill.position.set(.8, -.3, -.9);
    scene.add(fill);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = .26;
    controls.maxDistance = 2;
    controls.target.set(.06, .04, 0);
    controls.update();
    controls.saveState();

    function resize() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      draw();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    const url = new URL("./media/gearbox-public.glb?normals=v2", import.meta.url).href;
    new GLTFLoader().load(url, ({ scene: model }) => {
      scene.add(model);
      shafts = prepareGroups(model);
      ready = true;
      stage.dataset.ready = "true";
      stage.querySelector(".viewer-fallback")?.remove();
      playButton.disabled = false;
      resetButton.disabled = false;
      if (materialButton) materialButton.disabled = false;
      resize();
      draw();
    }, undefined, (error) => {
      console.error("Gearbox GLB could not be loaded", error);
      stage.dataset.error = "true";
      const note = stage.querySelector(".viewer-fallback-note");
      if (note) {
        note.dataset.ru = "3D временно недоступно — показана схема";
        note.dataset.en = "3D temporarily unavailable — showing diagram";
        note.textContent = note.dataset[document.documentElement.lang === "ru" ? "ru" : "en"];
      }
    });

    new IntersectionObserver(entries => {
      for (const entry of entries) visible = entry.isIntersecting;
      if (visible) resize();
    }, { rootMargin: "150px" }).observe(stage);

    function animate(now) {
      const dt = Math.min(.06, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      if (visible && ready && !document.hidden) {
        if (playing) phase += dt * Math.PI * 2 * (inputRpm / 60);
        draw();
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  } catch (error) {
    console.error("Gearbox WebGL initialization failed", error);
    stage.dataset.error = "true";
    const note = stage.querySelector(".viewer-fallback-note");
    if (note) note.textContent = "WebGL unavailable — diagram fallback";
  }
}
