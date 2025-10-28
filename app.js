// —— 日志与错误捕获 —— //
console.log('[app] loaded', new Date().toISOString());
window.addEventListener('error', e => console.log('[app] error', e.message));

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// =============== 基础场景 =============== //
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f13);

const camera = new THREE.PerspectiveCamera(55, container.clientWidth/container.clientHeight, 0.01, 200);
camera.position.set(3.2, 2.2, 3.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;

const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(4,6,5);
dir.castShadow = true;
dir.shadow.mapSize.set(1024,1024);
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 80),
  new THREE.MeshStandardMaterial({ color:0x101216, metalness:0.05, roughness:0.95 })
);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

// =============== 状态机 =============== //
const State = { DIE:'die', SHAKING:'shaking', UNFOLD:'unfold', BOARD:'board' };
let state = State.DIE;
let rollResult = 1;

// =============== 构建“截半立方体（cuboctahedron）”骰子 =============== //
// 顶点：所有 (±1,±1,0) / (±1,0,±1) / (0,±1,±1)
const V = [];
[[-1,1,0],[1,1,0],[-1,-1,0],[1,-1,0],[-1,0,1],[1,0,1],[-1,0,-1],[1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]]
.forEach(p=>V.push(new THREE.Vector3(...p)));
const verts = V.map(v=>v.clone().multiplyScalar(0.8)); // 缩放一下

// 面（全部三角化）：原本 6 个正方形 + 8 个三角形，共 14 面
// 我们给每个“面”一个编号（1..14），用于贴数字 & 展开时的映射
// 下面 indicesTri 是三角化索引；faceMap 映射每个“原始面”由哪些三角组成
const faceMap = [];  // [{id, tris:[ [a,b,c], [a,b,c] ] , type:'sq'|'tri', center:Vec3 }]
function addSquare(id, a,b,c,d){ // 以 a-b-c-d 顺时针，拆两三角
  faceMap.push({ id, type:'sq', tris:[[a,b,c],[a,c,d]] });
}
function addTri(id, a,b,c){
  faceMap.push({ id, type:'tri', tris:[[a,b,c]] });
}

// —— 这里采用一种标准连结（可视等效即可） —— //
// 6 squares:
addSquare( 1, 0,1,3,2);   // z≈0 上层方
addSquare( 2, 4,5,1,0);
addSquare( 3, 6,7,3,2);
addSquare( 4, 8,5,7,10);
addSquare( 5, 9,4,6,11);
addSquare( 6, 8,10,11,9);
// 8 triangles:
addTri( 7, 5,8,1);
addTri( 8, 8,0,1);
addTri( 9, 4,0,8);
addTri(10, 4,9,0);
addTri(11, 7,5,3);
addTri(12, 5,1,3);
addTri(13, 6,2,9);
addTri(14, 2,11,9);

// 组装 Geometry（把所有三角 push 进去）
const dieGeo = new THREE.BufferGeometry();
{
  const pos = [];
  const normal = [];
  const uv = [];
  const tmpA = new THREE.Vector3(), tmpB=new THREE.Vector3(), tmpC=new THREE.Vector3(), n=new THREE.Vector3();

  faceMap.forEach(F=>{
    F.tris.forEach(t=>{
      const a=verts[t[0]], b=verts[t[1]], c=verts[t[2]];
      pos.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
      // 简单法线
      tmpA.copy(b).sub(a); tmpB.copy(c).sub(a); n.copy(tmpA).cross(tmpB).normalize();
      for(let i=0;i<3;i++) normal.push(n.x,n.y,n.z);
      // 每个三角用一个小UV，给后面数字贴图（canvas）留位置
      uv.push(0,0, 1,0, 0.5,1);
    });
  });

  dieGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  dieGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(normal,3));
  dieGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(uv,2));
  dieGeo.computeBoundingSphere();
}

// 生成每个面的“数字贴图”（CanvasTexture）
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
const mats = [];
for(let i=1;i<=14;i++){
  const tex = makeFaceTexture(i, '#e8e8ec', i<=6 ? '#3a4252' : '#314045'); // 方/三角用不同底色
  mats.push(new THREE.MeshStandardMaterial({ map:tex, metalness:0.2, roughness:0.9 }));
}
// 为了简单：所有三角都用 mats[(其所属原始面的 id)-1]
const groups=[];
{
  let triIndex=0;
  faceMap.forEach(F=>{
    const triCount = F.tris.length;
    dieGeo.addGroup(triIndex*3, triCount*3, F.id-1); // 每个三角3顶点
    triIndex += triCount;
    groups.push({id:F.id, type:F.type});
  });
}
const die = new THREE.Mesh(dieGeo, mats);
die.castShadow = true;
scene.add(die);

