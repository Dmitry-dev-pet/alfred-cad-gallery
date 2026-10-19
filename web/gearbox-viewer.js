import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { prepareGearboxFinishes } from "./gearbox-materials.js?finish=20261019-uv1";

// Public 74-part mesh comes from FreeCAD, with OEM solids removed. The input,
// middle and output groups have verified ratios +1 : -1/2 : +1/4.
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
  let key, shadowReceiver, contactShadow;
  let finishMode = "photo"; // the highest quality is the public default
  const uvCheck = new URLSearchParams(window.location.search).get("uvcheck") === "1";
  stage.dataset.uvCheck = uvCheck ? "requested" : "off";
  if (uvCheck) {
    const legend = document.createElement("div");
    legend.textContent = "UV CHECK · 80 мм/повтор · квадраты по 20 мм · только рама";
    legend.setAttribute("aria-label", "Диагностика текстуры рамы: один повтор на 80 мм");
    Object.assign(legend.style, {
      position: "absolute", top: "12px", left: "12px", right: "12px",
      zIndex: "4", padding: "7px", background: "rgba(7,22,35,.85)",
      color: "#fff", fontSize: "12px", fontWeight: "700", pointerEvents: "none"
    });
    stage.appendChild(legend);
  }
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

    return null; // frame, bearings, motor body, and screws remain static
  }

  function updateLabels() {
    const lang = document.documentElement.lang || "ru";
    const ru = lang === "ru";
    speedOutput.textContent = inputRpm + " → " + (inputRpm / 4).toLocaleString(ru ? "ru-RU" : "en-US") + " " + (ru ? "об/мин" : "rpm");
    playButton.dataset.ru = playing ? "⏸ Пауза" : "▶ Пуск";
    playButton.dataset.en = playing ? "⏸ Pause" : "▶ Play";
    playButton.textContent = playButton.dataset[ru ? "ru" : "en"];
    playButton.setAttribute("aria-pressed", String(playing));
    if (materialButton) {
      const names = { photo:"📷 PHOTO", studio:"◈ PBR", cad:"▦ CAD" };
      const next = { photo:"studio", studio:"cad", cad:"photo" }[finishMode];
      materialButton.dataset.ru = materialButton.dataset.en = names[finishMode];
      materialButton.textContent = names[finishMode];
      materialButton.setAttribute("aria-pressed", String(finishMode !== "cad"));
      const title = ru
        ? { photo:"Переключить на PBR без теней", studio:"Переключить на исходные CAD-цвета", cad:"Переключить на фоторежим" }[finishMode]
        : { photo:"Switch to faster PBR", studio:"Switch to original CAD colors", cad:"Switch to photo-quality rendering" }[finishMode];
      materialButton.setAttribute("aria-label", title);
      materialButton.setAttribute("title", title);
      materialButton.dataset.nextMode = next;
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

  function applyMode() {
    if (!ready || !finishController) return;
    finishController.apply(finishMode);
    renderer.shadowMap.enabled = finishMode === "photo";
    renderer.toneMappingExposure = finishMode === "photo" ? 1.12 : 1.03;
    if (scene.environment) scene.environmentIntensity = finishMode === "photo" ? 1.00 : .82;
    if (shadowReceiver) shadowReceiver.visible = finishMode === "photo";
    if (contactShadow) contactShadow.visible = finishMode === "photo";
    stage.dataset.renderMode = finishMode;
    updateLabels();
    draw();
  }
  materialButton?.addEventListener("click", () => {
    if (!ready) return;
    finishMode = { photo:"studio", studio:"cad", cad:"photo" }[finishMode];
    applyMode();
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
    model.updateMatrixWorld(true);
    finishController = prepareGearboxFinishes(meshes, scene, renderer, ({ loaded, failed, total, uvCheck: uvResult }) => {
      if (loaded !== undefined) stage.dataset.pbrMapsLoaded = String(loaded);
      if (failed !== undefined) stage.dataset.pbrMapsFailed = String(failed);
      if (total !== undefined) stage.dataset.pbrMapsTotal = String(total);
      if (uvResult) stage.dataset.uvCheck = uvResult;
      if (ready) draw();
    });
    if (uvCheck) stage.dataset.uvCheck = "loading";
    if (!finishController.hasGeneratedNormals || !finishController.hasGeneratedUVs) {
      throw new Error("Gearbox geometry is missing normals or UV coordinates");
    }
    finishController.apply(finishMode);
    for (const mesh of meshes) {
      const id = groupFor(mesh.name);
      if (id) groups.get(id).group.attach(mesh);
      // Shadow maps are expensive. Cast silhouettes only for major parts,
      // but allow all components to receive realistic highlights and shade.
      mesh.castShadow = mesh.name === "Frame" || mesh.name === "MotorBody_Generic" ||
        mesh.name === "PinionA" || mesh.name === "PinionB" ||
        mesh.name === "WheelA" || mesh.name === "WheelB";
      mesh.receiveShadow = true;
    }
    for (const part of ["PinionA", "WheelA", "PinionB", "WheelB",
                        "InputShaft", "MiddleShaft", "OutputShaft", "MotorBody_Generic"]) {
      if (!meshes.some(x => x.name === part)) throw new Error("Missing gearbox part: " + part);
    }
    return groups;
  }

  function installStudioGround(model) {
    // True cast shadows, blended onto the page's existing studio backdrop.
    // The public scene bounds are x≈[-.045,.165], y≈[-.068,.146], z≈±.059m.
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const y = bounds.min.y - .009;
    shadowReceiver = new THREE.Mesh(
      new THREE.PlaneGeometry(.62, .48),
      new THREE.ShadowMaterial({ color:0x04070a, opacity:.46, transparent:true, depthWrite:false })
    );
    shadowReceiver.rotation.x = -Math.PI / 2;
    shadowReceiver.position.set(center.x, y, center.z);
    shadowReceiver.receiveShadow = true;
    scene.add(shadowReceiver);

    // Soft contact occlusion remains convincing even when mobile GPUs reduce
    // shadow-map precision. This is a shadow plane, not a fake object render.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(64,64,8,64,64,64);
      grad.addColorStop(0,"rgba(0,0,0,.58)");
      grad.addColorStop(.52,"rgba(0,0,0,.27)");
      grad.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,128,128);
      const texture = new THREE.CanvasTexture(canvas);
      contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(.36, .22),
        new THREE.MeshBasicMaterial({ map:texture, transparent:true, opacity:.60,
                                      depthWrite:false, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-1 })
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.set(center.x, y + .0002, center.z);
      contactShadow.renderOrder = 1;
      scene.add(contactShadow);
    }
  }

  function loadLocalStudioHDR() {
    stage.dataset.hdrStatus = "loading";
    const url = new URL("./media/env/studio-softboxes-1k.hdr?hdr=20261019-photo1", import.meta.url);
    try {
      new RGBELoader().setDataType(THREE.HalfFloatType).load(url.href, texture => {
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(renderer);
          const env = pmrem.fromEquirectangular(texture);
          scene.environment = env.texture;
          scene.environmentIntensity = finishMode === "photo" ? 1.0 : .82;
          texture.dispose();
          pmrem.dispose();
          stage.dataset.hdrStatus = "ready";
          draw();
        } catch (err) {
          console.warn("Studio HDR unavailable; keeping generated room lighting", err);
          stage.dataset.hdrStatus = "fallback";
        }
      }, undefined, err => {
        console.warn("Local studio HDR download failed; keeping generated room lighting", err);
        stage.dataset.hdrStatus = "fallback";
      });
    } catch (err) {
      console.warn("HDR loader unsupported; keeping room environment", err);
      stage.dataset.hdrStatus = "fallback";
    }
  }

  function draw() {
    if (!ready) return;
    for (const { group, ratio } of shafts.values()) group.rotation.y = phase * ratio;
    controls.update();
    renderer.render(scene, camera);
  }

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(37,1,.015,15);
    camera.position.set(.34,.22,.38);
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
    const compact = matchMedia("(max-width:650px)").matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, compact ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Interactive realistic FreeCAD gearbox, preserved 4:1 motion");
    renderer.domElement.setAttribute("role", "img");
    stage.appendChild(renderer.domElement);

    // HDR panels produce the broad metal reflections; the direct key light
    // casts a real shadow while low ambient fill protects mobile fallbacks.
    scene.add(new THREE.AmbientLight(0xeaf4ff,.33));
    scene.add(new THREE.HemisphereLight(0xeafaff,0x546073,.54));
    key = new THREE.DirectionalLight(0xfff4e8,2.65);
    key.position.set(-.37,.72,.42);
    key.target.position.set(.06,.01,0);
    key.castShadow = true;
    key.shadow.mapSize.set(compact ? 1024 : 2048,compact ? 1024 : 2048);
    key.shadow.camera.near = .04;
    key.shadow.camera.far = 2.3;
    key.shadow.camera.left = -.35;
    key.shadow.camera.right = .35;
    key.shadow.camera.top = .35;
    key.shadow.camera.bottom = -.35;
    key.shadow.bias = -.00008;
    key.shadow.normalBias = .0009;
    key.shadow.radius = 3;
    scene.add(key,key.target);
    const fill = new THREE.DirectionalLight(0xd7eaff,.92);
    fill.position.set(.44,.18,-.38);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xf5fbff,.74);
    rim.position.set(-.18,.40,-.35);
    scene.add(rim);

    controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = .26;
    controls.maxDistance = 2;
    controls.target.set(.06,.04,0);
    controls.update();
    controls.saveState();

    function resize() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width,height,false);
      draw();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    const url = new URL("./media/gearbox-public.glb?normals=v2", import.meta.url).href;
    new GLTFLoader().load(url, ({ scene:model }) => {
      scene.add(model);
      shafts = prepareGroups(model);
      installStudioGround(model);
      ready = true;
      stage.dataset.ready = "true";
      stage.querySelector(".viewer-fallback")?.remove();
      playButton.disabled = false;
      resetButton.disabled = false;
      if (materialButton) materialButton.disabled = false;
      loadLocalStudioHDR();
      applyMode();
      resize();
      draw();
    },undefined,error => {
      console.error("Gearbox GLB could not be loaded",error);
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
    },{rootMargin:"150px"}).observe(stage);

    function animate(now) {
      const dt = Math.min(.06,Math.max(0,(now-lastFrame)/1000));
      lastFrame = now;
      if (visible && ready && !document.hidden) {
        if (playing) phase += dt*Math.PI*2*(inputRpm/60);
        draw();
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  } catch (error) {
    console.error("Gearbox WebGL initialization failed",error);
    stage.dataset.error = "true";
    const note = stage.querySelector(".viewer-fallback-note");
    if (note) note.textContent = "WebGL unavailable — diagram fallback";
  }
}
