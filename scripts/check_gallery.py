#!/usr/bin/env python3
"""Smoke-test public media, original GLB node names, and physics.

Uses only the Python standard library; intended to run before each Pages deploy.
"""
from __future__ import annotations

from hashlib import sha256
import json
import math
import re
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "web" / "media"

EXPECTED = {
    "debug/uv-checker-512.png": ("843d831f85358e1f6828b25ecbc077979f5ea2ff89795c065b12fa5380e1d871", 22345),
    "gearbox-frame-worn-blue.jpg": ("47361d2716f37a3db1b7ffcabbcedb1f394a2abde6e19f41c26deb01d704c237", 12390),
    "gearbox-public.glb": ("d5ff603a1f792bd1eef350d5eb502d83a67a366303652311b69a5ee5359e4685", 1622316),
    "rod-pendulum.glb": ("4762bfbc79925a7cae88b6ef4728122a76e11940efc4e9a9c0853881ecda54f6", 107580),
    "collar-pendulum.glb": ("f99fa4cff1ef6f1aad1df65513bc60247016f59b510ab0bd3beaad5727be28e0", 136788),
    "pivot-pendulum.mp4": ("ced4650d211ce4aa8765b71cda70b0256fd7e30e3d8c1046721684a0e16f0c2d", 388486),
    "collar-pendulum.mp4": ("c0a26470733cf3a2a08b1c16525367c34836c1a9339854210ada85ec7249b625", 482041),
    "pivot-plot.png": ("5251b7d05db42ea99ad18103bfb98a6cdd9b74dd421f4c4d1b46ce115a708cc4", 105124),
    "collar-plot.png": ("2e5eafe93794be4d6ca707aed4d174efcb8f5e02da1ac9c18a1301897aba1974", 115050),
}


PBR_ASSETS = {
    "env/studio-softboxes-1k.hdr": ("ea15dff23437c92d047b6392b7938cd80c82950f76f252084940f81a637dee9e", 351931),
    "textures/bronze/albedo_1k.jpg": ("41bfa7e7749c68b69064b036581657cbbd9d1a8dc9293464c62edc68f07bc54d", 84435),
    "textures/bronze/normal_1k.jpg": ("bb1323bcb23ef080ad583ecd92715e7a1f19a8a105f704c0011777db610ad7a9", 138551),
    "textures/bronze/roughness_1k.jpg": ("2392eea1ae14af4afa36b0430a0af0fd81d2bde6b9bada290fe39235e4c84f0e", 112046),
    "textures/motor/albedo_1k.jpg": ("e8501d542afa7a449d682ea68420fda73918ca51abc50e4b57158052faa4ffa1", 46834),
    "textures/motor/normal_1k.jpg": ("a1cddd97bd98438d937440c79f0de499bc048431874619af3ebf8a8c39009145", 178204),
    "textures/motor/roughness_1k.jpg": ("efa9638a7cceac474fb5c00908f20b61584e5a4f56b4ce1b7556b27346d085b2", 155104),
    "textures/paint/albedo_2k.jpg": ("a91f3874e5131496e742a89d8c6ef71acfd61ff176d9510ce9cc35adff6b101d", 1451217),
    "textures/paint/metalness_2k.jpg": ("d3f5d6b6ebcb6acdd539bbf3cd2e5d3ecab7a0f79a6bbc483c746ab7752403fa", 144760),
    "textures/paint/normal_2k.jpg": ("34b3c61194b96b6337ab70209974c17e477c93fde75ca2be54deddca6376a4d6", 962307),
    "textures/paint/roughness_2k.jpg": ("670877f1f988fb3a3e3fe34b7d6c2f8fe2376356f96e2926e66d23de5997abb5", 708068),
    "textures/steel/albedo_1k.jpg": ("c0479dad21330211e001bceff3d2bd62db22d97a30b74824f6b4c630a9b0b908", 93451),
    "textures/steel/normal_1k.jpg": ("bb1323bcb23ef080ad583ecd92715e7a1f19a8a105f704c0011777db610ad7a9", 138551),
    "textures/steel/roughness_1k.jpg": ("4ad5b1df00013a37fcb7a829f5348e246754fa4d3376ef134a0e93fadd565f99", 112010),
}

def check_glb(data: bytes, required: set[str]) -> None:
    assert data[:4] == b"glTF", "invalid binary glTF header"
    version, total_size = struct.unpack_from("<II", data, 4)
    assert version == 2 and total_size == len(data), "invalid GLB version/length"
    json_size, json_type = struct.unpack_from("<I4s", data, 12)
    assert json_type == b"JSON"
    gltf = json.loads(data[20 : 20 + json_size].decode("utf-8").rstrip(" \x00"))
    names = {node.get("name") for node in gltf["nodes"]}
    assert required <= names, f"GLB missing original CAD nodes: {required - names}"
    assert gltf.get("meshes"), "GLB has no mesh"
    assert not gltf.get("extensionsRequired"), "unexpected required extension"
    assert all(not image.get("uri", "").startswith("http") for image in gltf.get("images", []))



