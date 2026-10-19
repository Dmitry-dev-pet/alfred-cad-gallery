# Alfred CAD Lab

A public, bilingual **FreeCAD + Blender + physics** gallery hosted with GitHub Pages.

**Site:** https://dmitry-dev-pet.github.io/alfred-cad-gallery/

## Experiments

- **Two-stage gearbox (4:1):** actual geometry of frame, shafts, and CC0 spur gears from our FreeCAD assembly, exported to a **1.62 MB GLB**. 74 public scene meshes include simplified motor/bearing stand-ins; no Pololu OEM CAD solids. Users can orbit, zoom, pause and adjust input shaft rpm. The browser animates the input/middle/output shafts at +1 : −1/2 : +1/4 speed.
- **Physical pendulum:** three genuine FreeCAD models with different pivot locations. Minimum small-angle period **1.180703 s** for a 600 mm homogeneous rod, with pivot **126.794919 mm** from the top.
- **Sliding-collar pendulum:** three genuine FreeCAD models with different fixed collar positions. Minimum small-angle period **1.0369155 s** at **133.587565 mm** below the pivot.

All three project cards load FreeCAD-derived geometry converted into **GLB (glTF binary)** via **Three.js 0.180.0** with OrbitControls. Each configuration is independently animated in the browser using the physically calculated period; these are not recordings of a live FreeCAD process. The original FreeCAD MP4 videos remain available as fallbacks for the two pendulum experiments.

## Gearbox lighting regression fixed (2026-10-19)

The original public GLB omitted `NORMAL` on **all 74 meshes**, so both Studio PBR and CAD modes could display as an all-black silhouette. A live public-browser test confirmed the defect (even though CI previously passed); button changes alone are not a visual test.

The replacement `web/media/gearbox-public.glb` is a **v2 export** with 74/74 `NORMAL` attributes, validated nonzero unit-length vectors, unchanged geometry and original source restrictions. Version 1 remains available in Git history and private archival storage.

Rendering now additionally recomputes normals defensively, reduces metallic reflectance so fallback diffuse lighting still works, introduces explicit ambient light and subtle emissive fill, provides high-contrast, lower-frequency generated industrial texture grain, and uses a lighting-independent (`MeshBasicMaterial`) CAD-colors mode. A missing optional environment map must never black out the models. CI verifies the normal attributes and shading safeguards, but a real in-browser visual test is also required.

## Visible texture refinements (2026-10-19)

After repairing black PBR surfaces, live browser inspection showed overly uniform silver materials. We toned down overexposed studio lights and assigned distinct pigments to six finish classes, then verified visible blue frame, bronze pinions, steel shafts, cool larger wheels and dark motor.

At normal card scale, the first procedural textures were still subpixel: Three.js mipmapping averaged their fine scratches into a nearly uniform finish. Their UV tiling was reduced again and the texture generator now uses deliberately broader longitudinal machining grooves, highly localized scuffs and coarser stippled paint. This is a **visualized industrial surface treatment** rather than a photographic scan of an actual motor or its materials. The Fullscreen control remains the best place to inspect surface detail.

The site versions its gearbox renderer, generated material module, image texture, and v2-normal GLB URLs so a cached old black-mesh render should not persist after updating HTML.

**AI-generated blue painted-frame texture (2026-10-19):** the 320 px tileable JPEG `web/media/gearbox-frame-worn-blue.jpg` is mapped onto the actual `Frame`, `MotorBracket` and `Cover_*` meshes via box-planar UV coordinates, with the original roughness/bump maps retained. No geometry or shaft kinematics are changed. On texture-loading failure, procedural paint remains. A full-resolution creative source is retained in the ChatGPT project output; an optimized copy is archived in private Alfred-CAD Drive.

## Photographic PBR comparison in Three.js (2026-10-19)

The gearbox now defaults to **PHOTO**, with a three-state 📷 PHOTO → ◈ PBR → ▦ CAD button. All 74 public FreeCAD meshes and +1 : −1/2 : +1/4 shaft speed ratios are preserved, and the unlit CAD fallback stays accessible.

New locally shipped assets: a 2K blue industrial coated-metal set (albedo, roughness, normal, chipped-paint metalness), 1K matching texture sets for steel, bronze and motor, plus a self-generated 1K studio **Radiance RGBE HDR**. HDR is an authored softbox environment, not a photograph. PHOTO uses PMREM studio reflections, an anisotropic machining finish, key/fill/rim light, real directional shadow mapping and soft ground/contact shadows. PBR shows the same mapped materials without the heavier shadows, while CAD renders unlit original colors. Actual maps load asynchronously and deterministic procedural maps + RoomEnvironment keep the model visible on slow or unsupported browsers.

The former 320px paint JPEG is retained as historical material; these new 2K/1K maps replace it. The full material-generation script and all mapped images/HDR are backed up in private Google Drive `Alfred-CAD/gearbox-pololu4692/pbr-v1`. Public filenames and content digests are validated in GitHub Actions. There are no external stock textures, material service logins or additional OEM geometry.

