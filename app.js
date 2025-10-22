// ===== 基本尺寸（与 CSS 的 --size 保持一致） =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

// DOM
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const cube   = document.getElementById('cube');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// 作品
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// 状态
let dragging=false, rolling=false;
let start={x:0,y:0}, origin={x:0,y:0}, lastMoves=[];
let unfolded=false;
let posNum = 1;                 // 当前所在数字（默认从 1 开始）
const ORDER = [1,2,3,4,5,6];    // 严格数字顺序
let faceByNum = {};             // number -> element

// 初始绝对定位
(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x=r.left; origin.y=r.top;
  dice.style.left = origin.x+'px';
  dice.style.top  = origin.y+'px';
  dice.style.transform='translate(0,0)';
})();

// 工具
const point     = e => (e.touches && e.touches[0]) ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : {x:e.clientX,y:e.clientY};
const sleep     = ms => new Promise(r=>setTimeout(r,ms));
const nextFrame = () => new Promise(r=>requestAnimationFrame(()=>r()));

// 拖拽
function onDown(e){
  if (rolling) return;
  if (e.button!==undefined && e.button!==0) return;
  // 收起状态
  vp.classList.remove('flat'); unfolded=false;
  cube.classList.remove('unfold');
  clearHighlights();

  dragging=true;
  const p=point(e); start.x=p.x; start.y=p.y; lastMoves.length=0;
  dice.style.willChange='left, top'; cube.classList.add('grab');
  dice.setPointerCapture?.(e.pointerId); e.preventDefault?.();
}
function onMove(e){
  if(!dragging) return;
  const p=point(e); const dx=p.x-start.x; const dy=p.y-start.y;
  dice.style.left=(origin.x+dx)+'px';
  dice.style.top =(origin.y+dy)+'px';
  lastMoves.push({dx,dy,t:performance.now()}); if(lastMoves.length>32) lastMoves.shift();
  cube.style.setProperty('--rx', (-dy*0.15)+'deg');
  cube.style.setProperty('--ry', ( dx*0.18)+'deg');
}
async function onUp(){
  if(!dragging) return;
  dragging=false; cube.classList.remove('grab'); dice.style.willChange='auto';
  const r=dice.getBoundingClientRect(); origin.x=r.left; origin.y=r.top;

  // 1) 松手→摇
  const {steps,final} = getRollPlan();
  const n = await animateRoll(steps, final);

  // 2) 数字停留 2.5s
  await sleep(2500);

  // 3) 展开并等待展开动画结束
  await enterUnfoldAndWait();

  // 4) 从 posNum 顺着 ORDER 逐格“高亮行走”到 n
  await highlightWalkTo(n);

  // 5) 到达后弹出对应作品
  openProject(n);
}

// 事件
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// 掷骰逻辑
function rollEnergy(){ const r=lastMoves.slice(-6); if(!r.length) return 0; const d=r[r.length-1]; return Math.hypot(d.dx,d.dy); }
function getRollPlan(){ const e=rollEnergy(); const steps=Math.min(24,Math.max(10,Math.round(e/12)+10)); const final=1+Math.floor(Math.random()*6); return {steps,final}; }
function setFace(n){ cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6'); cube.classList.add('show-'+n); }
function animateRoll(steps, final){
  return new Promise(resolve=>{
    rolling=true; const seq=[1,2,3,4,5,6]; let i=0;
    (function loop(){
      const t=i/steps; const iv=40+360*t*t;
      setFace(seq[i%seq.length]); i++;
      if(i<steps) setTimeout(loop,iv);
      else { setFace(final); rolling=false; resolve(final); }
    })();
  });
}

// 展开并等待动画结束，再建立“数字→面”的映射
async function enterUnfoldAndWait(){
  if(!unfolded){
    vp.classList.add('flat');
    dice.classList.add('unfolding');
    cube.classList.add('unfold');
  }
  await waitForUnfoldTransition();
  buildFaceMap();
  // 初次展开：把当前所在格设为 current
  setCurrent(posNum);
  unfolded=true;
}
function waitForUnfoldTransition(){
  return new Promise(resolve=>{
    let done=false;
    const timer=setTimeout(()=>{ if(!done){ done=true; cube.removeEventListener('transitionend', onEnd); resolve(); } },1300);
    function onEnd(e){
      if(!(e.target.classList && e.target.classList.contains('face'))) return;
      if(e.propertyName!=='transform' && e.propertyName!=='-webkit-transform') return;
      if(!done){ done=true; clearTimeout(timer); cube.removeEventListener('transitionend', onEnd); resolve(); }
    }
    cube.addEventListener('transitionend', onEnd);
  });
}

// 数字→DOM 映射（读面上的文字，不依赖坐标）
function buildFaceMap(){
  faceByNum = {};
  document.querySelectorAll('.face').forEach(el=>{
    const n = parseInt((el.textContent||'').trim(),10);
    if(n>=1 && n<=6) faceByNum[n]=el;
  });
}

// 高亮行走
const STEP_MS = 380; // 每步时长
async function highlightWalkTo(targetNum){
  if(!faceByNum[targetNum]) return;

  // 计算步数（严格按 1→2→3→4→5→6）
  const curIdx = ORDER.indexOf(posNum);
  const tarIdx = ORDER.indexOf(targetNum);
  if(curIdx===-1 || tarIdx===-1){
    // 异常时直接定位
    clearHighlights(); setCurrent(targetNum); posNum=targetNum; return;
  }

  let steps = (tarIdx - curIdx + ORDER.length) % ORDER.length;

  // 如果就是同一格，给个脉冲即可
  if(steps===0){
    pulse(faceByNum[targetNum]);
    setCurrent(targetNum);
    posNum = targetNum;
    await sleep(STEP_MS);
    return;
  }

  // 逐格走：每一步脉冲高亮 + 更新 current
  for(let k=0;k<steps;k++){
    const nextIdx = (ORDER.indexOf(posNum)+1) % ORDER.length;
    posNum = ORDER[nextIdx];
    pulse(faceByNum[posNum]);
    setCurrent(posNum);
    await sleep(STEP_MS);
  }
}

// 视觉辅助
function pulse(el){
  if(!el) return;
  el.classList.remove('active'); // 重新触发动画
  // 强制重排以重启动画
  void el.offsetWidth;
  el.classList.add('active');
}
function setCurrent(n){
  clearHighlights();
  const el = faceByNum[n];
  if(el) el.classList.add('current');
}
function clearHighlights(){
  document.querySelectorAll('.face.active, .face.current').forEach(el=>{
    el.classList.remove('active','current');
  });
}

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

// 初始骰子朝上 1
setFace(1);

