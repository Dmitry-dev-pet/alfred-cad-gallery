# Alfred CAD Lab

A public, bilingual **FreeCAD + Blender + physics** gallery hosted with GitHub Pages.

**Site:** https://dmitry-dev-pet.github.io/alfred-cad-gallery/

## Experiments

- **Two-stage gearbox (4:1):** actual geometry of frame, shafts, and CC0 spur gears from our FreeCAD assembly, exported to a **1.13 MB GLB**. 74 public scene meshes include simplified motor/bearing stand-ins; no Pololu OEM CAD solids. Users can orbit, zoom, pause and adjust input shaft rpm. The browser animates the input/middle/output shafts at +1 : −1/2 : +1/4 speed.
- **Physical pendulum:** three genuine FreeCAD models with different pivot locations. Minimum small-angle period **1.180703 s** for a 600 mm homogeneous rod, with pivot **126.794919 mm** from the top.
- **Sliding-collar pendulum:** three genuine FreeCAD models with different fixed collar positions. Minimum small-angle period **1.0369155 s** at **133.587565 mm** below the pivot.

All three project cards load FreeCAD-derived geometry converted into **GLB (glTF binary)** via **Three.js 0.180.0** with OrbitControls. Each configuration is independently animated in the browser using the physically calculated period; these are not recordings of a live FreeCAD process. The original FreeCAD MP4 videos remain available as fallbacks for the two pendulum experiments.

## Storage and publication boundaries

- **Public repository:** only reduced glTF meshes, internally produced physics footage, educational diagrams and site code.
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
```

## Provenance

The original FreeCAD models and MP4s were produced on 2026-10-18 as part of Alfred CAD. Private source files remain authoritative; public GLBs are visualization exports.

## Public gearbox: source rights and disclosure

The public `web/media/gearbox-public.glb` consists of 74 render meshes (sha256 `490ed7e58b5d1dae470123a222fd5e953342552092e8917d3f688fbaba1f1386`). It has been stripped of `Pololu4692Case` and `Pololu4692Dshaft` exact OEM geometry, as well as the imported bearing/screw solids from the private FreeCAD assembly. The motor is represented by two generic cylinders and the bearings by simplified rings. The original editable `.FCStd`, STEP, Blender and recovery files remain private.

The modified 20/40-tooth spur gear geometry originated from Innerscene's CC0 library. We explicitly acknowledge those sources in the public [credits page](web/credits.html). The private assembly also used FreeCAD Library CC BY 3.0 components; those original source assets are excluded from the public GLB, and their provenance and license are still documented on that credits page. This is an illustrative kinematic scene, not manufacturing data or evidence of manufacturer endorsement.

Unlike a prerendered GIF or MP4, a publicly hosted GLB contains extractable polygonal geometry and is **downloadable by any viewer**. The public gallery intentionally distributes this reduced mesh. No access credentials or private Drive file IDs are included.

The gearbox speed control uses a purely kinematic relation. The animation preserves the original mesh geometry and rotates input, intermediate and output shaft groups about parallel axes at x=0, x=60 mm, and x=120 mm, with speed factors +1, −1/2 and +1/4. This does not simulate load, friction, bearing life or motor performance.
