import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// The meshes, part names, and four lever/rail poses are exported from the
// original FreeCAD 1.1.4 Stage-5 CAD document. The browser is only a kinematic
// visualizer; no unilateral contact/force dynamics are calculated in Three.js.
const $ = (id) => document.getElementById(id);
const ratios = [null,18/42,24/36,30/30];
const teeth = [null,'18 → 42 зуба','24 → 36 зубьев','30 → 30 зубьев'];
const names = [null,'Первая передача','Вторая передача','Третья передача'];
const stageNotes = [
  'Шестерни зацеплены постоянно; выходной вал не вращается.',
  'Муфта A сдвинута вниз на 3 мм и замыкает первую пару.',
  'Муфта A сдвинута вверх на 3 мм и замыкает вторую пару.',
  'Муфта B сдвинута вниз на 3 мм, шток A заблокирован.'
];
const shiftStageLabels = {
  release: 'Освобождение муфты',
  select: 'Выбор штока',
  align: 'Совмещение кулачков',
  engage: 'Включение передачи'
};
const modelPath = './media/three-speed-stage5.glb?v=20261019-1';
const posePath = './media/three-speed-poses.json?v=20261019-1';
const spinPath = './media/three-speed-spin-poses.json?v=20261019-1';
let rpm = 60;
let gear = 0;
let activeGear = 0;
let playing = true;
let transition = null;
let inputAngle = 0;
let shaftAngle = 0;
let parts = {};
let gearMeshes = [];
const shaftMarkerGroups = [];
let materials = new Map();
let poses = null;
let spinBases = null;
let ready = false;
let xray = false;
let hardware = true;
let currentLeverPose = null;
let cameraFlight = null;
const motion = {a:0,b:0,pin:0};
const rotNodes = new Map();
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setClearColor(0x081722,0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.65;
viewport.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40,1,0.5,1800);
camera.up.set(0,0,1);
const lookAt = new THREE.Vector3(17,38,69);
const cameraStart = new THREE.Vector3(240,-210,179);
camera.position.copy(cameraStart);
const controls = new OrbitControls(camera,renderer.domElement);
controls.target.copy(lookAt);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.maxDistance = 700;
controls.minDistance = 90;
controls.maxPolarAngle = Math.PI * .88;
controls.update();
scene.add(new THREE.HemisphereLight(0xdcefff,0x142635,3.15));
const addLight = (col,intensity,pos) => {
  const light = new THREE.DirectionalLight(col,intensity);
  light.position.set(...pos);
  scene.add(light);
};
addLight(0xffe7c7,3.8,[-120,-90,250]);
addLight(0x7fcaff,2.9,[150,90,190]);
addLight(0xffcf98,1.35,[5,200,80]);
const floor = new THREE.GridHelper(240,16,0x315765,0x223c4a);
floor.rotation.x = Math.PI/2;
floor.position.z=-10;
floor.material.transparent=true;
floor.material.opacity=.30;
scene.add(floor);
const clickRay = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let model = null;
const tempQuat = new THREE.Quaternion();
const tempPos = new THREE.Vector3();
const neutralMatrix = new THREE.Matrix4();
const currentMatrix = new THREE.Matrix4();
const deltaMatrix = new THREE.Matrix4();
const neutralInverse = new THREE.Matrix4();

