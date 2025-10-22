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

// 作品（按需替换）
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// ===== 状态 =====
let dragging=false, rolling=false;
let start={x:0,y:0}, origin={x:0,y:0}, lastMoves=[];
let unfolded=false;
let posNum = 1;                     // 当前停留数字（默认从 1 开始）
const ORDER = [1,2,3,4,5,6];        // 行走环：严格 1→2→3→4→5→6
let faceByNum = {};                 // number -> element
let activePointerId = null;         // 当前拖拽的指针 id（防多指混入）

// 初始绝对定位（把 CSS 居中改为具体像素，便于拖拽更新）
(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

// 工具
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

// ===== 在“骰子本身”上监听指针事件（参考早先可用版本） =====
dice.addEventListener('pointerdown', (e)=>{
  if (rolling || activePointerId!==null) return;
  if (e.pointerType==='mouse' && e.button!==0) return;
  e.preventDefault();

  activePointerId = e.pointerId;
  try { dice.setPointerCapture && dice.setPointerCapture(activePointerId); } catch(_) {}

  // 收起上一轮
  vp.classList.remove('flat'); unfolded=false;
  cube.classList.remove('unfold');
  dice.classList.remove('unfolding');
  clearHighlights();

  dragging = true;
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  start.x = e.clientX; start.y = e.clientY;
  lastMoves.length = 0;

  dice.style.willChange='left, top';
  cube.classList.add('grab');
});

window.addEventListener('pointermove', (e)=>{
  if(!dragging || e.pointerId!==activePointerId) return;
  e.preventDefault();

  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;

  dice.style.left = (origin.x + dx) + 'px';
  dice.style.top  = (origin.y + dy) + 'px';

  lastMoves.push({dx,dy,t:performance.now()});
  if(lastMoves.length>32) lastMoves.shift();

  // 可选：拖拽时略微倾斜（纯视觉）
  cube.style.setProperty('--rx', (-dy * 0.15) + 'deg');
  cube.style.setProperty('--ry', ( dx * 0.18) + 'deg');
});

window.addEventListener('pointerup', async (e)=>{
  if(e.pointerId!==activePointerId) return;
  e.preventDefault();
  try { dice.releasePointerCapture && dice.releasePointerCapture(activePointerId); } catch(_) {}
  activePointerId = null;

  if(!dragging) return;
  dragging=false; cube.classList.remove('grab'); dice.style.willChange='auto';

  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;

  // 1) 松手→摇
  const {steps, final} = getRollPlan();
  const n = await animateRoll(steps, final);

  // 2) 数字停留 2.5s
  await sleep(2500);

  // 3) 展开并等待展开动画结束
  await enterUnfoldAndWait();

  // 4) 从 posNum 按 ORDER 逐格“脉冲高亮”走到 n
  await highlightWalkTo(n);

  // 5) 到达后弹作品
  openProject(n);
});

// ====== 掷骰相关 ======
function setFace(n){
  cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6');
  cube.classList.add('show-'+n);
}
function rollEnergy(){ const r=lastMoves.slice(-6); if(!r.length) return 0; const d=r[r.length-1]; return Math.hypot(d.dx,d.dy); }
function getRollPlan(){
  const e=rollEnergy();
  const steps=Math.min(24,Math.max(10,Math.round(e/12)+10)); // 10~24步，力度越大步数越多
  const final=1+Math.floor(Math.random()*6);
  return {steps,final};
}
function animateRoll(steps,final){
  return new Promise(resolve=>{
    rolling=true;
    const seq=[1,2,3,4,5,6]; let i=0;
    (function loop(){
      const t=i/steps;
      const iv=40+360*t*t;     // ease-out
      setFace(seq[i%seq.length]); i++;
      if(i<steps) setTimeout(loop,iv);
      else { setFace(final); rolling=false; resolve(final); }
    })();
  });
}

// ====== 展开并等待动画完成 ======
async function enterUnfoldAndWait(){
  if(!unfolded){
    vp.classList.add('flat');
    dice.classList.add('unfolding');
    cube.classList.add('unfold');
  }
  await waitForUnfoldTransition();
  buildFaceMap();              // 数字→DOM
  setCurrent(posNum);          // 初次展开时标记当前格
  unfolded=true;
}
function waitForUnfoldTransition(){
  return new Promise(resolve=>{
    let done=false;
    const timer=setTimeout(()=>{ if(!done){ done=true; cube.removeEventListener('transitionend',onEnd); resolve(); } },1300);
    function onEnd(e){
      if(!(e.target.classList && e.target.classList.contains('face'))) return;
      if(e.propertyName!=='transform' && e.propertyName!=='-webkit-transform') return;
      if(!done){ done=true; clearTimeout(timer); cube.removeEventListener('transitionend',onEnd); resolve(); }
    }
    cube.addEventListener('transitionend', onEnd);
  });
}
function buildFaceMap(){
  faceByNum = {};
  document.querySelectorAll('.face').forEach(el=>{
    const n = parseInt((el.textContent||'').trim(),10);
    if(n>=1 && n<=6) faceByNum[n]=el;
  });
}

// ====== 高亮行走（脉冲边框） ======
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
    pulse(faceByNum[targetNum]);      // 原地踏步也给一个脉冲
    setCurrent(targetNum);
    posNum=targetNum;
    await sleep(STEP_MS);
    return;
  }

  for(let k=0;k<steps;k++){
    const nextIdx=(ORDER.indexOf(posNum)+1)%ORDER.length;
    posNum=ORDER[nextIdx];
    pulse(faceByNum[posNum]);
    setCurrent(posNum);
    await sleep(STEP_MS);
  }
}
function pulse(el){
  if(!el) return;
  el.classList.remove('active'); void el.offsetWidth; // 重新触发
  el.classList.add('active');
}
function setCurrent(n){
  clearHighlights();
  const el = faceByNum[n];
  if(el) el.classList.add('current');
}
function clearHighlights(){
  document.querySelectorAll('.face.active, .face.current')
    .forEach(el=>el.classList.remove('active','current'));
}

// ====== 弹窗 ======
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 初始让骰子朝上 1
setFace(1);

// ====== 旧浏览器兜底（无 PointerEvent 时） ======
if (!('PointerEvent' in window)) {
  dice.addEventListener('mousedown', (e)=>{
    if (e.button!==0) return; e.preventDefault();
    dragging=true;
    const r=dice.getBoundingClientRect();
    origin.x=r.left; origin.y=r.top;
    start.x=e.clientX; start.y=e.clientY;
    lastMoves.length=0;
    dice.style.willChange='left, top'; cube.classList.add('grab');
  });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return;
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    dice.style.left=(origin.x+dx)+'px';
    dice.style.top =(origin.y+dy)+'px';
  });
  window.addEventListener('mouseup', async (e)=>{
    if(!dragging) return;
    dragging=false; cube.classList.remove('grab'); dice.style.willChange='auto';
    const r=dice.getBoundingClientRect(); origin.x=r.left; origin.y=r.top;
    const {steps,final}=getRollPlan(); const n=await animateRoll(steps,final);
    await sleep(2500); await enterUnfoldAndWait(); await highlightWalkTo(n); openProject(n);
  });
}
