// ===== 几何参数（严格的 cuboctahedron） =====
// 设想边长 = A 像素，则：方形面所在平面距中心 s = A/√2；
// 三角面所在平面距中心 t = 2s/√3 = (A√2)/√3。
const ROOT2 = Math.SQRT2;
const ROOT3 = Math.sqrt(3);
const toDeg = r => r * 180 / Math.PI;

// ===== UI 尺寸同步 =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 260;
const A     = Math.round(SIZE * 0.62);      // 多面体边长（可调）——略小于容器
const sDist = A / ROOT2;
const tDist = (A * ROOT2) / ROOT3;

// DOM
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const cube   = document.getElementById('cube');   // 折叠/展开容器
const solid  = document.getElementById('solid3d');
const badge  = document.getElementById('badge');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// 将边长写入 CSS 变量，供 .sq2d/.tri2d 使用
cube.style.setProperty('--a', A + 'px');

// 作品（按需替换）
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// ====== 生成真正的 cuboctahedron 面 ======
// 6 个正方形面：法向沿 +X/-X/+Y/-Y/+Z/-Z
const squares = [
  {axis:'x',sign:+1}, {axis:'x',sign:-1},
  {axis:'y',sign:+1}, {axis:'y',sign:-1},
  {axis:'z',sign:+1}, {axis:'z',sign:-1},
];
// 8 个三角形面：法向沿 (±1,±1,±1)
const triNorms = [];
[+1,-1].forEach(ix=>{
  [+1,-1].forEach(iy=>{
    [+1,-1].forEach(iz=>{
      triNorms.push({nx:ix, ny:iy, nz:iz});
    });
  });
});

// 方形面：在对应轴方向旋转到位→沿该轴正向 translateZ(sDist)
function addSquareFace(axis, sign){
  const wrap = document.createElement('div'); wrap.className='face3d';
  let rot = '';
  if(axis==='x') rot = `rotateY(${sign>0?90:-90}deg) translateZ(${sDist}px)`;
  if(axis==='y') rot = `rotateX(${sign>0?-90:90}deg) translateZ(${sDist}px)`;
  if(axis==='z') rot = `rotateY(${sign>0?0:180}deg) translateZ(${sDist}px)`;
  wrap.style.transform = rot;

  const inner = document.createElement('div'); inner.className='sq2d';
  // 为了更接近真实的“菱形朝向”，在平面内轻微旋转
  inner.style.transform = 'translate(-50%,-50%) rotate(45deg)';
  wrap.appendChild(inner);
  solid.appendChild(wrap);
}

// 三角面：把 Z 轴法向(0,0,1)旋到 (nx,ny,nz) 后，再 translateZ(tDist)
function addTriFace(nx,ny,nz){
  const wrap = document.createElement('div'); wrap.className='face3d';
  // yaw = atan2(nx, nz), pitch = -atan2(ny, sqrt(nx^2+nz^2))
  const yaw   = Math.atan2(nx, nz);
  const pitch = -Math.atan2(ny, Math.hypot(nx, nz));
  wrap.style.transform = `rotateY(${toDeg(yaw)}deg) rotateX(${toDeg(pitch)}deg) translateZ(${tDist}px)`;

  const inner = document.createElement('div'); inner.className='tri2d';
  wrap.appendChild(inner);
  solid.appendChild(wrap);
}

// 生成所有面
squares.forEach(f => addSquareFace(f.axis, f.sign));
triNorms.forEach(v => addTriFace(v.nx, v.ny, v.nz));

// ===== 拖拽 & 动画（与你需求一致） =====
let isDragging=false, rolling=false;
let downX=0, downY=0, baseX=0, baseY=0;
let origin={x:0,y:0};
let lastMoves=[];
let unfolded=false;
let posNum = 1;
const ORDER = [1,2,3,4,5,6];
let faceByNum = {};

(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

function dragStartCommon(px, py){
  vp.classList.remove('flat'); unfolded=false;
  cube.classList.remove('unfold');
  dice.classList.remove('unfolding');
  clearHighlights();

  isDragging = true;
  const rect = dice.getBoundingClientRect();
  baseX = rect.left; baseY = rect.top;
  downX = px; downY = py;

  dice.style.willChange='left, top';
  cube.classList.add('grab');
}
function dragMoveCommon(px, py){
  if(!isDragging) return;
  const dx = px - downX;
  const dy = py - downY;
  dice.style.left = (baseX + dx) + 'px';
  dice.style.top  = (baseY + dy) + 'px';

  lastMoves.push({dx,dy,t:performance.now()});
  if(lastMoves.length>32) lastMoves.shift();

  // 拖拽时折叠体微旋
  const rx = -dy * 0.03;
  const ry =  dx * 0.04;
  const rz =  dx * 0.01;
  cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
}
async function dragEndCommon(){
  if(!isDragging) return;
  isDragging=false;
  cube.classList.remove('grab');
  dice.style.willChange='auto';
  await startRollSequence();
}

// Mouse
dice.addEventListener('mousedown', (e)=>{
  if(rolling) return;
  if(e.button!==0) return;
  e.preventDefault();
  dragStartCommon(e.clientX, e.clientY);
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp, { once:true });
});
function onDocMouseMove(e){ dragMoveCommon(e.clientX, e.clientY); }
async function onDocMouseUp(){
  document.removeEventListener('mousemove', onDocMouseMove);
  cube.style.transform='';
  await dragEndCommon();
}

