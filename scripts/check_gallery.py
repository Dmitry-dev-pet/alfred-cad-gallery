#!/usr/bin/env python3
"""Smoke-test public media, original GLB node names, and physics.

Uses only the Python standard library; intended to run before each Pages deploy.
"""
from __future__ import annotations

from hashlib import sha256
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "web" / "media"

EXPECTED = {
    "gearbox-public.glb": ("490ed7e58b5d1dae470123a222fd5e953342552092e8917d3f688fbaba1f1386", 1133296),
    "rod-pendulum.glb": ("4762bfbc79925a7cae88b6ef4728122a76e11940efc4e9a9c0853881ecda54f6", 107580),
    "collar-pendulum.glb": ("f99fa4cff1ef6f1aad1df65513bc60247016f59b510ab0bd3beaad5727be28e0", 136788),
    "pivot-pendulum.mp4": ("ced4650d211ce4aa8765b71cda70b0256fd7e30e3d8c1046721684a0e16f0c2d", 388486),
    "collar-pendulum.mp4": ("c0a26470733cf3a2a08b1c16525367c34836c1a9339854210ada85ec7249b625", 482041),
    "pivot-plot.png": ("5251b7d05db42ea99ad18103bfb98a6cdd9b74dd421f4c4d1b46ce115a708cc4", 105124),
    "collar-plot.png": ("2e5eafe93794be4d6ca707aed4d174efcb8f5e02da1ac9c18a1301897aba1974", 115050),
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
    assert index.count('class="model-stage"') == 2
    assert 'drive.google.com' not in index
    assert 'importmap' in index and "three@0.180.0" in index

    print("PASS: 7 binary assets have exact source digests")
    print("PASS: both GLBs preserve original FreeCAD node names")
    print("PASS: physical periods match source experiments")
    print("PASS: public gearbox is sanitized: 74 meshes, no OEM solids")
    print("PASS: website references and publication boundaries")


if __name__ == "__main__":
    main()
