// ===== 基本尺寸（与 CSS 的 --size 保持一致） =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

/* 六个展开块（顺时针数字 1→2→3→4→6→5）：
   展平布局：
           [1 TOP]
   [4 LEFT][2 FRONT][3 RIGHT]
           [6 BOTTOM]
           [5 BACK]  (最下)
   用选择器锁定每一块，展开后实时量测其中心。
*/
const TILES = [
  { num: 1, sel: '.face--top'    }, // 顶
  { num: 2, sel: '.face--front'  }, // 前
  { num: 3, sel: '.face--right'  }, // 右
  { num: 4, sel: '.face--left'   }, // 左
  { num: 6, sel: '.face--bottom' }, // 下
  { num: 5, sel: '.face--back'   }, // 最下
];

// 数字 -> 作品（按需改）
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// ===== 选择器 =====
const vp     = document.getElementById('vp');
const dice   = document.getElementById('dice');
const cube   = document.getElementById('cube');
const marker = document.getElementById('marker');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// ===== 状态 =====
let dragging = false;
let rolling  = false;
let start = { x:0, y:0 };
let origin= { x:0, y:0 };
let lastMoves = [];
let unfolded = false;
let posIndex = 0;         // 当前停留的“数字格”（TILES 下标），默认 1 号格
let centers = {};         // 展开后量测得到：num -> {x,y}（相对 dice 中心的偏移）

// 初始：把当前位置转为 left/top 绝对定位
(function initPos(){
  const rect = dice.getBoundingClientRect();
  origin.x = rect.left; origin.y = rect.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

// ===== 拖拽（左键/触摸） =====
const point = e => (e.touches && e.touches[0])
  ? {x:e.touches[0].clientX, y:e.touches[0].clientY}
  : {x:e.clientX, y:e.clientY};

function onDown(e){
  if (rolling) return;
  if (e.button !== undefined && e.button !== 0) return; // 仅左键
  // 收起准备新一轮
  vp.classList.remove('flat'); unfolded = false;
  cube.classList.remove('unfold');
  marker.classList.remove('show');
  dice.classList.remove('unfolding');

  dragging = true;
  const p = point(e);
  start.x = p.x; start.y = p.y;
  lastMoves.length = 0;

  dice.style.willChange = 'left, top';
  cube.classList.add('grab');
  dice.setPointerCapture?.(e.pointerId);
  e.preventDefault?.();
}
function onMove(e){
  if (!dragging) return;
  const p = point(e);
  const dx = p.x - start.x;
  const dy = p.y - start.y;
  dice.style.left = (origin.x + dx) + 'px';
  dice.style.top  = (origin.y + dy) + 'px';

  lastMoves.push({dx, dy, t: performance.now()});
  if (lastMoves.length > 32) lastMoves.shift();
  cube.style.setProperty('--rx', (-dy * 0.15) + 'deg');
  cube.style.setProperty('--ry', ( dx * 0.18) + 'deg');
}
async function onUp(){
  if (!dragging) return;
  dragging = false;
  cube.classList.remove('grab');
  dice.style.willChange = 'auto';

  // 固定新原点
  const rect = dice.getBoundingClientRect();
  origin.x = rect.left; origin.y = rect.top;

  // 1) 松手 → 摇骰（结束时定格到 n）
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);

  // 2) 定格后停留 2.5 秒展示数字
  await sleep(2500);

  // 3) 展开为正面平面网，并量测每块面的中心
  await enterUnfold();      // 内部 nextFrame + computeCenters

  // 4) 从“当前数字格”逐格走到“n 号格”
  await moveToNumber(n);

  // 5) 到达后显示作品
  openProject(n);
}

// 事件绑定（Pointer / Mouse / Touch）
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// ===== 掷骰 & 展开 & 走格 =====
function rollEnergy(){
  const r = lastMoves.slice(-6);
  if (!r.length) return 0;
  const d = r[r.length-1];
  return Math.hypot(d.dx, d.dy);
}
function getRollPlan(){
  const e = rollEnergy();
  const steps = Math.min(24, Math.max(10, Math.round(e/12)+10)); // 10~24 步
  const final = 1 + Math.floor(Math.random()*6);
  return { steps, final };
}
function setFace(n){
  cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6');
  cube.classList.add('show-'+n);
}
function animateRoll(steps, final){
  return new Promise(resolve => {
    rolling = true;
    const order = [1,2,3,4,5,6];
    let i = 0;
    (function loop(){
      const t = i / steps;
      const interval = 40 + 360 * t*t; // ease-out
      setFace(order[i % order.length]); i++;
      if (i < steps) setTimeout(loop, interval);
      else { setFace(final); rolling = false; resolve(final); }
    })();
  });
}

async function enterUnfold(){
  if (unfolded) return;
  vp.classList.add('flat');           // 平面视角（无透视）
  dice.classList.add('unfolding');    // 底图更亮
  cube.classList.add('unfold');       // 纸盒网摊开

  // 等两帧，确保布局/transform 稳定，再量测中心
  await nextFrame(); await nextFrame();
  computeCenters();

  // 初次展开：把红点放到当前数字格中心
  placeMarkerByNumber(TILES[posIndex].num);
  marker.classList.add('show');
  unfolded = true;
}

function computeCenters(){
  const rDice = dice.getBoundingClientRect();
  const cx = rDice.left + rDice.width/2;
  const cy = rDice.top  + rDice.height/2;
  centers = {};
  for (const t of TILES){
    const el = cube.querySelector(t.sel);
    const r = el.getBoundingClientRect();
    centers[t.num] = { x: r.left + r.width/2 - cx, y: r.top + r.height/2 - cy };
  }
}

// —— 从当前 posIndex 逐格走到“n 号格”（顺时针，遇 6 回到 1）——
const STEP_MS = 360; // 每步节奏（与 CSS .34s 过渡协调）
async function moveToNumber(n){
  const targetIdx = TILES.findIndex(t => t.num === n);
  if (targetIdx === -1) return;

  let steps = (targetIdx - posIndex + TILES.length) % TILES.length; // 顺时针距离
  for (let k = 0; k < steps; k++){
    posIndex = (posIndex + 1) % TILES.length;
    placeMarkerByNumber(TILES[posIndex].num); // 精准落到块中心
    await sleep(STEP_MS);
  }
}

function placeMarkerByNumber(num){
  const p = centers[num] || staticCenter(num); // 兜底：静态几何
  marker.style.setProperty('--dx', `${p.x}px`);
  marker.style.setProperty('--dy', `${p.y}px`);
}

// 备用静态几何（万一浏览器拿不到 rect）
function staticCenter(num){
  switch(num){
    case 1: return {x:0, y:-1*SIZE};
    case 2: return {x:0, y:0};
    case 3: return {x:+1*SIZE, y:0};
    case 4: return {x:-1*SIZE, y:0};
    case 6: return {x:0, y:+1*SIZE};
    case 5: return {x:0, y:+2*SIZE};
    default: return {x:0, y:0};
  }
}

// ===== 弹窗（作品） =====
function openProject(num){
  const item = projects[num] || { title:'作品 '+num, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// ===== 小工具 =====
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function nextFrame(){ return new Promise(r => requestAnimationFrame(() => r())); }

// 初始朝上
setFace(1);

