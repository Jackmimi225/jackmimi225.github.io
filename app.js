// ===== 基本数据 =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// 展开图上的 6 个区域（相对 dice 容器中心的像素偏移）
const anchors = {
  1: { x: 0,       y: -1*SIZE }, // 顶
  2: { x: 0,       y: 0 },       // 前
  3: { x: +1*SIZE, y: 0 },       // 右
  4: { x: -1*SIZE, y: 0 },       // 左
  5: { x: 0,       y: +1*SIZE }, // 下
  6: { x: 0,       y: +2*SIZE }, // 背（在最下方）
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

// 初始化：把当前位置转为 left/top 绝对定位，便于拖拽计算
(function initPos(){
  const rect = dice.getBoundingClientRect();
  origin.x = rect.left; origin.y = rect.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)';
})();

// ===== 拖拽交互（左键/触摸） =====
const point = e => (e.touches && e.touches[0])
  ? {x:e.touches[0].clientX, y:e.touches[0].clientY}
  : {x:e.clientX, y:e.clientY};

function onDown(e){
  if (rolling) return;
  if (e.button !== undefined && e.button !== 0) return; // 仅左键
  // 收起展开图、恢复 3D 透视
  vp.classList.remove('flat');
  cube.classList.remove('unfold');
  marker.classList.remove('show');
  dice.classList.remove('unfolding');

  dragging = true;
  const p = point(e);
  start.x = p.x; start.y = p.y;
  lastMoves.length = 0;

  cube.classList.add('grab');
  dice.style.willChange = 'left, top';
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

  // 用于估算“力度” + 微倾反馈
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

  // 松手即摇
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);
  await new Promise(res => setTimeout(res, 300));
  sequenceAfterLanding(n);
}

// 绑定 Pointer + Mouse + Touch 三套事件（跨浏览器稳）
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// ===== 掷骰与展开序列 =====
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

async function sequenceAfterLanding(n){
  // 切为平面视角 + 进入展开状态（确保展开图正面朝向）
  vp.classList.add('flat');
  dice.classList.add('unfolding');   // 让底图更亮
  cube.classList.add('unfold');

  marker.classList.remove('show');
  await new Promise(r => setTimeout(r, 700)); // 等展开动画

  // 数字前进到展开图上对应区域
  const a = anchors[n] || {x:0, y:0};
  marker.style.left = `calc(50% + ${a.x}px)`;
  marker.style.top  = `calc(50% + ${a.y}px)`;
  marker.textContent = n;
  marker.classList.add('show');

  await new Promise(r => setTimeout(r, 750));
  openProject(n);
}

// ===== 作品弹窗 =====
function openProject(n){
  const item = projects[n] || { title:'作品 '+n, desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 初始朝上
setFace(1);

