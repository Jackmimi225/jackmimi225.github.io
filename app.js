// ===== 首屏 three.js 正十二面体（独立于交互逻辑） =====
let renderer, scene, cam, dode, raf;
function initThree(){
  const el = document.getElementById('gl');
  const w = el.clientWidth, h = el.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  cam = new THREE.PerspectiveCamera(55, w/h, 0.1, 100);
  cam.position.set(0, 0, 5);

  const geo = new THREE.DodecahedronGeometry(1, 0); // 正十二面体
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcad3ff, metalness: 0.15, roughness: 0.35,
    flatShading: true
  });
  dode = new THREE.Mesh(geo, mat);
  scene.add(dode);

  // 微光与环境
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(2,3,4); scene.add(key);

  // 轻微漂移动画
  const tick = ()=>{
    dode.rotation.x += 0.003;
    dode.rotation.y += 0.005;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(tick);
  };
  tick();

  window.addEventListener('resize', ()=>{
    const w = el.clientWidth, h = el.clientHeight;
    cam.aspect = w/h; cam.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

document.addEventListener('DOMContentLoaded', initThree);

// ===== 交互：拖拽 → 松手摇 → 显示数值 → 展开 → 脉冲走到结果 → 弹窗 =====
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const cube   = document.getElementById('cube');
const badge  = document.getElementById('badge');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

const projects = {
  1:{title:'作品 1',desc:'示例 A',link:'#'},  2:{title:'作品 2',desc:'示例 B',link:'#'},
  3:{title:'作品 3',desc:'示例 C',link:'#'},  4:{title:'作品 4',desc:'示例 D',link:'#'},
  5:{title:'作品 5',desc:'示例 E',link:'#'},  6:{title:'作品 6',desc:'示例 F',link:'#'},
  7:{title:'作品 7',desc:'示例 G',link:'#'},  8:{title:'作品 8',desc:'示例 H',link:'#'},
  9:{title:'作品 9',desc:'示例 I',link:'#'}, 10:{title:'作品 10',desc:'示例 J',link:'#'},
 11:{title:'作品 11',desc:'示例 K',link:'#'}, 12:{title:'作品 12',desc:'示例 L',link:'#'},
};

const ORDER = [1,2,3,4,5,6,7,8,9,10,11,12];
let faceByNum = {};
document.querySelectorAll('.cell.pent').forEach(el=>{
  const n = parseInt(el.dataset.num,10);
  faceByNum[n]=el;
});

let isDragging=false, rolling=false;
let downX=0, downY=0, baseX=0, baseY=0;
let origin={x:0,y:0};
let lastMoves=[];
let unfolded=false;
let posNum = 1;

// 初始化像素定位
(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// 拖拽
function dragStart(px,py){
  vp.classList.remove('flat'); unfolded=false;
  cube.classList.remove('unfold');
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

  // 拖拽时让十二面体有点视感
  if(dode){
    dode.rotation.x += dy*0.002;
    dode.rotation.y -= dx*0.002;
  }
}
async function dragEnd(){
  if(!isDragging) return;
  isDragging=false;
  dice.classList.remove('grab');
  await startRound();
}

// 事件绑定
dice.addEventListener('mousedown', e=>{
  if(rolling||e.button!==0) return; e.preventDefault();
  dragStart(e.clientX,e.clientY);
  const mm = e=>dragMove(e.clientX,e.clientY);
  const mu = async e=>{ document.removeEventListener('mousemove',mm); await dragEnd(); };
  document.addEventListener('mousemove',mm);
  document.addEventListener('mouseup',mu,{once:true});
});
dice.addEventListener('touchstart', e=>{
  if(rolling||!e.touches[0]) return;
  const t=e.touches[0]; e.preventDefault();
  dragStart(t.clientX,t.clientY);
  const tm = e=>{ if(!e.touches[0]) return; const t=e.touches[0]; dragMove(t.clientX,t.clientY); };
  const tu = async e=>{ document.removeEventListener('touchmove',tm); await dragEnd(); };
  document.addEventListener('touchmove',tm,{passive:false});
  document.addEventListener('touchend',tu,{once:true});
});

// 一回合
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
  const steps=Math.min(30,Math.max(12,Math.round(e/10)+12));
  const final=1+Math.floor(Math.random()*12);
  return {steps,final};
}
function animateRoll(steps,final){
  return new Promise(resolve=>{
    rolling=true;
    let i=0;
    (function loop(){
      const t=i/steps, iv=40+360*t*t;
      if(dode){
        dode.rotation.x += 0.25 + 0.02*i;
        dode.rotation.y += 0.35 + 0.018*i;
        dode.rotation.z += 0.18;
      }
      i++;
      if(i<steps) setTimeout(loop,iv);
      else { rolling=false; resolve(final); }
    })();
  });
}

function showBadge(n){ badge.textContent = n; badge.hidden=false; }
function hideBadge(){ badge.hidden=true; }

async function enterUnfold(){
  if(!unfolded){
    vp.classList.add('flat'); cube.classList.add('unfold');
  }
  await sleep(320);
  setCurrent(posNum);
  unfolded=true;
}

// 走步（1→…→12 的环）
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

// 弹窗
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if(item.link){ mLink.href=item.link; mLink.style.display='inline-block'; } else { mLink.style.display='none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e=>{ if(e.target.dataset.close) modal.hidden=true; });
