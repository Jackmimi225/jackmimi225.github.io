/* ========= 基础场景 ========= */
const canvas = document.getElementById('stage');
const hud    = document.getElementById('hud');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
resize(); window.addEventListener('resize', resize);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 1.2, 7);
scene.add(camera);

scene.add(new THREE.AmbientLight(0xffffff, .55));
const key = new THREE.DirectionalLight(0xffffff, .95); key.position.set(6,9,10); scene.add(key);

/* ========= 几何：正方八面体（6 方 + 8 三 = 14 面） ========= */
const group = new THREE.Group();
scene.add(group);

const matSquare = new THREE.MeshStandardMaterial({ color:0xeef5fb, roughness:.5, metalness:.05 });
const matTri    = new THREE.MeshStandardMaterial({ color:0xf7f0fb, roughness:.5, metalness:.05 });
const edgeMat   = new THREE.LineBasicMaterial({ color:0x2a3a57, linewidth:1 });

const faces = []; // {mesh,type,id, center, vertsWorld}

function makeFace(pts, material, type){
  // center
  const c = new THREE.Vector3();
  pts.forEach(p=>c.add(p)); c.multiplyScalar(1/pts.length);

  const local = pts.map(p=>p.clone().sub(c));
  const geo = new THREE.BufferGeometry();
  const arr = [];
  if(local.length===3){
    arr.push(...local[0].toArray(), ...local[1].toArray(), ...local[2].toArray());
  }else{
    arr.push(...local[0].toArray(), ...local[1].toArray(), ...local[2].toArray());
    arr.push(...local[0].toArray(), ...local[2].toArray(), ...local[3].toArray());
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material.clone());
  mesh.position.copy(c);

  const lineGeo = new THREE.BufferGeometry().setFromPoints(local.concat([local[0]]));
  mesh.add(new THREE.Line(lineGeo, edgeMat));

  mesh.userData.center = c.clone();
  mesh.userData.vertsWorld = pts.map(p=>p.clone());
  mesh.userData.type = type;
  group.add(mesh);
  faces.push({mesh, type});
}

/* 按坐标构建 6 方 + 8 三 */
['x','y','z'].forEach(axis=>{
  [-1,1].forEach(s=>{
    const p=[];
    if(axis==='x'){ p.push(new THREE.Vector3(s,-1,0), new THREE.Vector3(s,0,-1), new THREE.Vector3(s,1,0), new THREE.Vector3(s,0,1)); }
    if(axis==='y'){ p.push(new THREE.Vector3(-1,s,0), new THREE.Vector3(0,s,-1), new THREE.Vector3(1,s,0), new THREE.Vector3(0,s,1)); }
    if(axis==='z'){ p.push(new THREE.Vector3(0,-1,s), new THREE.Vector3(-1,0,s), new THREE.Vector3(0,1,s), new THREE.Vector3(1,0,s)); }
    makeFace(p, matSquare, 'square');
  });
});
for(const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]){
  const p = [ new THREE.Vector3(sx,sy,0), new THREE.Vector3(sx,0,sz), new THREE.Vector3(0,sy,sz) ];
  makeFace(p, matTri, 'tri');
}

/* 初始透视角度 */
group.rotation.set(-0.55, 0.95, 0.18);

/* ========= 拖拽：按住即可拖，松手即“摇” ========= */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const planeZ = new THREE.Plane(new THREE.Vector3(0,0,1), 0);

let dragging=false, dragStart=null, groupStart=null, moveTail=[];
canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId);
  dragging=true; canvas.classList.add('dragging');
  moveTail.length=0;
  dragStart = planeHit(e.clientX, e.clientY) || new THREE.Vector3();
  groupStart = group.position.clone();
});
canvas.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const p = planeHit(e.clientX, e.clientY); if(!p) return;
  group.position.copy(groupStart.clone().add(p.sub(dragStart)));
  moveTail.push({dx:e.movementX, dy:e.movementY});
  if(moveTail.length>24) moveTail.shift();
});
canvas.addEventListener('pointerup', async e=>{
  if(!dragging) return;
  dragging=false; canvas.classList.remove('dragging');
  await startRoll();
});

