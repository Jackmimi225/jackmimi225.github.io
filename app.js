/* ================================
   three.js：首屏立体骰子（加载你的 GLB；失败则兜底为正十二面体）
   ================================ */
let renderer, scene, cam, diceMesh, raf;

function initThree(){
  const mount = document.getElementById('gl');
  const w = mount.clientWidth, h = mount.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setSize(w, h);
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(55, w/h, 0.1, 100);
  cam.position.set(0, 0, 5);

  // 灯光
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(2, 3, 4);
  scene.add(key);

  // 尝试加载你的 GLB（先无 DRACO → 再带 DRACO），都失败则兜底
  tryLoadModel('assets/pingpong.glb?v=2');

  // 轻微转动
  const tick = ()=>{
    if(diceMesh){
      diceMesh.rotation.x += 0.003;
      diceMesh.rotation.y += 0.005;
    }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(tick);
  };
  tick();

  // 自适应
  window.addEventListener('resize', ()=>{
    const w = mount.clientWidth, h = mount.clientHeight;
    cam.aspect = w/h; cam.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

/* ---------- GLB 加载：先无 DRACO，再用 unpkg 的 DRACO 解码器 ---------- */
function loadGLB_NoDraco(url){
  return new Promise((resolve, reject)=>{
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf)=>{
      mountGLB(gltf.scene); resolve(true);
    }, undefined, (err)=>{ console.error('GLB(无DRACO) 失败:', err); reject(err); });
  });
}
function loadGLB_WithDraco(url){
  return new Promise((resolve, reject)=>{
    const loader = new THREE.GLTFLoader();
    const draco  = new THREE.DRACOLoader();
    // 不走 gstatic，改用 unpkg，国内可用性更高
    draco.setDecoderPath('https://unpkg.com/three@0.158.0/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(url, (gltf)=>{
      mountGLB(gltf.scene); resolve(true);
    }, undefined, (err)=>{ console.error('GLB(带DRACO) 失败:', err); reject(err); });
  });
}
async function tryLoadModel(url){
  let ok = false;
  try { ok = await loadGLB_NoDraco(url); } catch(e){}
  if(!ok){ try { ok = await loadGLB_WithDraco(url); } catch(e){} }
  if(!ok){ console.warn('两种方式都失败，使用兜底十二面体'); makeFallbackDodeca(); }
}
function mountGLB(obj){
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);                 // 居中
  obj.scale.multiplyScalar(2.2 / size);     // 缩放到合适尺寸
  obj.traverse(n=>{ if(n.isMesh){ n.castShadow = n.receiveShadow = true; }});
  scene.add(obj);
  diceMesh = obj;
  console.log('GLB loaded ✓');
}
function makeFallbackDodeca(){
  const geo = new THREE.DodecahedronGeometry(1,0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcad3ff, metalness: 0.15, roughness: 0.35, flatShading: true
  });
  diceMesh = new THREE.Mesh(geo, mat);
  scene.add(diceMesh);
}

document.addEventListener('DOMContentLoaded', initThree);

/* ================================
   交互：拖拽 → 松手摇 → 显示点数 → 展开 → 脉冲到结果 → 弹窗
   ================================ */
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const badge  = document.getElementById('badge');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// 作品映射（占位，替换成你的）
const projects = {
  1:{title:'作品 1',desc:'示例 A',link:'#'},  2:{title:'作品 2',desc:'示例 B',link:'#'},
  3:{title:'作品 3',desc:'示例 C',link:'#'},  4:{title:'作品 4',desc:'示例 D',link:'#'},
  5:{title:'作品 5',desc:'示例 E',link:'#'},  6:{title:'作品 6',desc:'示例 F',link:'#'},
  7:{title:'作品 7',desc:'示例 G',link:'#'},  8:{title:'作品 8',desc:'示例 H',link:'#'},
  9:{title:'作品 9',desc:'示例 I',link:'#'}, 10:{title:'作品 10',desc:'示例 J',link:'#'},
 11:{title:'作品 11',desc:'示例 K',link:'#'}, 12:{title:'作品 12',desc:'示例 L',link:'#'},
};

// 展开图上的 12 个格子
const ORDER = [1,2,3,4,5,6,7,8,9,10,11,12];
let faceByNum = {};
document.querySelectorAll('.cell.pent').forEach(el=>{
  const n = parseInt(el.dataset.num,10); faceByNum[n]=el;
});

// 状态
let isDragging=false, rolling=false;
let downX=0, downY=0, baseX=0, baseY=0;
let origin={x:0,y:0};
let lastMoves=[];
let unfolded=false;
let posNum = 1;

