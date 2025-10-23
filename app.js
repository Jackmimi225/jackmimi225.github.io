// ESM 方式引入 three（选择相对稳定的 0.158 版本）
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

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

const faces = []; // {mesh,type}
function makeFace(pts, material, type){
  const c = new THREE.Vector3(); pts.forEach(p=>c.add(p)); c.multiplyScalar(1/pts.length);
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
  group.add(mesh);
  faces.push({mesh, type});
}
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

/* ========= 掷骰流程 ========= */
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

/* ========= 星形不对称展开（更接近你的参考） ========= */
const targetMap = new Map();
function prepareStarNet(){
  targetMap.clear();
  const squares = faces.filter(f=>f.type==='square');
  const tris    = faces.filter(f=>f.type==='tri');
  const pickSquare=(sel)=>{const i=squares.findIndex(sel);return i>=0?squares.splice(i,1)[0]:null;}
  const pickTri=(sel)=>{const i=tris.findIndex(sel);return i>=0?tris.splice(i,1)[0]:null;}

  const S1 = pickSquare(f=>Math.abs(f.mesh.userData.center.z-0)<0.2) || squares.shift();
  const S2 = pickSquare(f=>f.mesh.userData.center.z> 0.8) || squares.shift();
  const S3 = pickSquare(f=>f.mesh.userData.center.x> 0.8) || squares.shift();
  const S4 = pickSquare(f=>f.mesh.userData.center.z<-0.8) || squares.shift();
  const S5 = pickSquare(f=>f.mesh.userData.center.x<-0.8) || squares.shift();
  const S6 = pickSquare(f=>f.mesh.userData.center.y> 0.8) || squares.shift();

  const U=1.6;
  const anchors = {
    1:new THREE.Vector3( 0.0,  0.0, 0),
    2:new THREE.Vector3(-2.8,  2.2, 0),
    3:new THREE.Vector3( 3.2,  1.6, 0),
    4:new THREE.Vector3(-0.8, -2.8, 0),
    5:new THREE.Vector3( 2.8, -2.4, 0),
    6:new THREE.Vector3( 5.2,  0.4, 0)
  };
  place(S1, anchors[1], 10,1);
  place(S2, anchors[2].clone().add(new THREE.Vector3(-.2,.3,0)),-28,2);
  place(S3, anchors[3].clone().add(new THREE.Vector3(.1,.2,0)), 18,3);
  place(S4, anchors[4].clone().add(new THREE.Vector3(-.3,-.2,0)),35,4);
  place(S5, anchors[5].clone().add(new THREE.Vector3(.2,-.1,0)),-20,5);
  place(S6, anchors[6], 12,6);

  attach(2, +U*1.0, +U*.9,  -35);
  attach(2, -U*1.4, +U*.6,   25);
  attach(3, +U*1.2, +U*.3,  -15);
  attach(3, +U*1.8, -U*.2,  +30);
  attach(4, -U*1.2, -U*.4,  +40);
  attach(5, +U*1.0, -U*.6,  -28);
  attach(6, +U*1.1, +U*.2,  +18);
  attach(6, +U*1.9, +U*.1,  -12);

  tris.forEach(f=>{
    const r=1+Math.floor(Math.random()*6), base=anchors[r];
    const pos=base.clone().add(new THREE.Vector3((Math.random()-.5)*U*1.6,(Math.random()-.5)*U*1.2,0));
    place(f,pos,(Math.random()*60-30)|0,r);
  });

  function place(face,pos,rzDeg,region){
    if(!face) return;
    const rotQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,THREE.MathUtils.degToRad(rzDeg)));
    targetMap.set(face.mesh.id,{pos,rotQ,region});
  }
  function attach(region,dx,dy,rz){
    const f = tris.shift() || squares.shift(); if(!f) return;
    const base = anchors[region];
    const jitter = new THREE.Vector3((Math.random()-.5)*.15,(Math.random()-.5)*.15,0);
    place(f, base.clone().add(new THREE.Vector3(dx,dy,0)).add(jitter), rz + (Math.random()*10-5), region);
  }
}
prepareStarNet();

async function unfoldStarNet(){
  if(unfolded) return; unfolded=true;
  await tween(600, t=>{
    camera.position.lerp(new THREE.Vector3(0,0,7), easeOut(t));
    camera.lookAt(0,0,0);
  });
  const tasks = faces.map(({mesh})=>{
    const tgt = targetMap.get(mesh.id); if(!tgt) return Promise.resolve();
    const p0 = mesh.position.clone(), q0 = mesh.quaternion.clone();
    const hingeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad((Math.random()>.5?1:-1)*22),0,0));
    return (async ()=>{
      await tween(280,t=>{ THREE.Quaternion.slerp(q0, hingeQ, mesh.quaternion, easeOut(t)); });
      await tween(900,t=>{
        mesh.position.lerpVectors(p0, tgt.pos, easeOut(t));
        THREE.Quaternion.slerp(hingeQ, tgt.rotQ, mesh.quaternion, easeOut(t));
      });
      mesh.userData.region = tgt.region;
    })();
  });
  await Promise.all(tasks);
}

/* ========= 行走高亮 ========= */
async function walkTo(n){
  const path=[]; let cur=currentRegion;
  while(cur!==n){ cur = cur%6 + 1; path.push(cur); }
  for(const step of path){ highlight(step,false); await sleep(360); }
  highlight(n,true); await sleep(260);
}
function highlight(region,strong=false){
  faces.forEach(({mesh})=>{
    if(mesh.userData.region===region){
      const m=mesh.material; m.emissive=new THREE.Color(0x6b74ff); m.emissiveIntensity=strong?.9:.55;
      setTimeout(()=>{ m.emissiveIntensity=0; m.emissive=new THREE.Color(0x000000);}, 280);
    }
  });
}

/* ========= 作品 ========= */
const projects={
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
function tween(ms,fn){ return new Promise(r=>{ const t0=performance.now(); (function f(){const t=Math.min(1,(performance.now()-t0)/ms); fn(t); if(t<1) requestAnimationFrame(f); else r();})(); });}
const easeOut = t=>1-Math.pow(1-t,3);
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
function resize(){ renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
