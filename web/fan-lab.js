import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Educational, lumped-capacitance heat transfer model, NOT a CFD solution.
// C·dT/dt = P − G(T − Tamb). The values are deliberately illustrative.
const AMBIENT = 25;
const CAPACITY = 170;        // J/K, assumed thermal capacitance
const POWER = 40;           // W during 0–8 min only
const HEAT_MIN = 8;
const END_MIN = 12;
const SIM_SECONDS_PER_WALL_SECOND = 20; // 12 simulated min / 36 s at 1×
const els = {};
for (const id of ['stage','loadState','rpm','rpmVal','playback','playbackVal','time','timeVal','duct','flow','pause','reset','camera','fullscreen','phase','modelNote','tempOpen','tempDuct','tempOpenStage','tempDuctStage','labelDuct','chart']) els[id]=document.getElementById(id);
const params = {rpm:1200, playback:1, minute:0, paused:false, duct:true, flow:true};

function conductance(rpm, duct) {
  const fanFraction = Math.sqrt(Math.max(0, rpm) / 1200);
  return 0.23 + (duct ? 1.25 : 0.80) * fanFraction; // W/K assumed
}
function temperature(minute, rpm, duct) {
  const G=conductance(rpm,duct), tau=CAPACITY/G;
  const t=Math.max(0,Math.min(minute,END_MIN))*60;
  const tHeat=Math.min(t,HEAT_MIN*60);
  const rise=(POWER/G)*(1-Math.exp(-tHeat/tau));
  return AMBIENT+rise*Math.exp(-Math.max(0,t-HEAT_MIN*60)/tau);
}
function niceTime(m){const seconds=Math.round(m*60);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
const fixed=x=>x.toFixed(1).replace('.',',');

function updateLabels(){
  els.rpmVal.textContent=`${params.rpm} об/мин`;
  els.playbackVal.textContent=`${fixed(params.playback)}×`;
  els.timeVal.textContent=`${niceTime(params.minute)} / 12:00`;
  els.phase.textContent=params.minute<HEAT_MIN?'Нагрев · 40 Вт':'Охлаждение · 0 Вт';
  els.time.value=String(params.minute);
  const open=temperature(params.minute,params.rpm,false);
  const duct=temperature(params.minute,params.rpm,params.duct);
  els.tempOpen.textContent=els.tempOpenStage.textContent=`${fixed(open)} °C`;
  els.tempDuct.textContent=els.tempDuctStage.textContent=`${fixed(duct)} °C`;
  els.labelDuct.textContent=params.duct?"С ВОЗДУХОВОДОМ":"БЕЗ ВОЗДУХОВОДА";
  els.pause.textContent=params.paused?'▶ Продолжить':'⏸ Пауза';
  els.pause.setAttribute('aria-pressed', String(params.paused));
  if(world)updateVisuals(open,duct);
  drawChart();
}

let world=null;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0c202c);
scene.fog=new THREE.Fog(0x0c202c,.65,1.45);
const camera=new THREE.PerspectiveCamera(37,1,.005,30);
camera.up.set(0,0,1);
const homeCamera=new THREE.Vector3(.26,-.31,.235);
camera.position.copy(homeCamera);
const focus=new THREE.Vector3(0,0,.029);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.45;
els.stage.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.target.copy(focus);orbit.enableDamping=true;orbit.dampingFactor=.075;
orbit.minDistance=.19;orbit.maxDistance=1.15;
orbit.maxPolarAngle=Math.PI;orbit.minPolarAngle=0;
// Non-zero ambient illumination and studio directional sources make true CAD shapes visible.
scene.add(new THREE.HemisphereLight(0xdbf6ff,0x122735,2.3));
const key=new THREE.DirectionalLight(0xe6fff1,3.2);key.position.set(-.18,-.18,.32);scene.add(key);
const rim=new THREE.DirectionalLight(0x93c9ff,1.6);rim.position.set(.22,.14,.23);scene.add(rim);
const fill=new THREE.DirectionalLight(0xd9f2ff,.9);fill.position.set(.15,-.24,.12);scene.add(fill);

const floorMat=new THREE.MeshStandardMaterial({color:0x203d48,roughness:.88,metalness:.1,side:THREE.DoubleSide});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(.9,.55),floorMat);floor.position.z=-.029;scene.add(floor);
const grid=new THREE.GridHelper(.52,20,0x345964,0x254550);
grid.rotation.x=Math.PI/2; grid.position.z=-.028;scene.add(grid);