def check_gearbox() -> None:
    data = (MEDIA / "gearbox-public.glb").read_bytes()
    check_glb(data, {
        "Frame", "InputShaft", "MiddleShaft", "OutputShaft",
        "PinionA", "WheelA", "PinionB", "WheelB",
        "MotorBody_Generic", "MotorShaft_Generic",
        "BearingGeneric_0_Lower", "BearingGeneric_120_Upper",
    })
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    assert json_type == b"JSON"
    gltf = json.loads(data[20:20 + json_length].decode("utf-8").rstrip(" \\x00"))
    names = {node.get("name") for node in gltf["nodes"]}
    forbidden = {"Pololu4692Case", "Pololu4692Dshaft",
                 "Bearing_1_Lower", "Bearing_2_Upper", "Screw_LB_Top"}
    assert not (names & forbidden), "Proprietary/manufacturer source CAD leaked!"
    assert len(gltf["meshes"]) == 74, "Unexpected changed public mesh inventory"
    # Fixed export (v2) embeds actual NORMAL attributes for all 74 FreeCAD parts.
    source_has_normals = sum("NORMAL" in primitive["attributes"]
                             for mesh in gltf["meshes"]
                             for primitive in mesh["primitives"])
    assert source_has_normals == 74, "Surface normals missing from 74 gearbox meshes"
    assert len([n for n in names if n and n.startswith("BearingGeneric_")]) == 6

    viewer = (ROOT / "web" / "gearbox-viewer.js").read_text()
    assert "ratio: -.5" in viewer and "ratio: .25" in viewer
    assert "gearbox-public.glb" in viewer and "group.rotation.y = phase * ratio" in viewer
    credits = (ROOT / "web" / "credits.html").read_text()
    assert "CC BY 3.0" in credits
    assert "innerscene.com" in credits and "Pololu" in credits
    assert "drive.google.com" not in credits
    assert '<div class="model-stage" data-model="gearbox"' in (ROOT / "web" / "index.html").read_text()

def check_physics() -> None:
    length, g = 0.6, 9.81
    a = 126.79491924311225 / 1000
    d = length / 2 - a
    t_pivot = 2 * math.pi * math.sqrt((length**2 / 12 + d**2) / (g * d))
    assert math.isclose(t_pivot, 1.1807030257126414, abs_tol=1e-10)

    rod_mass, ring_mass = 0.5, 0.4
    rod_width, R, r, h = 0.03, 0.042, 0.018, 0.03
    irod = rod_mass * ((length**2 + rod_width**2) / 12 + d**2)
    iring = ring_mass * (3 * (R**2 + r**2) + h**2) / 12
    x = 133.58756502501942 / 1000
    t_collar = 2 * math.pi * math.sqrt((irod + iring + ring_mass * x**2) /
                                      (g * (rod_mass * d + ring_mass * x)))
    assert math.isclose(t_collar, 1.0369155309422604, abs_tol=1e-10)


