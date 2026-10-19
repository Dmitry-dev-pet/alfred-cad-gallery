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
    assert 'computeVertexNormals()' in js, 'Missing normal fallback for original CAD'
    assert 'if(world && !params.paused)' in js, 'Pause must freeze rotor and air particles'
    assert '.stage:fullscreen' in (WEB/'fan-lab.css').read_text()
    home=(WEB/'index.html').read_text()
    assert 'THERMOPHYSICS / #04' in home and 'href="./fan-lab.html"' in home
    assert 'Все / 05' in home and 'Физика / 03' in home
    thumbnail=(WEB/'media/fan-cooling-card.webp').read_bytes()
    assert len(thumbnail)==30610
    assert hashlib.sha256(thumbnail).hexdigest()=='da5be44dc4a833d681a80e84a51f12b9f7bc8cfbc6ae3a43d0ec80c9e731fa41'
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