function planeHit(x,y){
  ndc.set((x/innerWidth)*2-1, -(y/innerHeight)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(planeZ, p);
  return p;
}

/* ========= 掷骰 → 数字 2.5s → 展开（不对称星形网） → 行走高亮 → 弹作品 ========= */
let rolling=false, unfolded=false, currentRegion=1;

async function startRoll(){
  if(rolling) return; rolling=true;

  const last = moveTail.at(-1) || {dx:(Math.random()*2-1)*28, dy:(Math.random()*2-1)*28};
  let vx = THREE.MathUtils.degToRad(last.dy*0.6);
  let vy = THREE.MathUtils.degToRad(-last.dx*0.6);
  let vz = THREE.MathUtils.degToRad((Math.random()*2-1)*6);

  const t0 = performance.now();
  await new Promise(res=>{
    const loop=()=>{
      const t=(performance.now()-t0)/1400; const k=Math.max(0,1-t);
      group.rotation.x += vx*k*0.08;
      group.rotation.y += vy*k*0.08;
      group.rotation.z += vz*k*0.06;
      if(k>0.02) requestAnimationFrame(loop); else res();
    }; loop();
  });

  const n = 1 + Math.floor(Math.random()*6);
  hud.textContent = n; hud.classList.add('show');
  await sleep(2500); hud.classList.remove('show');

  await unfoldStarNet();
  await walkTo(n);
  openProject(n);
  currentRegion=n; rolling=false;
}

/* —— 星形不对称网（更像你给的参考：臂长不等、角度不等、不是整齐网格） —— */
const targetMap = new Map(); // faceId -> {pos, rotQ, region}
function prepareStarNet(){
  targetMap.clear();
  // 先挑 6 个“区域主方形”，再把周边三角/方形挂到它们附近，构成 1~6 的不等臂
  const squares = faces.filter(f=>f.type==='square');
  const tris    = faces.filter(f=>f.type==='tri');

  // 辅助：按面中心的大致方向挑面
  const pickSquare = (sel)=>takeOne(squares, sel);
  const pickTri    = (sel)=>takeOne(tris,    sel);
  function takeOne(arr, sel){
    const i = arr.findIndex(sel); if(i<0) return null;
    return arr.splice(i,1)[0];
  }

  // 依据中心坐标（±1 平面）大致锁定 6 个主方形
  const S1 = pickSquare(f=>Math.abs(f.mesh.userData.center.z-0)>0.9); // 中心带的一个
  const S2 = pickSquare(f=>f.mesh.userData.center.z> 0.9);
  const S3 = pickSquare(f=>f.mesh.userData.center.x> 0.9);
  const S4 = pickSquare(f=>f.mesh.userData.center.z<-0.9);
  const S5 = pickSquare(f=>f.mesh.userData.center.x<-0.9);
  const S6 = pickSquare(f=>f.mesh.userData.center.y> 0.9) || pickSquare(()=>true);

  // 星形臂的“基点”（世界 z=0 平面），单位大概 1.6
  const U=1.6;
  const anchors = {
    1: new THREE.Vector3( 0.0,  0.0, 0),
    2: new THREE.Vector3(-2.8,  2.2, 0),
    3: new THREE.Vector3( 3.2,  1.6, 0),
    4: new THREE.Vector3(-0.8, -2.8, 0),
    5: new THREE.Vector3( 2.8, -2.4, 0),
    6: new THREE.Vector3( 5.2,  0.4, 0) // 让 6 在右侧远一点（臂长不等）
  };

  // 放 6 个主方形（旋转角度不等，造型随性）
  placeFace(S1, anchors[1], deg(10),  1);
  placeFace(S2, anchors[2].clone().add(new THREE.Vector3(-.2,.3,0)), deg(-28), 2);
  placeFace(S3, anchors[3].clone().add(new THREE.Vector3(.1,.2,0)), deg(18),  3);
  placeFace(S4, anchors[4].clone().add(new THREE.Vector3(-.3,-.2,0)), deg(35), 4);
  placeFace(S5, anchors[5].clone().add(new THREE.Vector3(.2,-.1,0)), deg(-20),5);
  placeFace(S6, anchors[6].clone().add(new THREE.Vector3(.0,.0,0)), deg(12),  6);

  // 给每个区域再挂 1~2 个三角/方形，构成不规则臂
  attachAround(2, 1, +U*1.0, +U*.9,  -35);
  attachAround(2, 1, -U*1.4, +U*.6,   25);

  attachAround(3, 1, +U*1.2, +U*.3,  -15);
  attachAround(3, 1, +U*1.8, -U*.2,  +30);

  attachAround(4, 1, -U*1.2, -U*.4,  +40);

  attachAround(5, 1, +U*1.0, -U*.6,  -28);

  attachAround(6, 1, +U*1.1, +U*.2,  +18);
  attachAround(6, 1, +U*1.9, +U*.1,  -12);

  // 再把剩余的三角零散撒在臂上
  tris.forEach(f=>{
    const r = 1 + Math.floor(Math.random()*6);
    const base = anchors[r];
    const pos = base.clone().add(new THREE.Vector3(
      (Math.random()-.5)*U*1.6,
      (Math.random()-.5)*U*1.2,
      0
    ));
    placeFace(f, pos, deg((Math.random()*60-30)|0), r);
  });

  function placeFace(face, pos, rotEulerZ, region){
    if(!face) return;
    const rotQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,rotEulerZ));
    targetMap.set(face.mesh.id, { pos, rotQ, region });
  }
  function attachAround(region, count=1, dx=0, dy=0, rz=0){
    for(let i=0;i<count;i++){
      const f = tris.shift() || squares.shift(); if(!f) return;
      const base = anchors[region];
      const jitter = new THREE.Vector3((Math.random()-.5)*.15,(Math.random()-.5)*.15,0);
      placeFace(f, base.clone().add(new THREE.Vector3(dx,dy,0)).add(jitter), deg(rz + (Math.random()*10-5)), region);
    }
  }
  function deg(a){ return THREE.MathUtils.degToRad(a); }
}
prepareStarNet();