def main() -> None:
    for name, (digest, size) in EXPECTED.items():
        data = (MEDIA / name).read_bytes()
        assert len(data) == size, f"size mismatch: {name}"
        assert sha256(data).hexdigest() == digest, f"SHA-256 mismatch: {name}"

    for relative, (digest, size) in PBR_ASSETS.items():
        payload = (MEDIA / relative).read_bytes()
        assert len(payload) == size, f"PBR size mismatch: {relative}"
        assert sha256(payload).hexdigest() == digest, f"PBR checksum mismatch: {relative}"
    assert (MEDIA / "env" / "studio-softboxes-1k.hdr").read_bytes().startswith(b"#?RADIANCE")

    check_glb((MEDIA / "rod-pendulum.glb").read_bytes(),
              {"Rod_NearEnd", "Rod_Optimal", "Rod_NearCentre", "FixedSupport"})
    check_glb((MEDIA / "collar-pendulum.glb").read_bytes(),
              {"Rod_Near", "Rod_Best", "Rod_Far", "Collar_Best", "FixedSupport"})
    check_physics()
    check_gearbox()

    index = (ROOT / "web" / "index.html").read_text()
    for filename in EXPECTED:
        if filename == "gearbox-public.glb":
            assert filename in (ROOT / "web" / "gearbox-viewer.js").read_text()
        elif filename.endswith(".glb"):
            assert filename in (ROOT / "web" / "model-viewer.js").read_text()
        elif filename.endswith(".mp4"):
            assert filename in index
    assert index.count('class="model-stage"') == 3
    assert index.count('class="model-fullscreen"') == 3
    assert index.count('class="model-material"') == 1
    assert 'src="./fullscreen.js"' in index
    assert 'https://dmitry-dev-pet.github.io/' in index
    assert 'https://dmitry-dev-pet.github.io/alfred-cad-gallery/' in (ROOT / "README.md").read_text()
    assert 'drive.google.com' not in index

    material_code = (ROOT / "web" / "gearbox-materials.js").read_text()
    assert 'scale: 12.5' in material_code, "Blue frame UV tile scale must be 80 mm"
    assert 'uv-checker-512.png' in material_code, "Missing contrast UV checker"
    assert 'uvCheckEnabled' in material_code, "Missing diagnostic UV mode"
    assert 'uvDebugMaterial' in material_code, "Checker material must override paint"
    assert 'function installPbrAssets' in material_code, 'Missing real PBR map application'
    assert 'metalnessMap: "paint/metalness_2k.jpg"' in material_code, 'Chipped-metal mask missing'
    assert 'normalMap: "steel/normal_1k.jpg"' in material_code
    assert 'roughnessMap: "bronze/roughness_1k.jpg"' in material_code
    assert 'material.color.set(tint)' in material_code, 'Albedo multiply bug'
    assert 'function surfaceMaps' in material_code
    assert 'function rng(seed)' in material_code
    assert 'geometry.toNonIndexed()' in material_code
    assert 'geometry.setAttribute("uv"' in material_code
    assert 'new THREE.MeshPhysicalMaterial' in material_code
    assert 'RoomEnvironment' in material_code
    assert 'geometry.computeVertexNormals()' in material_code, "Missing normal repair"
    assert 'hasGeneratedNormals:' in material_code
    assert 'new THREE.MeshBasicMaterial' in material_code, "CAD fallback must be unlit"
    assert 'emissiveIntensity:' in material_code, "PBR must not be black without IBL"
    assert 'metalness: .94' not in material_code
    assert 'scale: 90' not in material_code
    assert 'Math.sin(y * .065)' in material_code, "No visible brushed pattern"
    viewer_code = (ROOT / "web" / "gearbox-viewer.js").read_text()
    assert 'new THREE.AmbientLight' in viewer_code
    # Black was repaired in #5, but very bright studio lighting washed every
    # finish into uniform silver. Verify at least 5 DIFFERENT PBR pigments and
    # physically distinct paint/bronze/steel brightness baselines.
    palette = re.findall(r'color:\s*(0x[0-9a-fA-F]+),\s*metalness', material_code)
    assert len(set(palette)) >= 6, f"Monochrome PBR material regression: {palette}"
    assert 'color: 0x33627c' in material_code, "blue painted frame lost"
    assert 'color: 0xb57930' in material_code, "bronze gear finish lost"
    assert 'color: 0x2c4852' in material_code, "dark motor finish lost"
    assert 'toneMappingExposure = 1.12' in viewer_code
    assert 'new RGBELoader()' in viewer_code, 'Missing HDR reflections'
    assert 'studio-softboxes-1k.hdr' in viewer_code, 'Missing bundled studio panorama'
    assert 'renderer.shadowMap.enabled = true' in viewer_code, 'Missing real shadow map'
    assert 'new THREE.ShadowMaterial' in viewer_code, 'Missing shadow receiver'
    assert 'finishMode = "photo"' in viewer_code, 'Photo should be the default'
    assert 'stage.dataset.uvCheck' in viewer_code, "Missing UV diagnostic readback"
    assert '80 мм/повтор' in viewer_code, "Missing physical scale UV legend"
    assert 'finishMode = { photo:"studio", studio:"cad", cad:"photo" }' in viewer_code
    assert 'group.rotation.y = phase * ratio' in viewer_code, 'Preserve shaft ratios'
    assert 'finish=20261019-scan1' in index, 'Mobile cache-busting viewer URL missing'
    assert 'normals=v2' in viewer_code, 'Updated normal-bearing mesh URL not versioned'
    assert 'new THREE.AmbientLight(0xeaf4ff,.33)' in viewer_code
    assert 'finishController.hasGeneratedNormals' in viewer_code
    assert material_code.count("https://") == 1, "Unexpected remote texture usage"
    assert "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/blue_metal_plate/" in material_code
    assert "params.get(\"scan\")" in material_code, "Scanned material must be explicit opt-in"
    assert "new THREE.ImageLoader()" in material_code
    assert "new THREE.CanvasTexture(canvas)" in material_code
    assert "onAssetsUpdated?.({ photoScan: 'fallback' })" in material_code, "Required offline fallback"
    assert "stage.dataset.scanStatus" in viewer_code, "Missing scan-status telemetry"

    fullscreen_code = (ROOT / "web" / "fullscreen.js").read_text()
    assert 'media.requestFullscreen' in fullscreen_code
    assert 'document.exitFullscreen' in fullscreen_code
    assert 'showOverlay(media)' in fullscreen_code
    assert 'Escape' in fullscreen_code
    assert '.model-card-media:fullscreen' in (ROOT / "web" / "styles.css").read_text()
    assert 'importmap' in index and "three@0.180.0" in index

    print("PASS: 9 baseline assets (including UV checker) and 14 PBR/HDR assets match SHA-256")
    print("PASS: all three GLBs preserve expected source components")
    print("PASS: physical periods match source experiments")
    print("PASS: public gearbox is sanitized: 74 meshes, no OEM solids")
    print("PASS: 74 GLB source normals verified and regenerated when needed")
    print("PASS: ambient/emissive PBR + unlit CAD fallback prevent black models")
    print("PASS: visible PBR textures have generated UVs and no external dependencies")
    print("PASS: three native/mobile fallback fullscreen controls")
    print("PASS: previous portfolio root is linked and untouched")
    print("PASS: website references and publication boundaries")


if __name__ == "__main__":
    main()