function setStatus(s) {$('statusText').textContent = s;}
function format(n) {return (Math.abs(n)<.00001?'0':n.toLocaleString('ru-RU',{maximumFractionDigits:1}));}
function updateSpeed() {
  $('inputReadout').innerHTML = `${format(rpm)} <small>об/мин</small>`;
  const output = activeGear ? -rpm*ratios[activeGear] : 0;
  $('outputReadout').innerHTML = `${format(output)} <small>об/мин</small>`;
  $('ratioReadout').textContent = activeGear ? (1/ratios[activeGear]).toFixed(2).replace('.',',')+':1' : '—';
  $('rpmValue').textContent = `${rpm} об/мин`;
}
function updateButtons() {
  document.querySelectorAll('.gear-btn').forEach(b=>{
    const selected=Number(b.dataset.gear)===gear;
    b.classList.toggle('active',selected);
    b.setAttribute('aria-pressed',String(selected));
    b.disabled = Boolean(transition) || !ready;
  });
  $('playPause').textContent = playing ? '⏸ Остановить вращение' : '▶ Запустить вращение';
  $('playPause').disabled = !ready || Boolean(transition);
  $('gearMode').textContent = transition ? 'ПЕРЕКЛЮЧЕНИЕ / ВАЛ ОСТАНОВЛЕН' : (gear ? `${gear}-Я ПЕРЕДАЧА / ВКЛЮЧЕНА` : 'NEUTRAL / ХОЛОСТОЙ ХОД');
  $('currentPair').textContent = transition
    ? `${transition.to ? teeth[transition.to] : 'Нейтраль'} · ${shiftStageLabels[transition.step]}`
    : (gear ? teeth[gear] : 'Нет передачи момента');
  $('gearNote').textContent = transition
    ? 'Следите за подсвеченными деталями: рычаг → шток → вилка → муфта.'
    : stageNotes[gear];
  updateSpeed();
}
function phase(t) {const x=THREE.MathUtils.clamp(t,0,1);return x*x*(3-2*x);}
function setPivot(name,x,y,z=0) {
  const mesh=model.getObjectByName(name);
  if(!mesh) throw new Error('В GLB не найдена деталь '+name);
  const parent=mesh.parent;
  const pivot=new THREE.Group();pivot.name='Axis_'+name;
  parent.add(pivot);
  pivot.position.set(x,y,z);
  pivot.add(mesh);
  // The GLB stores FreeCAD world-space vertices, not locally generated stand-ins.
  mesh.position.sub(new THREE.Vector3(x,y,z));
  rotNodes.set(name,pivot);
  return pivot;
}
// Viewer-only rotation markers. The shaft, gear and clutch shapes remain
// untouched FreeCAD solids. The markers are children of each shaft's pivot,
// so neutral (stationary output) and all three ratios work automatically.
function shaftTipProfile(mesh) {
  const geometry=mesh.geometry;
  const positions=geometry.getAttribute('position');
  if(!positions)return null;
  geometry.computeBoundingBox();
  mesh.updateMatrix();
  const bounds=geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
  const top=bounds.max.z;
  const span=bounds.max.z-bounds.min.z;
  const tolerance=Math.max(.06,Math.min(.35,span*.003));
  const vertex=new THREE.Vector3();
  let radius=0;
  for(let i=0;i<positions.count;i++){
    vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrix);
    if(vertex.z>=top-tolerance)radius=Math.max(radius,Math.hypot(vertex.x,vertex.y));
  }
  // A pointed or bevelled last vertex may not define an end-face radius.
  if(radius<.5)radius=Math.min(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y)*.5;
  if(!Number.isFinite(radius)||radius<.5||!Number.isFinite(span)||span<=0)return null;
  return {top,span,radius};
}
function addShaftRotationMarker(name,color) {
  const shaft=parts[name];
  const pivot=rotNodes.get(name);
  if(!shaft||!pivot)return;
  const profile=shaftTipProfile(shaft);
  if(!profile){
    console.warn('Rotation marker unavailable for CAD shaft',name);
    return; // A visual aid must never prevent the original CAD scene loading.
  }
  const {top,span,radius}=profile;
  const offset=Math.max(.05,radius*.018);
  const faceZ=top+offset;
  const material=new THREE.MeshBasicMaterial({
    color,side:THREE.DoubleSide,depthWrite:false
  });
  const outline=new THREE.MeshBasicMaterial({
    color:0x10232f,side:THREE.DoubleSide,depthWrite:false
  });
  const group=new THREE.Group();
  group.name='ViewerMarker_'+name;
  group.userData.viewerOverlay=true;
  pivot.add(group);
  shaftMarkerGroups.push(group);

  function addOverlay(geometry,mat,z,label) {
    const overlay=new THREE.Mesh(geometry,mat);
    overlay.name=label+'_'+name;
    overlay.position.z=z;
    // Click-through: selecting the CAD shaft still reports its real name.
    overlay.raycast=()=>{};
    group.add(overlay);
    return overlay;
  }
  // A high-contrast hand on the actual positive-Z shaft end makes rotation
  // visible even when cylindrical side surfaces look identical.
  const hand=addOverlay(
    new THREE.PlaneGeometry(radius*.78,radius*.23),
    outline,faceZ,'EndHandOutline');
  hand.position.x=radius*.38;
  const handInk=addOverlay(
    new THREE.PlaneGeometry(radius*.72,radius*.13),
    material,faceZ+offset*.14,'EndHand');
  handInk.position.x=radius*.38;
  const tipDot=addOverlay(
    new THREE.CircleGeometry(radius*.17,24),
    material,faceZ+offset*.22,'EndDot');
  tipDot.position.x=radius*.73;

  // A short longitudinal paint-like stripe follows the same shaft pivot.
  // The end radius comes from the imported FreeCAD vertices, not a guessed
  // diameter. Its short span avoids drawing over the whole gearbox.
  // Two unequal blades make angular motion obvious even without the end stripe.
  // These are demonstration flags outside the gear zone, not machined CAD teeth.
  const rotorZ=top+Math.max(1.4,radius*.28);
  const blades=new THREE.Shape();
  const longArm=radius*2.8;
  const shortArm=radius*1.35;
  const halfWidth=Math.max(.8,radius*.28);
  blades.moveTo(-shortArm,-halfWidth*.67);
  blades.lineTo(-radius*.52,-halfWidth);
  blades.lineTo(radius*.35,-halfWidth);
  blades.lineTo(longArm*.77,-halfWidth*1.2);
  blades.lineTo(longArm,0);
  blades.lineTo(longArm*.77,halfWidth*1.2);
  blades.lineTo(radius*.35,halfWidth);
  blades.lineTo(-radius*.52,halfWidth);
  blades.lineTo(-shortArm,halfWidth*.67);
  blades.closePath();
  const rotor=addOverlay(
    new THREE.ExtrudeGeometry(blades,{depth:Math.max(.55,radius*.13),bevelEnabled:false,steps:1}),
    material,rotorZ,'MarkerRotorAsymmetric');
  rotor.renderOrder=2;
  const hub=addOverlay(
    new THREE.CylinderGeometry(radius*.46,radius*.46,Math.max(.65,radius*.2),24),
    outline,rotorZ,'MarkerRotorHub');
  hub.rotation.x=Math.PI*.5;
  hub.position.z=rotorZ+Math.max(.28,radius*.07);
  // Mark the longer blade; no visual symmetry can hide 180-degree rotation.
  const accent=addOverlay(
    new THREE.CircleGeometry(Math.max(.55,radius*.18),16),
    outline,rotorZ+Math.max(.6,radius*.15),'MarkerRotorTip');
  accent.position.x=longArm*.76;
  const stripeLength=Math.min(15,span*.14);
  if(stripeLength>1) {
    const side=addOverlay(
      new THREE.CylinderGeometry(radius+offset,radius+offset,stripeLength,32,1,true,-.17,.34),
      material,top-stripeLength*.5-offset*4,'SideStripe');
    side.rotation.x=Math.PI*.5; // Three.js cylinder Y-axis → shaft Z-axis
  }
}
function setShaftMarkerVisibility() {
  const visible=$('shaftMarkersToggle').checked;
  for(const group of shaftMarkerGroups)group.visible=visible;
}
function leverPoseAsMatrix(pose,into) {
  return into.compose(
    new THREE.Vector3(...pose.position_mm),
    new THREE.Quaternion(...pose.quaternion_xyzw),
    new THREE.Vector3(1,1,1)
  );
}
function applyLever(pose) {
  if(!pose || !model) return;
  const lever=parts.NativeShiftLever;
  leverPoseAsMatrix(pose,currentMatrix);
  deltaMatrix.multiplyMatrices(currentMatrix,neutralInverse);
  deltaMatrix.decompose(lever.position,lever.quaternion,lever.scale);
}
function blendLever(a,b,f) {
  const pa=new THREE.Vector3(...a.position_mm);
  const pb=new THREE.Vector3(...b.position_mm);
  const qa=new THREE.Quaternion(...a.quaternion_xyzw);
  const qb=new THREE.Quaternion(...b.quaternion_xyzw);
  pa.lerp(pb,f);
  qa.slerp(qb,f);
  tempPos.copy(pa);tempQuat.copy(qa);
  currentMatrix.compose(tempPos,tempQuat,new THREE.Vector3(1,1,1));
  deltaMatrix.multiplyMatrices(currentMatrix,neutralInverse);
  deltaMatrix.decompose(parts.NativeShiftLever.position,parts.NativeShiftLever.quaternion,parts.NativeShiftLever.scale);
}
function applyTravel() {
  for(const name of ['NativeShiftRailA','NativeShiftForkA','NativeReceiverA']) parts[name].position.z=motion.a;
  for(const name of ['NativeShiftRailB','NativeShiftForkB','NativeReceiverB']) parts[name].position.z=motion.b;
  parts.InterlockPin.position.y=motion.pin;
  rotNodes.get('NativeSleeveA').position.z=motion.a;
  rotNodes.get('NativeSleeveB').position.z=motion.b;
}
function readPose(g) {return poses[String(g)].parts.NativeShiftLever;}
function setGuideVisibility() {
  for(const name of ['GuideALower','GuideAUpper','GuideBLower','GuideBUpper','SupportBottom','SupportTop','ShiftGate','LeverSocket','LeverPivot']) {
    if(parts[name])parts[name].visible=hardware;
  }
}
function setXray() {
  gearMeshes.forEach(m=>{
    m.material.transparent=xray;
    m.material.opacity=xray?.30:1;
    m.material.depthWrite=!xray;
    m.material.needsUpdate=true;
  });
}
function glow(names,color,strength) {
  for(const name of names) {
    const material=parts[name]?.material;
    if(!material?.emissive)continue;
    material.emissive.setHex(color);
    material.emissiveIntensity=strength;
  }
}
function highlight() {
  // Only CAD-derived nodes are highlighted; the mesh geometry stays untouched.
  for(const part of Object.values(parts)) {
    if(!part.material?.emissive)continue;
    part.material.emissive.setHex(0x000000);
    part.material.emissiveIntensity=0;
  }
  const sh=transition;
  if(sh){
    const source=sh.from, target=sh.to;
    const letter=(target===3?'B':'A');
    if(sh.step==='release') {
      const old=(source===3?'B':'A');
      glow(['NativeShiftLever',`NativeShiftRail${old}`,`NativeShiftFork${old}`,`NativeSleeve${old}`],0xff9b56,.66);
      if(source)glow([`GearOutput${source}`,`Dogs${source}`],0xffbd61,.35);
    }else if(sh.step==='select') {
      glow(['NativeShiftLever',`NativeReceiver${letter}`,`NativeShiftRail${letter}`],0xffb065,.78);
      glow(['InterlockPin'],0xff7f68,.88);
    }else if(sh.step==='align') {
      glow([`GearOutput${target}`,`Dogs${target}`,`NativeSleeve${letter}`],0xf3c86e,.68);
    }else if(sh.step==='engage') {
      glow(['NativeShiftLever',`NativeReceiver${letter}`,`NativeShiftRail${letter}`,`NativeShiftFork${letter}`],0xff9f59,.7);
      glow([`NativeSleeve${letter}`,`Dogs${target}`],0x7cefc6,.82);
      glow([`GearInput${target}`,`GearOutput${target}`],0x54bca4,.35);
    }
  }else if(gear) {
    const letter=(gear===3?'B':'A');
    glow([`GearInput${gear}`,`GearOutput${gear}`],0x4fc4ac,.45);
    glow([`NativeSleeve${letter}`,`Dogs${gear}`],0x96e9bd,.64);
  }
}
function applyRotation() {
  for(let i=1;i<=3;i++) {
    rotNodes.get('GearInput'+i).rotation.z=inputAngle;
    const outputRotation=-inputAngle*ratios[i];
    rotNodes.get('GearOutput'+i).rotation.z=outputRotation;
    rotNodes.get('Dogs'+i).rotation.z=outputRotation;
  }
  rotNodes.get('InputShaft').rotation.z=inputAngle;
  for(const n of ['NativeOutputShaft','SplineA','SplineB','NativeSleeveA','NativeSleeveB'])rotNodes.get(n).rotation.z=shaftAngle;
}
function quatAngle(q) {return 2*Math.atan2(q[2],q[3]);}
function closestDogAlignment(g){
  const q1=quatAngle(spinBases[`GearOutput${g}`].q);
  const q2=quatAngle(spinBases.NativeOutputShaft.q);
  let target=q1-q2-inputAngle*ratios[g];
  // The source CAD has six equally spaced engagement dogs.
  const step=Math.PI/3;
  target += Math.round((shaftAngle-target)/step)*step;
  return target;
}
function updateShiftFlow() {
  const sh=transition;
  const current=sh ? sh.segments.findIndex(p=>p.id===sh.step) : -1;
  document.querySelectorAll('.shift-step').forEach(node=>{
    const i=sh ? sh.segments.findIndex(p=>p.id===node.dataset.step) : -1;
    const active=i>=0 && i===current;
    node.classList.toggle('active',active);
    node.classList.toggle('done',i>=0 && i<current);
    node.classList.toggle('skipped',Boolean(sh) && i<0);
    if(active)node.setAttribute('aria-current','step');
    else node.removeAttribute('aria-current');
  });
  $('shiftProgressBar').style.width=sh ? `${100*sh.elapsed/sh.duration}%` : '0%';
}
function shiftStageStatus(stage,sh) {
  const old=(sh.from===3?'B':'A');
  const next=(sh.to===3?'B':'A');
  if(stage==='release')return `Вилка ${old} отводит муфту ${old} в нейтраль; прежняя передача выключается.`;
  if(stage==='select')return `Рычаг выбирает шток ${next}; блокирующий палец исключает другой шток.`;
  if(stage==='align')return 'Валы остановлены. Кулачки совмещаются небольшим поворотом выходного вала.';
  return `Шток ${next} ведёт вилку и муфту ${next} на 3 мм — включается ${names[sh.to].toLowerCase()}.`;
}
function setShiftStep(id) {
  if(!transition || transition.step===id)return;
  transition.step=id;
  setStatus(shiftStageStatus(id,transition));
  updateButtons();
  updateShiftFlow();
  highlight();
}
function beginShift(target) {
  if(!ready||transition||target===gear)return;
  const from=gear;
  const wasRunning=playing;
  playing=false; // Unsynchronised dog clutches: freeze input before any shift.
  const segments=target===0
    ? [{id:'release',duration:1.5}]
    : [
        ...(from ? [{id:'release',duration:1.25}] : []),
        {id:'select',duration:.85},
        {id:'align',duration:.65},
        {id:'engage',duration:1.35}
      ];
  transition={
    from,to:target,segments,step:null,elapsed:0,
    duration:segments.reduce((sum,p)=>sum+p.duration,0),
    resume:wasRunning,
    shaftFrom:shaftAngle,
    shaftTo:target ? closestDogAlignment(target) : shaftAngle
  };
  gear=0;activeGear=0;
  if($('autoFocusToggle').checked)focusMechanism(target||from||1);
  setShiftStep(segments[0].id);
}
function doShift(dt) {
  const sh=transition;if(!sh)return;
  sh.elapsed=Math.min(sh.duration,sh.elapsed+dt);
  let remaining=sh.elapsed;
  let segment=sh.segments[sh.segments.length-1];
  for(const candidate of sh.segments) {
    segment=candidate;
    if(remaining<=candidate.duration)break;
    remaining-=candidate.duration;
  }
  const x=phase(remaining/segment.duration);
  setShiftStep(segment.id);
  const before=poses[String(sh.from)].solved;
  const after=poses[String(sh.to)].solved;
  if(segment.id==='release') {
    motion.a=before.rail_A_mm*(1-x);
    motion.b=before.rail_B_mm*(1-x);
    motion.pin=before.pin_shift_mm*(1-x);
    shaftAngle=sh.shaftFrom;
    blendLever(readPose(sh.from),readPose(0),x);
  }else if(segment.id==='select') {
    motion.a=0;motion.b=0;
    motion.pin=after.pin_shift_mm*x;
    shaftAngle=sh.shaftFrom;
    blendLever(readPose(0),readPose(sh.to),.25*x);
  }else if(segment.id==='align') {
    motion.a=0;motion.b=0;
    motion.pin=after.pin_shift_mm;
    shaftAngle=THREE.MathUtils.lerp(sh.shaftFrom,sh.shaftTo,x);
    blendLever(readPose(0),readPose(sh.to),.25);
  }else {
    motion.a=after.rail_A_mm*x;
    motion.b=after.rail_B_mm*x;
    motion.pin=after.pin_shift_mm;
    shaftAngle=sh.shaftTo;
    blendLever(readPose(0),readPose(sh.to),.25+.75*x);
  }
  applyTravel();
  $('shiftProgressBar').style.width=`${100*sh.elapsed/sh.duration}%`;
  if(sh.elapsed>=sh.duration) {
    motion.a=after.rail_A_mm;
    motion.b=after.rail_B_mm;
    motion.pin=after.pin_shift_mm;
    applyTravel();applyLever(readPose(sh.to));
    activeGear=sh.to;gear=sh.to;
    transition=null;
    playing=sh.resume;
    highlight();updateButtons();updateShiftFlow();
    setStatus(gear
      ? `${names[gear]} включена. Подсвечен путь вращения через выбранную пару шестерён.`
      : 'Нейтраль. Все пары шестерён вращаются, но крутящий момент не передаётся.');
  }
}
const displayNames={
  InputShaft:'Ведущий вал',NativeOutputShaft:'Ведомый вал',NativeFrame:'Рама механизма',
  NativeShiftLever:'Рычаг переключения',InterlockPin:'Поперечный блокирующий палец',InterlockBridge:'Направляющий корпус блокиратора',
  NativeShiftRailA:'Шток A · 1-я и 2-я передачи',NativeShiftRailB:'Шток B · 3-я передача',
  NativeShiftForkA:'Вилка A',NativeShiftForkB:'Вилка B',NativeSleeveA:'Кулачковая муфта A',NativeSleeveB:'Кулачковая муфта B',
  NativeReceiverA:'Селектор A',NativeReceiverB:'Селектор B'
};
for(let g=1;g<=3;g++){
  displayNames[`GearInput${g}`]=`Входная шестерня ${g} · ${[0,18,24,30][g]} зубьев`;
  displayNames[`GearOutput${g}`]=`Выходная шестерня ${g} · ${[0,42,36,30][g]} зубьев`;
  displayNames[`Dogs${g}`]=`Кулачки шестерни ${g}`;
}
function onPointerUp(e) {
  if(!ready||pointerDrag)return;
  const bounds=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-bounds.left)/bounds.width)*2-1;
  pointer.y=-((e.clientY-bounds.top)/bounds.height)*2+1;
  clickRay.setFromCamera(pointer,camera);
  const hits=clickRay.intersectObject(model,true);
  if(hits.length){
    const n=hits[0].object.name;
    $('selectedPart').textContent='Выбрана деталь: '+(displayNames[n]||n.replace(/_/g,' '));
  }
}
let pointerDrag=false,downPoint=null;
renderer.domElement.addEventListener('pointerdown',e=>{cameraFlight=null;pointerDrag=false;downPoint={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointermove',e=>{if(downPoint&&Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>6)pointerDrag=true;});
renderer.domElement.addEventListener('pointerup',e=>{onPointerUp(e);downPoint=null;});
function flyCamera(toPosition,toTarget) {
  cameraFlight={
    fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),
    toPosition,toTarget,elapsed:0,duration:.85
  };
}
function focusMechanism(g) {
  const target=new THREE.Vector3(11,40,g===3?67:34);
  flyCamera(target.clone().add(new THREE.Vector3(140,-135,105)),target);
}
function updateCameraFlight(dt) {
  if(!cameraFlight)return;
  const flight=cameraFlight;
  flight.elapsed+=dt;
  const f=phase(flight.elapsed/flight.duration);
  camera.position.lerpVectors(flight.fromPosition,flight.toPosition,f);
  controls.target.lerpVectors(flight.fromTarget,flight.toTarget,f);
  if(f>=1)cameraFlight=null;
}
function resetCamera(){cameraFlight=null;camera.position.copy(cameraStart);controls.target.copy(lookAt);controls.update();}
$('cameraReset').addEventListener('click',resetCamera);
$('cameraMechanism').addEventListener('click',()=>focusMechanism(transition?.to||gear||1));
$('fullscreen').addEventListener('click',async()=>{
  if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}
  await viewport.requestFullscreen?.().catch(()=>setStatus('Полноэкранный режим не поддерживается этим браузером.'));
});
$('rpmRange').addEventListener('input',e=>{rpm=Number(e.target.value);updateSpeed();});
$('playPause').addEventListener('click',()=>{if(!ready||transition)return;playing=!playing;setStatus(playing?'Вращение возобновлено.':'Вращение остановлено. Можно рассмотреть или переключить передачу.');updateButtons();});
$('xrayToggle').addEventListener('change',e=>{xray=e.target.checked;setXray();});
$('shaftMarkersToggle').addEventListener('change',setShaftMarkerVisibility);
$('hardwareToggle').addEventListener('change',e=>{hardware=e.target.checked;setGuideVisibility();});
document.querySelectorAll('.gear-btn').forEach(button=>button.addEventListener('click',()=>beginShift(Number(button.dataset.gear))));
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.target instanceof HTMLInputElement)return;
  if(['0','1','2','3'].includes(e.key)){beginShift(Number(e.key));return;}
  if(e.code==='Space'){e.preventDefault();$('playPause').click();}
});
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
new ResizeObserver(resize).observe(viewport);
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,clock.getDelta());
  if(ready){
    if(transition)doShift(dt);
    else if(playing){
      const d=dt*rpm*2*Math.PI/60;
      inputAngle+=d;
      if(activeGear)shaftAngle-=d*ratios[activeGear];
    }
    applyRotation();
  }
  updateCameraFlight(dt);
  controls.update();renderer.render(scene,camera);
}
resize();animate();
try{
  const responses=await Promise.all([fetch(posePath),fetch(spinPath)]);
  if(responses.some(r=>!r.ok))throw new Error('Нет данных о кинематике FreeCAD');
  [poses,spinBases]=await Promise.all(responses.map(r=>r.json()));
  const gltf=await new GLTFLoader().loadAsync(modelPath);
  model=gltf.scene;
  scene.add(model);
  model.traverse(o=>{
    if(!o.isMesh)return;
    parts[o.name]=o;
    o.material=o.material.clone();
    o.material.metalness=.40;
    o.material.roughness=.43;
    o.material.side=THREE.DoubleSide;
    if(o.name.startsWith('Gear'))gearMeshes.push(o);
  });
  const required=['InputShaft','NativeOutputShaft','NativeSleeveA','NativeSleeveB','NativeShiftLever','InterlockPin'];
  if(required.some(n=>!parts[n]))throw new Error('Экспорт GLB неполон');
  for(const n of ['InputShaft','GearInput1','GearInput2','GearInput3'])setPivot(n,0,0,0);
  for(const n of ['NativeOutputShaft','SplineA','SplineB','GearOutput1','GearOutput2','GearOutput3','Dogs1','Dogs2','Dogs3','NativeSleeveA','NativeSleeveB'])setPivot(n,0,60,0);
  addShaftRotationMarker('InputShaft',0xffc264);
  addShaftRotationMarker('NativeOutputShaft',0x65e5ff);
  setShaftMarkerVisibility();
  leverPoseAsMatrix(readPose(0),neutralMatrix);neutralInverse.copy(neutralMatrix).invert();
  currentLeverPose=readPose(0);
  applyLever(currentLeverPose);applyTravel();applyRotation();setGuideVisibility();setXray();highlight();
  $('loading').classList.add('hidden');
  $('renderStatus').textContent='34 CAD-детали · 51 534 треугольника';
  ready=true;updateButtons();updateShiftFlow();
  setStatus('Вращается ведущий вал. Выберите 1, 2 или 3: коробка остановится и переключится автоматически.');
  resize();
}catch(err){
  console.error('FreeCAD 3D loader:',err);
  $('loading').innerHTML='<strong>Не удалось загрузить 3D-модель</strong><span>Проверьте соединение и перезагрузите страницу.</span>';
  $('renderStatus').textContent='Ошибка загрузки';
  setStatus('Ошибка загрузки: '+err.message);
}
