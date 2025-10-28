// app.js — Cuboctahedron Dice → Net Board (white theme + wireframe)
console.log('[app] cuboctahedron dice (white wireframe) loaded', new Date().toISOString());

// ===== Three.js (ESM via CDN) =====
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// ===== Scene / Renderer =====
const container = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 背景：白色
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(
  55,
  container.clientWidth / container.clientHeight,
  0.01,
  200
);
camera.position.set(3.2, 2.2, 3.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.2;
controls.maxDistance = 8;
controls.target.set(0, 0.35, 0);
controls.update();

// 光照（偏柔和，以适配白背景）
const hemi = new THREE.HemisphereLight(0xffffff, 0xf1f5f9, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(4, 6, 5);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
scene.add(dir);

// 地面：很浅的灰，避免纯白难以分辨阴影
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 80),
  new THREE.MeshStandardMaterial({ color: 0xf5f7fa, metalness: 0.0, roughness: 1.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// ===== State =====
const State = { DIE: 'die', SHAKING: 'shaking', UNFOLD: 'unfold', BOARD: 'board' };
let state = State.DIE;
let rollResult = 1;

// ======== 构建截半立方体（Cuboctahedron）========
// 顶点： (±1,±1,0), (±1,0,±1), (0,±1,±1)
const raw = [
  [-1, 1, 0], [ 1, 1, 0], [-1,-1, 0], [ 1,-1, 0],
  [-1, 0, 1], [ 1, 0, 1], [-1, 0,-1], [ 1, 0,-1],
  [ 0, 1, 1], [ 0,-1, 1], [ 0, 1,-1], [ 0,-1,-1],
];
const s = 0.8;
const V = raw.map(v => new THREE.Vector3(v[0]*s, v[1]*s, v[2]*s));

// 6个正方形面（id 1..6）
const S = [
  { id: 1,  verts:[1,3,7,5] },  // x=+1
  { id: 2,  verts:[0,2,6,4] },  // x=-1
  { id: 3,  verts:[0,1,8,10] }, // y=+1
  { id: 4,  verts:[2,3,9,11] }, // y=-1
  { id: 5,  verts:[4,5,8,9] },  // z=+1
  { id: 6,  verts:[6,7,10,11] } // z=-1
];
// 8个三角形面（id 7..14）
const T = [
  { id: 7,  verts:[1,5,8]   }, { id: 8,  verts:[1,10,7]  },
  { id: 9,  verts:[3,5,9]   }, { id:10,  verts:[3,7,11]  },
  { id:11,  verts:[0,4,8]   }, { id:12,  verts:[0,10,6]  },
  { id:13,  verts:[2,9,4]   }, { id:14,  verts:[2,11,6]  }
];

function triFanToTris(indices){ return [[indices[0],indices[1],indices[2]], [indices[0],indices[2],indices[3]]]; }
const faceMap = [];
S.forEach(sq => faceMap.push({ id:sq.id, type:'sq', tris: triFanToTris(sq.verts) }));
T.forEach(tr => faceMap.push({ id:tr.id, type:'tri', tris: [tr.verts] }));

// 组装单一几何 + 多材质分组
const dieGeo = new THREE.BufferGeometry();
{
  const pos=[], nrm=[], uv=[];
  const A=new THREE.Vector3(), B=new THREE.Vector3(), N=new THREE.Vector3();
  faceMap.forEach(F=>{
    F.tris.forEach(t=>{
      const a=V[t[0]], b=V[t[1]], c=V[t[2]];
      pos.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
      A.copy(b).sub(a); B.copy(c).sub(a); N.copy(A).cross(B).normalize();
      for(let i=0;i<3;i++) nrm.push(N.x,N.y,N.z);
      // UV 只是占位（我们用 CanvasTexture 画数字）
      uv.push(0,0, 1,0, 0.5,1);
    });
  });
  dieGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  dieGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm,3));
  dieGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
  let triOffset = 0;
  faceMap.forEach(F=>{
    dieGeo.addGroup(triOffset*3, F.tris.length*3, F.id-1);
    triOffset += F.tris.length;
  });
  dieGeo.computeBoundingSphere();
}

// 画“白底黑字”的纹理；材质设为 DoubleSide（避免“镂空”）
function makeFaceTex(num, fg = '#111111', bg = '#ffffff'){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const x=c.getContext('2d');
  x.fillStyle=bg; x.fillRect(0,0,256,256);
  x.fillStyle=fg; x.font='bold 140px ui-sans-serif,system-ui,-apple-system';
  x.textAlign='center'; x.textBaseline='middle';
  x.fillText(String(num),128,138);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}

// 骰子面材质（白底黑字）
const faceMats=[];
for(let i=1;i<=14;i++){
  faceMats.push(new THREE.MeshStandardMaterial({
    map: makeFaceTex(i, '#111111', '#ffffff'),
    metalness:0.05, roughness:0.9, side: THREE.DoubleSide
  }));
}

// 网格 + 线框叠加（黑色线）
const die = new THREE.Mesh(dieGeo, faceMats);
die.castShadow = true;
die.position.set(0,0.35,0);
scene.add(die);

// 线框：用 EdgesGeometry 覆盖在骰子表面
const dieEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(dieGeo, 1e-6),
  new THREE.LineBasicMaterial({ color: 0x111111 })
);
die.add(dieEdges);

