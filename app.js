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
let isDragging=false, rolling=false;
let downX=0, downY=0, baseX=0, baseY=0;  // 拖拽计算
let origin={x:0,y:0};                     // 当前位置（用于下一轮）
let lastMoves=[];                          // 用于估算“摇”的力度
let unfolded=false;
let posNum = 1;                            // 当前停留数字（默认从 1 开始）
const ORDER = [1,2,3,4,5,6];               // 行走环：严格 1→2→3→4→5→6
let faceByNum = {};                        // number -> element

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

// ========== 拖拽实现：纯 mouse/touch，最稳兼容 ==========
function dragStartCommon(px, py){
  // 收起上一轮
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

  // 纯视觉：拖拽时轻微倾斜
  cube.style.setProperty('--rx', (-dy * 0.15) + 'deg');
  cube.style.setProperty('--ry', ( dx * 0.18) + 'deg');
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
  if(e.button!==0) return; // 仅左键
  e.preventDefault();
  dragStartCommon(e.clientX, e.clientY);

  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp, { once:true });
});
function onDocMouseMove(e){ dragMoveCommon(e.clientX, e.clientY); }
async function onDocMouseUp(e){
  document.removeEventListener('mousemove', onDocMouseMove);
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
async function onDocTouchEnd(e){
  document.removeEventListener('touchmove', onDocTouchMove);
  await dragEndCommon();
}

// ========== 一次完整回合（松手后调用） ==========
async function startRollSequence() {
  // 记录新位置作为下一次拖拽的起点
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;

  // 1) 松手→摇
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);

  // 2) 数字停留 2.5s
  await sleep(2500);

  // 3) 展开并等待完成
  await enterUnfoldAndWait();

  // 4) 按 1→2→3→4→5→6 逐格高亮到 n
  await highlightWalkTo(n);

  // 5) 到达后弹出作品
  openProject(n);
}

// ========== 掷骰 ==========
function setFace(n){
  cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6');
  cube.classList.add('show-'+n);
}
function rollEnergy(){
  const r=lastMoves.slice(-6);
  if(!r.length) return 0;
  const d=r[r.length-1];
  return Math.hypot(d.dx,d.dy);
}
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

// ========== 展开并等待动画完成 ==========
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

// ========== 高亮行走（脉冲边框） ==========
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

// ========== 弹窗 ==========
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href=item.link; mLink.style.display='inline-block'; }
  else { mLink.style.display='none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 初始让骰子朝上 1
setFace(1);