// =============== 交互：拖动 & 摇晃 =============== //
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let isDragging=false;
let lastPos = new THREE.Vector3();
let vel2D = new THREE.Vector2(0,0);
const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0); // y=0 平面

function screenToGround(x,y,out){
  mouseNDC.set((x/container.clientWidth)*2-1, -(y/container.clientHeight)*2+1);
  raycaster.setFromCamera(mouseNDC, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  if(out) out.copy(hit);
  return hit;
}

container.addEventListener('mousedown', (e)=>{
  if(e.button!==0 || state!==State.DIE) return;
  isDragging=true;
  controls.enabled=false;
  screenToGround(e.offsetX, e.offsetY, lastPos);
  vel2D.set(0,0);
});
container.addEventListener('mousemove', (e)=>{
  if(!isDragging || state!==State.DIE) return;
  const p = screenToGround(e.offsetX, e.offsetY, new THREE.Vector3());
  const d = p.clone().sub(lastPos);
  die.position.add(d);
  vel2D.set(d.x, d.z); // 用水平速度
  lastPos.copy(p);
});
container.addEventListener('mouseup', (e)=>{
  if(e.button!==0 || !isDragging || state!==State.DIE) return;
  isDragging=false;
  controls.enabled=true;
  startShake(vel2D.length());
});

let angVel = new THREE.Vector3();
function startShake(strength){
  state = State.SHAKING;
  const s = THREE.MathUtils.clamp(strength*6 + (Math.random()*1.2+0.3), 0.8, 6.0);
  // 随机角速度方向
  angVel.set(Math.random()*s, Math.random()*s, Math.random()*s);
  // 投骰点数（1..14）
  rollResult = 1 + Math.floor(Math.random()*14);
  // 3秒左右阻尼停止
}
function tickShake(dt){
  // 简单欧拉积分旋转 + 阻尼
  die.rotation.x += angVel.x*dt;
  die.rotation.y += angVel.y*dt;
  die.rotation.z += angVel.z*dt;
  angVel.multiplyScalar(0.96);
  if(angVel.length()<0.2){
    angVel.set(0,0,0);
    // 停止后 2 秒展开
    setTimeout(()=>toUnfold(), 2000);
    state = State.DIE; // 先回到静止，等待切换
  }
}

// =============== 展开图（2D Board） =============== //
// 构建一个“蛇形”展开图：14 个格（6 方 + 8 三角），顺序 1..14
const boardRoot = new THREE.Group();
boardRoot.visible = false;
scene.add(boardRoot);

const tileSize = 1.0;     // 方格边长
const triH = tileSize*Math.sqrt(3)/2; // 等边三角高
const tiles = []; // {id, mesh, pos:Vector3}
const pathOrder = []; // 1..14

// 画格子材质（和骰子编号保持一致）
function tileMat(n, type){
  const bg = type==='sq' ? '#263041' : '#24363a';
  return new THREE.MeshBasicMaterial({ map: makeFaceTexture(n,'#e8e8ec', bg) });
}

// 简单布局：S 形链（近似维基展开图风格）
(function buildBoard(){
  // 布局坐标（顶视图 XZ 平面）
  // 以 6 个方格为主干，三角贴在拐角和边上，编号与上面 faceMap 顺序一致
  const layout = [
    {id:1,  type:'sq', x:0, z:0},
    {id:2,  type:'sq', x:1, z:0},
    {id:3,  type:'sq', x:2, z:0},
    {id:4,  type:'sq', x:2, z:1},
    {id:5,  type:'sq', x:1, z:1},
    {id:6,  type:'sq', x:0, z:1},
    // 8 个三角，围绕主干
    {id:7,  type:'tri', x:2.5, z:-0.5, rot:Math.PI/2},
    {id:8,  type:'tri', x:-0.5, z:-0.5, rot:Math.PI/2},
    {id:9,  type:'tri', x:-0.5, z: 1.5, rot:-Math.PI/2},
    {id:10, type:'tri', x:0.5,  z:-0.5, rot:Math.PI/2},
    {id:11, type:'tri', x:2.5,  z: 0.5, rot:Math.PI},
    {id:12, type:'tri', x:1.5,  z:-0.5, rot:Math.PI/2},
    {id:13, type:'tri', x:0.5,  z: 1.5, rot:-Math.PI/2},
    {id:14, type:'tri', x:1.5,  z: 1.5, rot:-Math.PI/2},
  ];
  layout.forEach(L=>{
    let mesh;
    if(L.type==='sq'){
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), tileMat(L.id,'sq'));
    }else{
      // 等边三角，底边对齐 X 轴；再按 rot 旋转
      const g = new THREE.BufferGeometry();
      const h = triH;
      const verts = new Float32Array([
        -tileSize/2,0,0,   tileSize/2,0,0,   0,h,0
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(verts,3));
      g.computeVertexNormals();
      mesh = new THREE.Mesh(g, tileMat(L.id,'tri'));
      mesh.rotation.z = L.rot||0; // 在本地平面内转向（之后整体旋到平放）
    }
    // 放在 XZ 平面（于是把平面从 XY 旋到 XZ）
    mesh.rotation.x = -Math.PI/2;
    mesh.position.set(L.x*tileSize, 0.01, L.z*tileSize);
    mesh.userData.id = L.id;
    boardRoot.add(mesh);
    tiles.push({id:L.id, mesh, pos:mesh.position.clone()});
    pathOrder.push(L.id);
  });

  // 棋子
  const pawnGeo = new THREE.SphereGeometry(0.15, 32, 16);
  const pawnMat = new THREE.MeshStandardMaterial({ color:0x5da9ff, metalness:0.3, roughness:0.4, emissive:0x10253a, emissiveIntensity:0.4 });
  pawn = new THREE.Mesh(pawnGeo, pawnMat);
  pawn.position.set(tiles[0].pos.x, 0.12, tiles[0].pos.z);
  boardRoot.add(pawn);
})();
let pawn;