**Limitation:** this is an interactive product visualisation using simplified public mechanical geometry and box-projected UVs, not offline path tracing. Some close-up texture seams, hard CAD edges and missing detailed hardware remain visible.

## Realistic rendering and fullscreen (2026-10-19)

- All **three** 3D scenes have a fullscreen button (⛶). Uses the browser's native Fullscreen API when supported, including Android; a fixed-size CSS viewport fallback works on browsers that reject fullscreen. Escape exits the fallback and native fullscreen offers standard browser exit.
- The gearbox defaults to **PHOTO**, using bundled 2K/1K PBR maps and a local studio HDR. The internally generated maps and HDR need no external texture provider or runtime API.
- Since the source FreeCAD-derived GLB has **no UV coordinates**, `web/gearbox-materials.js` computes box-planar UVs for color/roughness/normal/metalness maps. A local HDR provides the best reflections; RoomEnvironment is the defensive fallback. Materials never change geometry or gear ratios.
- The **📷 PHOTO / ◈ PBR / ▦ CAD** button compares high-quality studio materials with a faster mode and the original unlit CAD palette. Renderers resize to the fullscreen container via ResizeObserver.
- **Existing project portfolio is preserved at https://dmitry-dev-pet.github.io/**, in its own repository `Dmitry-dev-pet/dmitry-dev-pet.github.io`. This CAD gallery is the separate subpath `/alfred-cad-gallery/`, and links back to the main portfolio without altering its editorial curation.

## Storage and publication boundaries

- **Public repository:** only reduced glTF meshes, internally produced physics footage, generated PBR/HDR materials, educational diagrams and site code.
- **Private Google Drive `Alfred-CAD`:** editable `.FCStd`, `.blend`, scripts, archives, third-party components and project snapshots. The GLB copies are retained alongside their original private project folders.
- **Private Truthrail:** hash manifests, Drive file identifiers and verified restore procedures. These are intentionally not copied into the public gallery.
- **GitHub Actions:** Pages deployment artifact only (retention 1 day), not permanent storage.

The pendulum variants in GLB are **reference configurations** fixed by the original CAD experiments. The sliders recompute periods and graphs; they do not update 3D geometry. The Three.js animation uses sinusoidal angular displacement at each verified nonlinear period (and the original release angles), rather than performing live RK4 integration.

Geometry is extracted from actual FreeCAD objects, not recreated by hand; colors are visualization materials. Ideal homogeneous rigid bodies and frictionless pivots are assumed. These are not manufacturing/structural engineering certificates.

## Local preview

Use an HTTP server; opening HTML with `file://` is not supported for GLB loading.

```sh
python3 -m http.server 8000 --directory web
```

Visit http://localhost:8000. The Three.js module and addons are version-pinned on jsDelivr; calculation charts run locally.

## Deployment

The owner-enabled Pages site deploys from `main` using `.github/workflows/pages.yml`. The build validates asset checksums and physics, then publishes `web/` using the GitHub Pages artifact (1-day retention). No Drive credentials or privileged self-hosted runners are involved.

```sh
python3 scripts/check_gallery.py
node --check web/app.js
node --check web/model-viewer.js
node --check web/gearbox-viewer.js
node --check web/gearbox-materials.js
node --check web/fullscreen.js
```

## Provenance

The original FreeCAD models and MP4s were produced on 2026-10-18 as part of Alfred CAD. Private source files remain authoritative; public GLBs are visualization exports.

## Public gearbox: source rights and disclosure

The public `web/media/gearbox-public.glb` consists of 74 render meshes (sha256 `d5ff603a1f792bd1eef350d5eb502d83a67a366303652311b69a5ee5359e4685`). It has been stripped of `Pololu4692Case` and `Pololu4692Dshaft` exact OEM geometry, as well as the imported bearing/screw solids from the private FreeCAD assembly. The motor is represented by two generic cylinders and the bearings by simplified rings. The original editable `.FCStd`, STEP, Blender and recovery files remain private.

The modified 20/40-tooth spur gear geometry originated from Innerscene's CC0 library. We explicitly acknowledge those sources in the public [credits page](web/credits.html). The private assembly also used FreeCAD Library CC BY 3.0 components; those original source assets are excluded from the public GLB, and their provenance and license are still documented on that credits page. This is an illustrative kinematic scene, not manufacturing data or evidence of manufacturer endorsement.

Unlike a prerendered GIF or MP4, a publicly hosted GLB contains extractable polygonal geometry and is **downloadable by any viewer**. The public gallery intentionally distributes this reduced mesh. No access credentials or private Drive file IDs are included.

The gearbox speed control uses a purely kinematic relation. The animation preserves the original mesh geometry and rotates input, intermediate and output shaft groups about parallel axes at x=0, x=60 mm, and x=120 mm, with speed factors +1, −1/2 and +1/4. This does not simulate load, friction, bearing life or motor performance.