function initialView(){camera.position.copy(homeCamera);orbit.target.copy(focus);orbit.update();}
function colorHeat(mesh,T){
  // Only visualization (not a solved spatial thermal field).
  const normalized=Math.min(1,Math.max(0,(T-25)/75));
  const cold=new THREE.Color(0x9db8c8), warm=new THREE.Color(0xf0a86d),hot=new THREE.Color(0xe05235);
  const color=normalized<.5?cold.lerp(warm,normalized*2):warm.lerp(hot,(normalized-.5)*2);
  mesh.material.color.copy(color);
}
function particleCloud(group, duct){
  const count=68;
  const coords=new Float32Array(count*3), offsets=[];
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*.047;
    offsets.push({x:r*Math.cos(a),y:r*Math.sin(a),progress:Math.random()});
    coords[3*i]=offsets[i].x;coords[3*i+1]=offsets[i].y;coords[3*i+2]=.005+offsets[i].progress*.08;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(coords,3));
  const dots=new THREE.Points(geo,new THREE.PointsMaterial({color:duct?0x8cffe6:0x99ceff,size:.0027,transparent:true,opacity:.73,depthWrite:false}));
  group.add(dots);
  return {dots,offsets,geometry:geo,duct};
}
function updateParticles(cloud,dt){
  const positions=cloud.geometry.attributes.position;
  const speed=(.025+params.rpm/2400*.09)*dt;
  for(let i=0;i<cloud.offsets.length;i++){
    const p=cloud.offsets[i];p.progress=(p.progress+speed)%1;
    const z=.078-p.progress*.08;
    const bypass=!cloud.duct&&p.x*p.x+p.y*p.y>.035*.035;
    const lateral=bypass?Math.max(0,(.044-z)*9):0;
    positions.setXYZ(i,p.x*(1+lateral),p.y*(1+lateral),z);
  }
  positions.needsUpdate=true;
  cloud.dots.visible=params.flow&&params.rpm>0&&(cloud.duct?params.duct:true);
}
function normalizeMaterial(root){
  root.traverse(child=>{
    if(!child.isMesh)return;
    // STEP-derived glTF may omit NORMAL attributes; avoid dark/black PBR faces.
    if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
    child.material=child.material.clone();
    child.material.side=THREE.DoubleSide;
    child.material.roughness=.65;
    child.material.metalness=.17;
    if(child.name==='HeatSink'){
      child.material=new THREE.MeshStandardMaterial({color:0xa3bccc,metalness:.35,roughness:.49,side:THREE.DoubleSide});
    } else if(child.name==='HeaterEnvelope'){
      child.material=new THREE.MeshStandardMaterial({color:0xc6703f,metalness:.1,roughness:.62,side:THREE.DoubleSide});
    } else if(child.name==='Shroud'){
      child.material=new THREE.MeshStandardMaterial({color:0x39baa4,metalness:.1,roughness:.43,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});
    }
    child.castShadow=false;child.receiveShadow=false;
  });
}
function assemble(gltf,index){
  const group=new THREE.Group();
  group.position.x=index===0?-.102:.102;
  const model=gltf.scene.clone(true);
  normalizeMaterial(model);
  const rotor=model.getObjectByName('FanRotor');
  const heatsink=model.getObjectByName('HeatSink');
  const shroud=model.getObjectByName('Shroud');
  if(!rotor||!heatsink||!shroud)throw new Error('GLB missing original CAD nodes');
  // Trimesh encoded vertices in assembly/world coordinates; rotate around actual fan axis.
  const parent=rotor.parent;parent.remove(rotor);
  const pivot=new THREE.Group(); pivot.name='FanRotorPivot';pivot.position.z=.060;
  rotor.position.z-=.060;pivot.add(rotor);parent.add(pivot);
  if(index===0)shroud.visible=false;
  group.add(model);scene.add(group);
  const clouds=particleCloud(group,index===1);
  return {group,pivot,heatsink,shroud,clouds};
}
function updateVisuals(open,duct){
  const [left,right]=world;
  colorHeat(left.heatsink,open);colorHeat(right.heatsink,duct);
  right.shroud.visible=params.duct;
  right.clouds.dots.visible=params.flow&&params.rpm>0;
  right.clouds.duct=params.duct;
}
new GLTFLoader().load('./media/fan-cooling-public.glb',gltf=>{
  try{
    world=[assemble(gltf,0),assemble(gltf,1)];
    els.loadState.remove();
    updateLabels();
  }catch(err){els.loadState.textContent='Ошибка чтения CAD-компонентов: '+err.message;console.error(err);}
},undefined,err=>{els.loadState.textContent='Не удалось загрузить GLB. Проверьте соединение и обновите страницу.';console.error(err);});

