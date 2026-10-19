#!/usr/bin/env python3
"""Static validation of the real CAD interactive fan lab and its educational model."""
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
DATA=WEB/'media/fan-cooling-public.glb'
MANIFEST=WEB/'media/fan-cooling-public.manifest.json'

def main():
    data=DATA.read_bytes()
    manifest=json.loads(MANIFEST.read_text())
    assert hashlib.sha256(data).hexdigest()==manifest['sha256']
    assert len(data)==manifest['size_bytes']
    assert data[:4]==b'glTF'
    ver,sz=struct.unpack_from('<II',data,4)
    assert (ver,sz)==(2,len(data))
    count,typ=struct.unpack_from('<I4s',data,12)
    assert typ==b'JSON'
    gltf=json.loads(data[20:20+count].decode('utf-8').rstrip(' \x00'))
    names={v['name'] for v in gltf['nodes'] if 'name' in v}
    assert {'FanRotor','FanHousing','HeatSink','Shroud','HeaterEnvelope'}<=names
    assert len(manifest['components'])==25
    assert not gltf.get('extensionsRequired')
    # Third-party CAD parts are declared as CC0 or CC BY with source attribution.
    assert manifest['sources']['fan']=='Innerscene CC0'
    assert 'CC-BY' in manifest['sources']['bolts']
    js=(WEB/'fan-lab.js').read_text()
    html=(WEB/'fan-lab.html').read_text()
    for name in ['rpm','playback','time','duct','flow','pause','reset','camera','fullscreen','chart']:
        assert f'id="{name}"' in html, name
    for symbol in ['GLTFLoader','OrbitControls','FanRotor','HeaterEnvelope','temperature','conductance','requestAnimationFrame','Math.sqrt']:
        assert symbol in js,symbol
    assert 'https://cdn.jsdelivr.net/npm/three@0.180.0' in html
    assert 'Не подтверждён' not in html or 'учебн' in html
    # Direct test of the educational heat equation parameters.
    ambient,power,cap,heat_minutes=25,40,170,8
    def T(m, rpm, duct):
        G=.23+(1.25 if duct else .8)*math.sqrt(max(0,rpm)/1200)
        rise=(power/G)*(1-math.exp(-min(m,heat_minutes)*60*G/cap))
        return ambient+rise*math.exp(-max(0,m-heat_minutes)*60*G/cap)
    assert T(0,1200,False)==T(0,1200,True)==25
    assert T(8,1200,True)<T(8,1200,False)
    assert T(12,1200,True)<T(8,1200,True)
    assert T(8,2200,False)<T(8,600,False)
    print('Fan Lab checks passed:',len(data),'bytes,',len(names),'GLB nodes, 10 controls')

if __name__=='__main__':main()