// 初始像素定位（居中后写回具体像素，便于拖拽）
(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------- 拖拽 ---------- */
function dragStart(px,py){
  vp.classList.remove('flat'); unfolded=false;
  clearHighlights();
  isDragging = true;
  const rect = dice.getBoundingClientRect();
  baseX = rect.left; baseY = rect.top;
  downX = px; downY = py;
  dice.classList.add('grab');
}
function dragMove(px,py){
  if(!isDragging) return;
  const dx = px - downX, dy = py - downY;
  dice.style.left = (baseX + dx) + 'px';
  dice.style.top  = (baseY + dy) + 'px';
  lastMoves.push({dx,dy,t:performance.now()});
  if(lastMoves.length>32) lastMoves.shift();
  if(diceMesh){ // 纯视觉反馈
    diceMesh.rotation.x += dy*0.002;
    diceMesh.rotation.y -= dx*0.002;
  }
}
async function dragEnd(){
  if(!isDragging) return;
  isDragging=false; dice.classList.remove('grab');
  await startRound();
}

// 事件绑定
dice.addEventListener('mousedown', e=>{
  if(rolling||e.button!==0) return; e.preventDefault();
  dragStart(e.clientX,e.clientY);
  const mm = e=>dragMove(e.clientX,e.clientY);
  const mu = async()=>{ document.removeEventListener('mousemove',mm); await dragEnd(); };
  document.addEventListener('mousemove',mm);
  document.addEventListener('mouseup',mu,{once:true});
});
dice.addEventListener('touchstart', e=>{
  if(rolling||!e.touches[0]) return;
  const t=e.touches[0]; e.preventDefault();
  dragStart(t.clientX,t.clientY);
  const tm = e=>{ if(!e.touches[0]) return; const t=e.touches[0]; dragMove(t.clientX,t.clientY); };
  const tu = async()=>{ document.removeEventListener('touchmove',tm); await dragEnd(); };
  document.addEventListener('touchmove',tm,{passive:false});
  document.addEventListener('touchend',tu,{once:true});
});

/* ---------- 一回合 ---------- */
async function startRound(){
  const {steps,final} = getRollPlan();
  const n = await animateRoll(steps, final);
  showBadge(n); await sleep(2500); hideBadge();
  await enterUnfold();
  await walkTo(n);
  await sleep(2000);
  openProject(n);
}

function rollEnergy(){
  const r=lastMoves.slice(-6);
  if(!r.length) return 0;
  const d=r[r.length-1];
  return Math.hypot(d.dx,d.dy);
}
function getRollPlan(){
  const e=rollEnergy();
  const steps=Math.min(30,Math.max(12,Math.round(e/10)+12)); // 12~30 步
  const final=1+Math.floor(Math.random()*12);
  return {steps,final};
}
function animateRoll(steps,final){
  return new Promise(resolve=>{
    rolling=true; let i=0;
    (function loop(){
      const t=i/steps, iv=40+360*t*t; // ease-out
      if(diceMesh){
        diceMesh.rotation.x += 0.25 + 0.02*i;
        diceMesh.rotation.y += 0.35 + 0.018*i;
        diceMesh.rotation.z += 0.18;
      }
      i++; if(i<steps) setTimeout(loop,iv); else { rolling=false; resolve(final); }
    })();
  });
}
function showBadge(n){ badge.textContent=n; badge.hidden=false; }
function hideBadge(){ badge.hidden=true; }

async function enterUnfold(){
  if(!unfolded){ vp.classList.add('flat'); }
  await sleep(320); // 等展开图显现动画
  setCurrent(posNum);
  unfolded=true;
}

/* ---------- 展开图脉冲行走 ---------- */
const STEP_MS = 340;
async function walkTo(targetNum){
  const curIdx = ORDER.indexOf(posNum);
  const tarIdx = ORDER.indexOf(targetNum);
  if(curIdx===-1 || tarIdx===-1){ setCurrent(targetNum); posNum=targetNum; return; }
  let steps = (tarIdx - curIdx + ORDER.length) % ORDER.length;
  if(steps===0){ pulse(faceByNum[targetNum]); setCurrent(targetNum); posNum=targetNum; await sleep(STEP_MS); return; }
  for(let k=0;k<steps;k++){
    const nextIdx=(ORDER.indexOf(posNum)+1)%ORDER.length;
    posNum=ORDER[nextIdx];
    pulse(faceByNum[posNum]); setCurrent(posNum);
    await sleep(STEP_MS);
  }
}
function pulse(el){ if(!el) return; el.classList.remove('active'); void el.offsetWidth; el.classList.add('active'); }
function setCurrent(n){ clearHighlights(); const el=faceByNum[n]; if(el) el.classList.add('current'); }
function clearHighlights(){ document.querySelectorAll('.cell.active,.cell.current').forEach(el=>el.classList.remove('active','current')); }

/* ---------- 弹窗 ---------- */
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if(item.link){ mLink.href=item.link; mLink.style.display='inline-block'; } else { mLink.style.display='none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e=>{ if(e.target.dataset.close) modal.hidden=true; });