function measure(){
  const w=Math.max(2,els.stage.clientWidth),h=Math.max(2,els.stage.clientHeight);
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
window.addEventListener('resize',()=>{measure();drawChart();});
const resizeObserver=new ResizeObserver(()=>{measure();drawChart();});resizeObserver.observe(els.stage);

// A resolution independent canvas plot, continuously recalculated when RPM changes.
function drawChart(){
  const canvas=els.chart;const rect=canvas.getBoundingClientRect();
  if(rect.width<1||rect.height<1)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const width=rect.width,height=rect.height,pad={l:43,r:18,t:17,b:30};
  const plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
  const maxT=Math.max(80,...[false,params.duct].map(d=>temperature(HEAT_MIN,params.rpm,d)))*1.08;
  const y=t=>pad.t+(maxT-t)/(maxT-20)*plotH;
  const x=t=>pad.l+t/12*plotW;
  ctx.clearRect(0,0,width,height);
  ctx.font='10px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let i=0;i<5;i++){
    const v=20+(maxT-20)*i/4;const yp=y(v);
    ctx.strokeStyle='#33535b';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(pad.l,yp);ctx.lineTo(width-pad.r,yp);ctx.stroke();
    ctx.fillStyle='#a7c2c8';ctx.fillText(`${Math.round(v)}°`,pad.l-7,yp);
  }
  ctx.textAlign='center';ctx.textBaseline='top';
  for(const minute of [0,2,4,6,8,10,12]){
    ctx.fillStyle='#aac5cb';ctx.fillText(String(minute),x(minute),height-pad.b+7);
  }
  ctx.strokeStyle='#6a8b94';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(x(8),pad.t);ctx.lineTo(x(8),height-pad.b);ctx.stroke();ctx.setLineDash([]);
  for(const [duct,color] of [[false,'#ffb77c'],[true,'#b4eec9']]){
    ctx.beginPath();for(let i=0;i<=180;i++){const t=i/15;const X=x(t),Y=y(temperature(t,params.rpm,duct&&params.duct));i===0?ctx.moveTo(X,Y):ctx.lineTo(X,Y);}
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
    const currentX=x(params.minute),currentY=y(temperature(params.minute,params.rpm,duct&&params.duct));
    ctx.beginPath();ctx.arc(currentX,currentY,4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  }
  ctx.strokeStyle='#ffffff6e';ctx.beginPath();ctx.moveTo(x(params.minute),pad.t);ctx.lineTo(x(params.minute),height-pad.b);ctx.stroke();
}

els.rpm.addEventListener('input',e=>{params.rpm=Number(e.target.value);updateLabels();});
els.playback.addEventListener('input',e=>{params.playback=Number(e.target.value);updateLabels();});
els.time.addEventListener('input',e=>{params.minute=Number(e.target.value);params.paused=true;updateLabels();});
els.duct.addEventListener('change',e=>{params.duct=e.target.checked;updateLabels();});
els.flow.addEventListener('change',e=>{params.flow=e.target.checked;updateLabels();});
els.pause.addEventListener('click',()=>{if(params.minute>=END_MIN&&!params.paused)params.minute=0;params.paused=!params.paused;updateLabels();});
els.reset.addEventListener('click',()=>{params.minute=0;params.paused=false;updateLabels();});
els.camera.addEventListener('click',initialView);
els.fullscreen.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else els.stage.requestFullscreen?.();});
document.addEventListener('fullscreenchange',()=>{els.fullscreen.textContent=document.fullscreenElement?'⤫ Свернуть':'⛶ На весь экран';measure();});
const timer=new THREE.Clock();
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,timer.getDelta());
  if(!params.paused&&params.minute<END_MIN){params.minute=Math.min(END_MIN,params.minute+dt*params.playback*SIM_SECONDS_PER_WALL_SECOND/60);if(Math.round(params.minute*20)!==Math.round((params.minute-dt*params.playback*SIM_SECONDS_PER_WALL_SECOND/60)*20)||params.minute===END_MIN)updateLabels();}
  if(world && !params.paused){for(const o of world){o.pivot.rotation.z+=params.rpm/60*Math.PI*2*dt;updateParticles(o.clouds,dt);}}
  orbit.update();renderer.render(scene,camera);
}
measure();updateLabels();frame();
