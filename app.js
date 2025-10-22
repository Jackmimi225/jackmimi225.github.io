// ===== 基本尺寸（与 CSS 的 --size 保持一致） =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

// DOM
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const cube   = document.getElementById('cube');
const marker = document.getElementById('marker');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// 作品（按需修改）
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// ===== 状态 =====
let dragging = false, rolling = false;
let start = {x:0,y:0}, origin = {x:0,y:0}, lastMoves = [];
let unfolded = false;
let centers = {};                 // number -> {x,y}（相对 dice 中心的偏移）
let posNum = 1;                   // ✅ 当前所在数字格（默认从 1 开始）
const ORDER = [1,2,3,4,5,6];      // ✅ 行走环：严格按数字顺序

// 初始把 dice 固定为绝对定位
(function initPos(){
  const r = dice.getBoundingClientRect();
  origin.x = r.left; origin.y = r.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

// 工具
const point = e => (e.touches && e.touches[0]) ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : {x:e.clientX,y:e.clientY};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(()=>r()));

// 拖拽
function onDown(e){
  if (rolling) return;
  if (e.button !== undefined && e.button !== 0) return; // 仅左键
  vp.classList.remove('flat'); unfolded = false;
  cube.classList.remove('unfold');
  marker.classList.remove('show');
  dice.classList.remove('unfolding');

  dragging = true;
  const p = point(e); start.x = p.x; start.y = p.y; lastMoves.length = 0;
  dice.style.willChange = 'left, top'; cube.classList.add('grab');
  dice.setPointerCapture?.(e.pointerId); e.preventDefault?.();
}
function onMove(e){
  if (!dragging) return;
  const p = point(e); const dx = p.x - start.x; const dy = p.y - start.y;
  dice.style.left = (origin.x + dx) + 'px';
  dice.style.top  = (origin.y + dy) + 'px';
  lastMoves.push({dx,dy,t:performance.now()}); if (lastMoves.length>32) lastMoves.shift();
  cube.style.setProperty('--rx', (-dy*0.15)+'deg');
  cube.style.setProperty('--ry', ( dx*0.18)+'deg');
}
async function onUp(){
  if (!dragging) return;
  dragging = false; cube.classList.remove('grab'); dice.style.willChange = 'auto';
  const r = dice.getBoundingClientRect(); origin.x = r.left; origin.y = r.top;

  // 1) 松手 → 摇
  const {steps, final} = getRollPlan(); const n = await animateRoll(steps, final);

  // 2) 数字停留 2.5s
  await sleep(2500);

  // 3) 展开并量测中心
  await enterUnfold();

  // 4) 从当前 posNum 按 ORDER 逐格走到 n
  await moveToNumber(n);

  // 5) 到达后弹作品（一定是 n）
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

// 掷骰
function rollEnergy(){ const r=lastMoves.slice(-6); if(!r.length) return 0; const d=r[r.length-1]; return Math.hypot(d.dx,d.dy); }
function getRollPlan(){ const e=rollEnergy(); const steps=Math.min(24,Math.max(10,Math.round(e/12)+10)); const final=1+Math.floor(Math.random()*6); return {steps,final}; }
function setFace(n){ cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6'); cube.classList.add('show-'+n); }
function animateRoll(steps, final){
  return new Promise(resolve=>{
    rolling=true; const seq=[1,2,3,4,5,6]; let i=0;
    (function loop(){ const t=i/steps; const iv=40+360*t*t; setFace(seq[i%seq.length]); i++;
      if(i<steps) setTimeout(loop,iv); else { setFace(final); rolling=false; resolve(final); }
    })();
  });
}

// 展开 + 量测
async function enterUnfold(){
  if (unfolded) return;
  vp.classList.add('flat'); dice.classList.add('unfolding'); cube.classList.add('unfold');
  await nextFrame(); await nextFrame();          // 等 transform 稳定
  computeCenters();                              // 用“面上数字”真实建立映射
  placeMarkerByNumber(posNum);                   // ✅ 初次展开放在当前数字（默认 1）
  marker.classList.add('show');
  unfolded = true;
}

// 量测每块中心：读取面上文本数字 → number -> {x,y}
function computeCenters(){
  const rDice = dice.getBoundingClientRect();
  const cx = rDice.left + rDice.width/2;
  const cy = rDice.top  + rDice.height/2;
  centers = {};
  document.querySelectorAll('.face').forEach(el=>{
    const txt = (el.textContent||'').trim();
    const num = parseInt(txt,10);
    if (!num || num<1 || num>6) return;
    const r = el.getBoundingClientRect();
    centers[num] = { x: r.left + r.width/2 - cx, y: r.top + r.height/2 - cy };
  });
}

// —— 逐格走到目标数字 ——（严格按 ORDER）
const STEP_TIMEOUT = 800; // 兜底超时
async function moveToNumber(targetNum){
  if (!(targetNum in centers)) return;

  const curIdx = ORDER.indexOf(posNum);
  const tarIdx = ORDER.indexOf(targetNum);
  if (curIdx === -1 || tarIdx === -1){ posNum = targetNum; placeMarkerByNumber(posNum); return; }

  let steps = (tarIdx - curIdx + ORDER.length) % ORDER.length;
  for (let k=0; k<steps; k++){
    const nextIdx = (ORDER.indexOf(posNum) + 1) % ORDER.length;
    posNum = ORDER[nextIdx];                 // ✅ 更新当前所在数字
    await moveMarkerTo(posNum);              // 等这一“步”动画结束
  }
}

// 把红点移动到某数字中心，并等待 transform 过渡结束
function moveMarkerTo(num){
  return new Promise(resolve=>{
    const onEnd = (e)=>{
      const pn = e?.propertyName || '';
      if (pn==='transform' || pn==='-webkit-transform' || pn==='') {
        marker.removeEventListener('transitionend', onEnd);
        resolve();
      }
    };
    marker.addEventListener('transitionend', onEnd, { once:false });
    placeMarkerByNumber(num); // 触发过渡
    setTimeout(()=>{ marker.removeEventListener('transitionend', onEnd); resolve(); }, STEP_TIMEOUT);
  });
}

// 实际设置偏移（用 CSS 变量，避免累计误差）
function placeMarkerByNumber(num){
  const p = centers[num] || staticCenter(num);
  marker.style.setProperty('--dx', `${p.x}px`);
  marker.style.setProperty('--dy', `${p.y}px`);
}

// 兜底：静态几何（极少数情况下量测失败时）
function staticCenter(num){
  switch(num){
    case 1: return {x:0, y:-1*SIZE};
    case 2: return {x:0, y:0};
    case 3: return {x:+1*SIZE, y:0};
    case 4: return {x:-1*SIZE, y:0};
    case 5: return {x:0, y:+2*SIZE};   // 最下
    case 6: return {x:0, y:+1*SIZE};   // 中下
    default: return {x:0, y:0};
  }
}

// 弹窗
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title; mDesc.textContent = item.desc;
  if (item.link){ mLink.href=item.link; mLink.style.display='inline-block'; }
  else { mLink.style.display='none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 初始让骰子朝上 1
setFace(1);