controls.target.copy(die.position);
controls.update();
camera.lookAt(die.position);

// ===== 拖拽→松手摇晃 =====
const raycaster = new THREE.Raycaster();
const mouseNDC  = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

let isDragging = false;
let lastPos = new THREE.Vector3();
let vel2    = new THREE.Vector2(0,0);
let angVel  = new THREE.Vector3();

function screenToGround(x,y,out){
  mouseNDC.set((x/container.clientWidth)*2-1, -(y/container.clientHeight)*2+1);
  raycaster.setFromCamera(mouseNDC, camera);
  const p=new THREE.Vector3(); raycaster.ray.intersectPlane(groundPlane, p);
  if(out) out.copy(p); return p;
}
container.addEventListener('pointerdown', e=>{
  if(e.button!==0 || state!==State.DIE) return;
  isDragging=true; controls.enabled=false;
  screenToGround(e.offsetX, e.offsetY, lastPos); vel2.set(0,0);
});
container.addEventListener('pointermove', e=>{
  if(!isDragging || state!==State.DIE) return;
  const p=screenToGround(e.offsetX, e.offsetY, new THREE.Vector3());
  const d=p.clone().sub(lastPos);
  die.position.add(d); vel2.set(d.x,d.z); lastPos.copy(p);
  controls.target.copy(die.position);
});
container.addEventListener('pointerup', e=>{
  if(e.button!==0 || !isDragging || state!==State.DIE) return;
  isDragging=false; controls.enabled=true; startShake(vel2.length());
});

function startShake(strength){
  state = State.SHAKING;
  const s = THREE.MathUtils.clamp(strength*6 + (Math.random()*1.2+0.3), 0.8, 6.0);
  angVel.set((Math.random()*2-1)*s, (Math.random()*2-1)*s, (Math.random()*2-1)*s);
  rollResult = 1 + Math.floor(Math.random()*14); // 1..14
}
function tickShake(dt){
  die.rotation.x += angVel.x*dt;
  die.rotation.y += angVel.y*dt;
  die.rotation.z += angVel.z*dt;
  angVel.multiplyScalar(0.96);
  if(angVel.length()<0.18){
    angVel.set(0,0,0);
    state = State.DIE;
    setTimeout(()=>toUnfold(), 2000); // 停2秒后展开
  }
}

// ======== 展开图 / 棋盘（白底黑字 + 黑色边框）========
const boardRoot = new THREE.Group(); boardRoot.visible=false; scene.add(boardRoot);
const tileSize = 1.0, triH = tileSize*Math.sqrt(3)/2;

function matTex(num, bg = '#ffffff'){
  return new THREE.MeshBasicMaterial({
    map: makeFaceTex(num, '#111111', bg),
    side: THREE.DoubleSide
  });
}

const tiles=[], pathOrder=[];
function addEdges(mesh, color=0x111111){
  const geo = new THREE.EdgesGeometry(mesh.geometry, 1e-6);
  const ln  = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
  mesh.add(ln);
}

