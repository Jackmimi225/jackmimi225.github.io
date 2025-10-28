// app.js — cuboctahedron dice → unfold board (v cobocta-005)
console.log('[app] loaded cubocta-005', new Date().toISOString());
window.addEventListener('error', e => console.log('[app] error', e.message));

// Three.js（index.html 里已经用 importmap 指向了 three）
import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// =============== 基础场景 =============== //
const container = document.getElementById('scene');
const renderer  = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f13);

const camera = new THREE.PerspectiveCamera(
  55, container.clientWidth/container.clientHeight, 0.01, 200
);
camera.position.set(3.0, 2.0, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor  = 0.06;
controls.enablePan      = false;
controls.target.set(0,0,0);
controls.update();

const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.25);
dir.position.set(4, 6, 5);
dir.castShadow = true;
dir.shadow.mapSize.set(1024,1024);
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 80),
  new THREE.MeshStandardMaterial({ color:0x101216, metalness:0.05, roughness:0.95 })
);
ground.rotation.x = -Math.PI/2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// =============== 状态机 =============== //
const State = { DIE:'die', SHAKING:'shaking', UNFOLD:'unfold', BOARD:'board' };
let state = State.DIE;
let rollResult = 1;

// =============== 截半立方体（cuboctahedron）骰子 =============== //
// 顶点：所有 (±1,±1,0)、(±1,0,±1)、(0,±1,±1)
const raw = [
  [-1, 1, 0], [ 1, 1, 0], [-1,-1, 0], [ 1,-1, 0],
  [-1, 0, 1], [ 1, 0, 1], [-1, 0,-1], [ 1, 0,-1],
  [ 0, 1, 1], [ 0,-1, 1], [ 0, 1,-1], [ 0,-1,-1],
];
const V = raw.map(v => new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(0.8));

// 面（原始：6方+8三角=14 面），渲染时三角化
const faceMap = [];
function addSquare(id, a,b,c,d){ faceMap.push({ id, type:'sq', tris:[[a,b,c],[a,c,d]] }); }
function addTri(id, a,b,c){     faceMap.push({ id, type:'tri', tris:[[a,b,c]] }); }

// 一组稳定可视连接（不必与教材编号完全一致，只要拓扑正确）
addSquare( 1, 0,1,3,2);
addSquare( 2, 4,5,1,0);
addSquare( 3, 6,7,3,2);
addSquare( 4, 8,5,7,10);
addSquare( 5, 9,4,6,11);
addSquare( 6, 8,10,11,9);
addTri( 7, 5,8,1);
addTri( 8, 8,0,1);
addTri( 9, 4,0,8);
addTri(10, 4,9,0);
addTri(11, 7,5,3);
addTri(12, 5,1,3);
addTri(13, 6,2,9);
addTri(14, 2,11,9);

// 生成数字贴图
function makeFaceTexture(num, color, bg){
  const s=256, c=document.createElement('canvas'); c.width=c.height=s;
  const ctx=c.getContext('2d');
  ctx.fillStyle=bg; ctx.fillRect(0,0,s,s);
  ctx.fillStyle=color; ctx.font='bold 140px ui-sans-serif,system-ui,-apple-system,Segoe UI';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(num), s/2, s/2+6);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}

// 组 Geometry + 材质组
const dieGeo = new THREE.BufferGeometry();
(function buildDie(){
  const pos=[], normal=[], uv=[];
  const tmpA=new THREE.Vector3(), tmpB=new THREE.Vector3(), n=new THREE.Vector3();

  faceMap.forEach(F=>{
    F.tris.forEach(t=>{
      const a=V[t[0]], b=V[t[1]], c=V[t[2]];
      pos.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
      tmpA.copy(b).sub(a); tmpB.copy(c).sub(a); n.copy(tmpA).cross(tmpB).normalize();
      for(let i=0;i<3;i++) normal.push(n.x,n.y,n.z);
      uv.push(0,0, 1,0, 0.5,1);
    });
  });
  dieGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  dieGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(normal,3));
  dieGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));

  // 材质组按“原始面 id”映射
  let triOffset=0;
  faceMap.forEach(F=>{
    dieGeo.addGroup(triOffset*3, F.tris.length*3, F.id-1);
    triOffset += F.tris.length;
  });
  dieGeo.computeBoundingSphere();
})();

