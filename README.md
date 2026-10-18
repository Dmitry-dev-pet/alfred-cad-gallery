# Alfred CAD Lab

A public, bilingual **FreeCAD + Blender + physics** gallery hosted with GitHub Pages.

**Site:** https://dmitry-dev-pet.github.io/alfred-cad-gallery/

## Experiments

- **Two-stage gearbox (4:1):** a deliberately schematic animation. The private editable CAD assembly contains third-party components and is not included in the public site.
- **Physical pendulum:** three genuine FreeCAD models with different pivot locations. Minimum small-angle period **1.180703 s** for a 600 mm homogeneous rod, with pivot **126.794919 mm** from the top.
- **Sliding-collar pendulum:** three genuine FreeCAD models with different fixed collar positions. Minimum small-angle period **1.0369155 s** at **133.587565 mm** below the pivot.

The two physics cards load original FreeCAD geometry converted into **GLB (glTF binary)** via **Three.js 0.180.0** with OrbitControls. Each configuration is independently animated in the browser using the physically calculated period; these are not recordings of a live FreeCAD process. The original FreeCAD MP4 videos are available as fallback in `web/media/`.

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