const sqLayout = [
  {id:1, x:0, z:0}, {id:2, x:1, z:0}, {id:3, x:2, z:0}, {id:4, x:3, z:0},
  {id:5, x:2, z:1}, {id:6, x:1, z:-1},
];
sqLayout.forEach(L=>{
  const g = new THREE.PlaneGeometry(tileSize, tileSize);
  const m = new THREE.Mesh(g, matTex(L.id, '#ffffff'));
  m.rotation.x = -Math.PI/2; m.position.set(L.x*tileSize, 0.01, L.z*tileSize);
  m.userData.id=L.id; boardRoot.add(m);
  addEdges(m);
  tiles.push({id:L.id, mesh:m, pos:m.position.clone()});
  pathOrder.push(L.id);
});
function triMesh(id, rotRad, x, z){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -tileSize/2,0,0,  tileSize/2,0,0,  0,triH,0
  ]),3));
  g.setIndex([0,1,2]); g.computeVertexNormals();
  const m=new THREE.Mesh(g, matTex(id, '#ffffff'));
  m.rotation.x = -Math.PI/2; m.rotation.z = rotRad||0;
  m.position.set(x*tileSize, 0.011, z*tileSize);
  m.userData.id=id; boardRoot.add(m);
  addEdges(m);
  tiles.push({id:id, mesh:m, pos:m.position.clone()});
  pathOrder.push(id);
}
// 8 个三角格（示意布局）
triMesh(7,  Math.PI/2,  -0.5,  0.0);
triMesh(8,  Math.PI/2,   0.5, -1.0);
triMesh(9, -Math.PI/2,   0.5,  1.0);
triMesh(10, Math.PI/2,   1.5,  0.0);
triMesh(11, Math.PI,     2.5,  0.5);
triMesh(12, Math.PI/2,   2.5, -0.5);
triMesh(13,-Math.PI/2,   1.5,  1.0);
triMesh(14,-Math.PI/2,   3.5,  0.0);

// 棋子：蓝色小球在白色背景上更醒目
const pawn = new THREE.Mesh(
  new THREE.SphereGeometry(0.15, 32, 16),
  new THREE.MeshStandardMaterial({ color:0x2563eb, metalness:0.2, roughness:0.6, emissive:0x1e40af, emissiveIntensity:0.25 })
);
pawn.castShadow = true;
pawn.position.set(0, 0.12, 0);
boardRoot.add(pawn);

function tileById(id){ return tiles.find(t=>t.id===id); }
function movePawnToId(id){
  const dst=tileById(id).pos;
  tweenVec3(pawn.position, new THREE.Vector3(dst.x, 0.12, dst.z), 800);
}
function pulseTile(id){
  const t = tileById(id);
  const m = t.mesh.material;
  let el=0, dur=900;
  (function anim(){
    el+=16;
    const k=(Math.sin(el/180)+1)/2;
    t.mesh.scale.setScalar(1 + 0.06*k);
    if(el<dur) requestAnimationFrame(anim);
    else t.mesh.scale.setScalar(1);
  })();
}
function movePawnSteps(n){
  const id = ((n-1)%14)+1; // 1..14
  movePawnToId(id);
}

function toUnfold(){
  if(state===State.UNFOLD || state===State.BOARD) return;
  state = State.UNFOLD;
  boardRoot.scale.setScalar(0.001);
  boardRoot.position.copy(die.position);
  boardRoot.visible = true;

  const T = 700; const t0 = performance.now();
  (function anim(){
    const k = Math.min((performance.now()-t0)/T, 1);
    const e = k<.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    boardRoot.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, e));
    boardRoot.position.lerpVectors(die.position, new THREE.Vector3(0,0,0), e);
    if(k<1){ requestAnimationFrame(anim); }
    else {
      die.visible=false; state=State.BOARD;
      movePawnSteps(rollResult); pulseTile(rollResult);
    }
  })();
}

// 返回按钮（如果你 index.html 里有 #btnBack）
const backBtn = document.getElementById('btnBack');
if(backBtn) backBtn.onclick = ()=> {
  if(state===State.DIE) return;
  die.visible = true; boardRoot.visible=false; state=State.DIE;
  controls.target.copy(die.position); controls.update();
};

// ===== Tween 工具 =====
function tweenVec3(from, to, ms){
  const start=from.clone(); const T=ms; const t0=performance.now();
  (function go(){
    const k=Math.min((performance.now()-t0)/T,1);
    const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    from.lerpVectors(start,to,e);
    if(k<1) requestAnimationFrame(go);
  })();
}

// ===== Resize & Loop =====
window.addEventListener('resize', ()=>{
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
const clock=new THREE.Clock();
function tick(){
  const dt=clock.getDelta();
  controls.enabled = (state===State.DIE && !isDragging);
  controls.update();
  if(state===State.SHAKING) tickShake(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}
tick();