const faceMats = [];
for(let i=1;i<=14;i++){
  const tex = makeFaceTexture(i,'#e8e8ec', i<=6 ? '#394356' : '#314045');
  faceMats.push(new THREE.MeshStandardMaterial({ map:tex, metalness:0.2, roughness:0.9 }));
}
const die = new THREE.Mesh(dieGeo, faceMats);
die.castShadow = true;
scene.add(die);

// —— 关键：初始可见 & 视角对准 —— //
die.visible = true;
die.position.set(0, 0.4, 0);
controls.target.copy(die.position);
controls.update();
camera.lookAt(die.position);

// =============== 交互：拖动 & 摇晃 =============== //
const raycaster = new THREE.Raycaster();
const mouseNDC  = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

let isDragging=false;
let lastPos = new THREE.Vector3();
let vel2D   = new THREE.Vector2(0,0);
let angVel  = new THREE.Vector3();

function screenToGround(x,y,out){
  mouseNDC.set((x/container.clientWidth)*2-1, -(y/container.clientHeight)*2+1);
  raycaster.setFromCamera(mouseNDC, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, p);
  if(out) out.copy(p);
  return p;
}

container.addEventListener('pointerdown', (e)=>{
  if(e.button!==0 || state!==State.DIE) return;
  isDragging=true;
  controls.enabled=false;
  screenToGround(e.offsetX, e.offsetY, lastPos);
  vel2D.set(0,0);
});
container.addEventListener('pointermove', (e)=>{
  if(!isDragging || state!==State.DIE) return;
  const p = screenToGround(e.offsetX, e.offsetY, new THREE.Vector3());
  const d = p.clone().sub(lastPos);
  die.position.add(d);
  vel2D.set(d.x, d.z);
  lastPos.copy(p);
  controls.target.copy(die.position);
});
container.addEventListener('pointerup', (e)=>{
  if(e.button!==0 || !isDragging || state!==State.DIE) return;
  isDragging=false;
  controls.enabled=true;
  startShake(vel2D.length());
});

function startShake(strength){
  state = State.SHAKING;
  const s = THREE.MathUtils.clamp(strength*6 + (Math.random()*1.2+0.3), 0.8, 6.0);
  angVel.set(
    (Math.random()*2-1)*s,
    (Math.random()*2-1)*s,
    (Math.random()*2-1)*s
  );
  rollResult = 1 + Math.floor(Math.random()*14);
}

function tickShake(dt){
  die.rotation.x += angVel.x*dt;
  die.rotation.y += angVel.y*dt;
  die.rotation.z += angVel.z*dt;
  angVel.multiplyScalar(0.96); // 阻尼
  if(angVel.length()<0.2){
    angVel.set(0,0,0);
    state = State.DIE; // 先回静止
    setTimeout(()=>toUnfold(), 2000); // 2 秒后展开
  }
}

// =============== 展开图（2D Board） =============== //
const boardRoot = new THREE.Group();
boardRoot.visible = false;
scene.add(boardRoot);

const tileSize = 1.0;
const triH     = tileSize*Math.sqrt(3)/2;
let pawn;

function tileTexture(num, type){
  const bg = type==='sq' ? '#263041' : '#24363a';
  return new THREE.MeshBasicMaterial({ map: makeFaceTexture(num,'#e8e8ec', bg) });
}

const tiles = [];  // {id, mesh, pos}
const pathOrder = [];