// 展开与返回
const btnBack = document.getElementById('btnBack');
btnBack.onclick = () => showDie();

function toUnfold(){
  if(state===State.UNFOLD || state===State.BOARD) return;
  state = State.UNFOLD;
  // 隐去骰子 → 显示展开图（从骰子位置缩放出现）
  boardRoot.scale.set(0.001,0.001,0.001);
  boardRoot.position.copy(die.position);
  boardRoot.visible = true;
  // 动画到居中
  const target = new THREE.Vector3(0,0,0);
  const T = 700; let t0 = performance.now();
  (function anim(){
    const t = performance.now()-t0; const k = Math.min(t/T, 1);
    // ease
    const e = k<.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    boardRoot.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, e));
    boardRoot.position.lerpVectors(die.position, target, e);
    if(k<1) requestAnimationFrame(anim); else {
      die.visible = false;
      state = State.BOARD;
      // 移动棋子到 rollResult
      movePawnSteps(rollResult);
      pulseTile(rollResult);
    }
  })();
}

function showDie(){
  if(state===State.DIE) return;
  die.visible = true;
  // 让骰子回到场中心
  die.position.lerp(new THREE.Vector3(0,0,0), 1);
  boardRoot.visible = false;
  state = State.DIE;
}

// =============== 棋子移动与脉冲高亮 =============== //
function tileById(id){ return tiles.find(t=>t.id===id); }

function movePawnSteps(n){
  // 从 1 开始数，落在第 n 格（若超出则循环）
  const idx = (n-1) % pathOrder.length;
  const dstId = pathOrder[idx];
  const dst = tileById(dstId).pos;
  tweenVec3(pawn.position, new THREE.Vector3(dst.x, 0.12, dst.z), 800);
}

function pulseTile(id){
  const t = tileById(id);
  const m = t.mesh.material;
  let elapsed = 0; const dur = 1200;
  const base = (m.emissive && m.emissive.getHex) ? m.emissive.getHex() : 0x000000;
  if(!m.emissive){ m.emissive = new THREE.Color(0x000000); }
  (function p(){
    elapsed += 16;
    const k = (Math.sin(elapsed/180)+1)/2; // 0..1
    m.emissive.setHex(0x3355aa);
    m.emissiveIntensity = 0.6*k + 0.2;
    t.mesh.scale.setScalar(1 + 0.06*k);
    if(elapsed<dur){ requestAnimationFrame(p); }
    else { t.mesh.scale.setScalar(1); m.emissiveIntensity = 0.0; m.emissive.setHex(base); }
  })();
}

function tweenVec3(from, to, ms){
  const start = from.clone(); const T = ms; const t0 = performance.now();
  (function anim(){
    const t = (performance.now()-t0)/T; const k = Math.min(t,1);
    const e = k<.5 ? 2*k*k : 1 - Math.pow(-2*k+2,2)/2;
    from.lerpVectors(start, to, e);
    if(k<1) requestAnimationFrame(anim);
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

