#!/usr/bin/env python3
"""Lightweight, stdlib-only regression checks for FreeCAD Stage-5 3D export."""
import json
from pathlib import Path
import struct
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
MEDIA=WEB/'media'

def main():
    data=(MEDIA/'three-speed-stage5.glb').read_bytes()
    assert data[:4]==b'glTF'
    version,sz=struct.unpack_from('<II',data,4)
    assert version==2 and sz==len(data)
    n,t=struct.unpack_from('<I4s',data,12)
    assert t==b'JSON'
    gltf=json.loads(data[20:20+n].decode('utf-8'))
    names={node.get('name') for node in gltf['nodes']}
    required={'GearInput1','GearInput2','GearInput3','GearOutput1','GearOutput2','GearOutput3',
       'InputShaft','NativeOutputShaft','NativeSleeveA','NativeSleeveB','NativeShiftRailA','NativeShiftRailB',
       'NativeShiftForkA','NativeShiftForkB','NativeShiftLever','InterlockPin','InterlockBridge'}
    assert required<=names,required-names
    assert len(gltf['meshes'])==34,len(gltf['meshes'])
    primitives=[p for m in gltf['meshes'] for p in m['primitives']]
    assert len(primitives)==34
    assert all('POSITION' in p['attributes'] and 'NORMAL' in p['attributes'] for p in primitives)
    faces=sum(gltf['accessors'][p['indices']]['count']//3 for p in primitives)
    assert faces==51534,faces
    assert not gltf.get('extensionsRequired')
    for file in ('three-speed-poses.json','three-speed-spin-poses.json'):
        assert (MEDIA/file).is_file()
    states=json.loads((MEDIA/'three-speed-poses.json').read_text())
    assert set(states)=={'0','1','2','3'}
    assert states['1']['solved']['rail_A_mm']==-3
    assert states['2']['solved']['rail_A_mm']==3
    assert states['3']['solved']['rail_B_mm']==-3
    assert states['3']['solved']['pin_shift_mm']==-.75
    code=(WEB/'three-speed.js').read_text()
    assert '18/42,24/36,30/30' in code
    assert 'NativeShiftLever' in code and 'InterlockPin' in code
    assert 'GLTFLoader' in code and 'OrbitControls' in code
    page=(WEB/'three-speed.html').read_text()
    assert 'three-speed.js' in page and 'three-speed.css' in page
    assert 'three-speed.html' in (WEB/'index.html').read_text()
    assert 'drive.google.com' not in page and 'drive.google.com' not in code
    print(f'PASS: stage-5 FreeCAD GLB: 34 named meshes, {faces} triangles, all 34 normals')
    print('PASS: 4 FreeCAD solver poses, gear ratios, direct browser controls, gallery link')

if __name__=='__main__':main()