// Touch
dice.addEventListener('touchstart', (e)=>{
  if(rolling) return;
  if(!e.touches || !e.touches[0]) return;
  const t = e.touches[0];
  e.preventDefault();
  dragStartCommon(t.clientX, t.clientY);
  document.addEventListener('touchmove', onDocTouchMove, { passive:false });
  document.addEventListener('touchend', onDocTouchEnd, { once:true });
});
function onDocTouchMove(e){
  if(!e.touches || !e.touches[0]) return;
  const t = e.touches[0];
  e.preventDefault();
  dragMoveCommon(t.clientX, t.clientY);
}
async function onDocTouchEnd(){
  document.removeEventListener('touchmove', onDocTouchMove);
  cube.style.transform='';
  await dragEndCommon();
}

// ===== 一回合 =====
async function startRollSequence() {
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;

  // 1) 摇
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);

  // 2) 显示数字 2.5s
  showBadge(n); await sleep(2500); hideBadge();

  // 3) 展开
  await enterUnfoldAndWait();

  // 4) 走到 n
  await highlightWalkTo(n);

  // 5) 停 2s 弹窗
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
  const steps=Math.min(24,Math.max(10,Math.round(e/12)+10));
  const final=1+Math.floor(Math.random()*6);
  return {steps,final};
}
function animateRoll(steps,final){
  return new Promise(resolve=>{
    rolling=true;
    let i=0;
    (function loop(){
      const t=i/steps;
      const iv=40+360*t*t;     // ease-out
      // 折叠体摇动
      const rx = Math.sin(i*.55)*10;
      const ry = Math.cos(i*.45)*14 + i*1.1;
      const rz = Math.sin(i*.35)*6;
      cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      i++;
      if(i<steps) setTimeout(loop,iv);
      else { cube.style.transform=''; rolling=false; resolve(final); }
    })();
  });
}

function showBadge(n){ badge.textContent = n; badge.hidden = false; }
function hideBadge(){ badge.hidden = true; }

// 展开 & 走步
async function enterUnfoldAndWait(){
  if(!unfolded){
    vp.classList.add('flat');
    dice.classList.add('unfolding');
    cube.classList.add('unfold');
  }
  await new Promise(r=>setTimeout(r,320));
  buildFaceMap(); setCurrent(posNum);
  unfolded=true;
}
function buildFaceMap(){
  faceByNum = {};
  document.querySelectorAll('.cell.sqC').forEach(el=>{
    const n = parseInt(el.dataset.num,10);
    if(n>=1 && n<=6) faceByNum[n]=el;
  });
}
const STEP_MS = 380;
async function highlightWalkTo(targetNum){
  if(!faceByNum[targetNum]) return;
  const curIdx = ORDER.indexOf(posNum);
  const tarIdx = ORDER.indexOf(targetNum);
  if(curIdx===-1 || tarIdx===-1){
    clearHighlights(); setCurrent(targetNum); posNum=targetNum; return;
  }
  let steps = (tarIdx - curIdx + ORDER.length) % ORDER.length;
  if(steps===0){
    pulse(faceByNum[targetNum]); setCurrent(targetNum); posNum=targetNum; await sleep(STEP_MS); return;
  }
  for(let k=0;k<steps;k++){
    const nextIdx=(ORDER.indexOf(posNum)+1)%ORDER.length;
    posNum=ORDER[nextIdx];
    pulse(faceByNum[posNum]); setCurrent(posNum);
    await sleep(STEP_MS);
  }
}
function pulse(el){ if(!el) return; el.classList.remove('active'); void el.offsetWidth; el.classList.add('active'); }
function setCurrent(n){ clearHighlights(); const el = faceByNum[n]; if(el) el.classList.add('current'); }
function clearHighlights(){ document.querySelectorAll('.cell.active, .cell.current').forEach(el=>el.classList.remove('active','current')); }

// 弹窗
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href=item.link; mLink.style.display='inline-block'; }
  else { mLink.style.display='none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });
