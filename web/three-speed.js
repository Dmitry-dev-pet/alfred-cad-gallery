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
let materials = new Map();
let poses = null;
let spinBases = null;
let ready = false;
let xray = false;
let hardware = true;
let currentLeverPose = null;
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
  $('currentPair').textContent = transition ? 'Перемещение штоков и кулачковой муфты' : (gear ? teeth[gear] : 'Нет передачи момента');
  $('gearNote').textContent = stageNotes[gear];
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
function highlight() {
  for(let i=1;i<=3;i++) {
    const mesh=parts['GearOutput'+i];
    if(!mesh)continue;
    mesh.material.emissive.setHex(gear===i?0x215a42:0x000000);
    mesh.material.emissiveIntensity=gear===i?.34:0;
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
function beginShift(target) {
  if(!ready||transition||target===gear)return;
  const wasRunning=playing;
  playing=false; // unsynchronised dog clutches: no motion during the shift
  const from=gear;
  transition={from,to:target,elapsed:0,duration:1.04,resume:wasRunning,shaftFrom:shaftAngle,shaftTo:target?closestDogAlignment(target):shaftAngle};
  gear=0;activeGear=0;
  setStatus('Ведущий вал остановлен. Сначала нейтраль, затем блокирующий палец и выбранная муфта.');
  updateButtons();highlight();
}
function doShift(dt) {
  const sh=transition;if(!sh)return;
  sh.elapsed+=dt;
  const t=Math.min(1,sh.elapsed/sh.duration);
  const before=poses[String(sh.from)].solved;
  const after=poses[String(sh.to)].solved;
  if(t<=.35){
    const a=1-phase(t/.35);
    motion.a=before.rail_A_mm*a;
    motion.b=before.rail_B_mm*a;
    motion.pin=before.pin_shift_mm*a;
    blendLever(readPose(sh.from),readPose(0),phase(t/.35));
  }else if(t<=.58){
    const x=phase((t-.35)/.23);
    motion.a=0;motion.b=0;
    motion.pin=after.pin_shift_mm*x;
    shaftAngle=THREE.MathUtils.lerp(sh.shaftFrom,sh.shaftTo,x);
    blendLever(readPose(0),readPose(sh.to),x*.28);
  }else{
    const x=phase((t-.58)/.42);
    motion.a=after.rail_A_mm*x;
    motion.b=after.rail_B_mm*x;
    motion.pin=after.pin_shift_mm;
    shaftAngle=sh.shaftTo;
    blendLever(readPose(0),readPose(sh.to),.28+.72*x);
  }
  applyTravel();
  if(t>=1){
    motion.a=after.rail_A_mm;
    motion.b=after.rail_B_mm;
    motion.pin=after.pin_shift_mm;
    applyTravel();applyLever(readPose(sh.to));
    activeGear=sh.to;gear=sh.to;
    transition=null;
    playing=sh.resume;
    highlight();updateButtons();
    setStatus(gear ? `${names[gear]} включена. Ведомый вал вращается в противоположную сторону.` : 'Нейтраль. Все пары шестерён вращаются, но крутящий момент не передаётся.');
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
renderer.domElement.addEventListener('pointerdown',e=>{pointerDrag=false;downPoint={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointermove',e=>{if(downPoint&&Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>6)pointerDrag=true;});
renderer.domElement.addEventListener('pointerup',e=>{onPointerUp(e);downPoint=null;});
function resetCamera(){camera.position.copy(cameraStart);controls.target.copy(lookAt);controls.update();}
$('cameraReset').addEventListener('click',resetCamera);
$('fullscreen').addEventListener('click',async()=>{
  if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}
  await viewport.requestFullscreen?.().catch(()=>setStatus('Полноэкранный режим не поддерживается этим браузером.'));
});
$('rpmRange').addEventListener('input',e=>{rpm=Number(e.target.value);updateSpeed();});
$('playPause').addEventListener('click',()=>{if(!ready||transition)return;playing=!playing;setStatus(playing?'Вращение возобновлено.':'Вращение остановлено. Можно рассмотреть или переключить передачу.');updateButtons();});
$('xrayToggle').addEventListener('change',e=>{xray=e.target.checked;setXray();});
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
  leverPoseAsMatrix(readPose(0),neutralMatrix);neutralInverse.copy(neutralMatrix).invert();
  currentLeverPose=readPose(0);
  applyLever(currentLeverPose);applyTravel();applyRotation();setGuideVisibility();setXray();highlight();
  $('loading').classList.add('hidden');
  $('renderStatus').textContent='34 CAD-детали · 51 534 треугольника';
  ready=true;updateButtons();
  setStatus('Вращается ведущий вал. Выберите 1, 2 или 3: коробка остановится и переключится автоматически.');
  resize();
}catch(err){
  console.error('FreeCAD 3D loader:',err);
  $('loading').innerHTML='<strong>Не удалось загрузить 3D-модель</strong><span>Проверьте соединение и перезагрузите страницу.</span>';
  $('renderStatus').textContent='Ошибка загрузки';
  setStatus('Ошибка загрузки: '+err.message);
}