(function buildBoard(){
  // 一条 S 形链（编号与骰子面 1..14 对应）
  const layout = [
    {id:1,  type:'sq', x:0, z:0},
    {id:2,  type:'sq', x:1, z:0},
    {id:3,  type:'sq', x:2, z:0},
    {id:4,  type:'sq', x:2, z:1},
    {id:5,  type:'sq', x:1, z:1},
    {id:6,  type:'sq', x:0, z:1},
    {id:7,  type:'tri', x:2.5, z:-0.5, rot: Math.PI/2},
    {id:8,  type:'tri', x:-0.5, z:-0.5, rot: Math.PI/2},
    {id:9,  type:'tri', x:-0.5, z: 1.5, rot:-Math.PI/2},
    {id:10, type:'tri', x:0.5,  z:-0.5, rot: Math.PI/2},
    {id:11, type:'tri', x:2.5,  z: 0.5, rot: Math.PI},
    {id:12, type:'tri', x:1.5,  z:-0.5, rot: Math.PI/2},
    {id:13, type:'tri', x:0.5,  z: 1.5, rot:-Math.PI/2},
    {id:14, type:'tri', x:1.5,  z: 1.5, rot:-Math.PI/2},
  ];

  layout.forEach(L=>{
    let mesh;
    if(L.type==='sq'){
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), tileTexture(L.id,'sq'));
    }else{
      const g = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -tileSize/2,0,0,  tileSize/2,0,0,  0,triH,0
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(verts,3));
      g.computeVertexNormals();
      mesh = new THREE.Mesh(g, tileTexture(L.id,'tri'));
      mesh.rotation.z = L.rot||0;
    }
    mesh.rotation.x = -Math.PI/2;       // 放到 XZ 平面
    mesh.position.set(L.x*tileSize, 0.01, L.z*tileSize);
    mesh.userData.id = L.id;
    boardRoot.add(mesh);
    tiles.push({id:L.id, mesh, pos:mesh.position.clone()});
    pathOrder.push(L.id);
  });

  const pawnGeo = new THREE.SphereGeometry(0.15, 32, 16);
  const pawnMat = new THREE.MeshStandardMaterial({
    color:0x5da9ff, metalness:0.3, roughness:0.4,
    emissive:0x10253a, emissiveIntensity:0.4
  });
  pawn = new THREE.Mesh(pawnGeo, pawnMat);
  pawn.position.set(tiles[0].pos.x, 0.12, tiles[0].pos.z);
  pawn.castShadow = true;
  boardRoot.add(pawn);
})();

function tileById(id){ return tiles.find(t=>t.id===id); }

function movePawnToId(id){
  const dst = tileById(id).pos;
  tweenVec3(pawn.position, new THREE.Vector3(dst.x, 0.12, dst.z), 800);
}
function movePawnSteps(n){
  const idx = (n-1) % pathOrder.length;
  movePawnToId(pathOrder[idx]);
}

function pulseTile(id){
  const t = tileById(id);
  const m = t.mesh.material;
  if(!m.emissive) m.emissive = new THREE.Color(0x000000);
  let elapsed = 0, dur = 1200;
  (function anim(){
    elapsed += 16;
    const k = (Math.sin(elapsed/180)+1)/2;  // 0..1
    t.mesh.scale.setScalar(1 + 0.06*k);
    m.emissive.setRGB(0.2+0.5*k, 0.4+0.2*k, 0.8);
    m.emissiveIntensity = 0.2 + 0.6*k;
    if(elapsed<dur) requestAnimationFrame(anim);
    else { t.mesh.scale.setScalar(1); m.emissiveIntensity=0.0; }
  })();
}

// 展开 & 返回
const btnBack = document.getElementById('btnBack');
if(btnBack) btnBack.onclick = ()=> showDie();

function toUnfold(){
  if(state===State.UNFOLD || state===State.BOARD) return;
  state = State.UNFOLD;

  boardRoot.scale.setScalar(0.001);
  boardRoot.position.copy(die.position);
  boardRoot.visible = true;

  const T = 700; const start = performance.now();
  (function anim(){
    const k = Math.min((performance.now()-start)/T, 1);
    const e = k<.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    boardRoot.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, e));
    boardRoot.position.lerpVectors(die.position, new THREE.Vector3(0,0,0), e);
    if(k<1){ requestAnimationFrame(anim); }
    else {
      die.visible = false;
      state = State.BOARD;
      movePawnSteps(rollResult);
      pulseTile(rollResult);
    }
  })();
}

function showDie(){
  if(state===State.DIE) return;
  die.visible = true;
  die.position.lerp(new THREE.Vector3(0,0.4,0), 1);
  controls.target.copy(die.position);
  controls.update();
  boardRoot.visible = false;
  state = State.DIE;
}

// =============== 工具：补间 =============== //
function tweenVec3(from, to, ms){
  const start = from.clone(); const T = ms; const t0 = performance.now();
  (function go(){
    const k = Math.min((performance.now()-t0)/T, 1);
    const e = k<.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    from.lerpVectors(start, to, e);
    if(k<1) requestAnimationFrame(go);
  })();
}

// =============== 自适应 & 主循环 =============== //
window.addEventListener('resize', ()=>{
  camera.aspect = container.clientWidth/container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

const clock = new THREE.Clock();
function tick(){
  const dt = clock.getDelta();
  controls.enabled = (state===State.DIE && !isDragging);
  controls.update();
  if(state===State.SHAKING) tickShake(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