async function unfoldStarNet(){
  if(unfolded){ return; }
  unfolded=true;

  // 相机回到正视
  await tween(600, t=>{
    camera.position.lerp(new THREE.Vector3(0,0,7), easeOut(t));
    camera.lookAt(0,0,0);
  });

  // 每个面“沿边开合感”：先绕一个近似“铰链轴”旋一点，再平移旋到目标
  const tasks = faces.map(({mesh})=>{
    const tgt = targetMap.get(mesh.id); if(!tgt) return Promise.resolve();

    const p0 = mesh.position.clone();
    const q0 = mesh.quaternion.clone();

    // 铰链预摆：绕局部 x 轻掀（正负随机），有“纸盒开”的味道
    const hingeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad((Math.random()>.5?1:-1)*22),0,0));

    return (async ()=>{
      await tween(280, t=>{
        THREE.Quaternion.slerp(q0, hingeQ, mesh.quaternion, easeOut(t));
      });
      await tween(900, t=>{
        mesh.position.lerpVectors(p0, tgt.pos, easeOut(t));
        THREE.Quaternion.slerp(hingeQ, tgt.rotQ, mesh.quaternion, easeOut(t));
      });
      // 记录区域
      mesh.userData.region = tgt.region;
    })();
  });
  await Promise.all(tasks);
}

/* —— 行走：从 currentRegion 逐格高亮走到 n —— */
async function walkTo(n){
  const path=[];
  let cur=currentRegion;
  while(cur!==n){ cur = cur%6 + 1; path.push(cur); }
  for(const step of path){
    highlight(step, false);
    await sleep(360);
  }
  highlight(n, true);
  await sleep(260);
}
function highlight(region, strong=false){
  faces.forEach(({mesh})=>{
    if(mesh.userData.region===region){
      const m=mesh.material;
      m.emissive = new THREE.Color(0x6b74ff);
      m.emissiveIntensity = strong? .9 : .55;
      setTimeout(()=>{
        m.emissiveIntensity = 0; m.emissive = new THREE.Color(0x000000);
      }, 280);
    }
  });
}

/* —— 作品数据 —— */
const projects = {
  1:{title:'作品 1',desc:'示例：装置 / 北极簇',link:'#'},
  2:{title:'作品 2',desc:'示例：北大西洋簇',link:'#'},
  3:{title:'作品 3',desc:'示例：欧亚簇',link:'#'},
  4:{title:'作品 4',desc:'示例：印度洋簇',link:'#'},
  5:{title:'作品 5',desc:'示例：大洋洲簇',link:'#'},
  6:{title:'作品 6',desc:'示例：南极簇',link:'#'},
};
function openProject(n){
  const p=projects[n]||{title:'作品 '+n,desc:'',link:''};
  mTitle.textContent=p.title; mDesc.textContent=p.desc;
  if(p.link){ mLink.href=p.link; mLink.style.display='inline-block'; } else { mLink.style.display='none'; }
  modal.hidden=false;
}
modal.addEventListener('click',e=>{ if(e.target.dataset.close) modal.hidden=true; });

/* ========= 工具 ========= */
function tween(ms, fn){ return new Promise(r=>{ const t0=performance.now(); (function f(){const t=Math.min(1,(performance.now()-t0)/ms); fn(t); if(t<1) requestAnimationFrame(f); else r();})(); });}
const easeOut = t=>1-Math.pow(1-t,3);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

renderer.setAnimationLoop(()=>{ renderer.render(scene,camera); });
function resize(){ renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
