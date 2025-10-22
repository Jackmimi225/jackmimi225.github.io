// ========= 作品与落点 =========
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};

// 相对 dice 容器中心（像素）。六个区域分别对应：上、前、右、左、下、背
const anchors = {
  1: { x: 0,      y: -1*SIZE }, // 顶面
  2: { x: 0,      y: 0 },       // 前面
  3: { x: +1*SIZE, y: 0 },      // 右
  4: { x: -1*SIZE, y: 0 },      // 左
  5: { x: 0,      y: +1*SIZE }, // 下
  6: { x: 0,      y: +2*SIZE }, // 背（展开在最下方）
};

// ========= 元素 =========
const dice  = document.getElementById('dice');
const cube  = document.getElementById('cube');
const marker= document.getElementById('marker');
const modal = document.getElementById('modal');
const mTitle= document.getElementById('mTitle');
const mDesc = document.getElementById('mDesc');
const mLink = document.getElementById('mLink');

// ========= 状态 =========
let dragging = false;       // 正在拖动“整个骰子”
let rolling  = false;       // 正在摇动
let lastMoves = [];         // 记录用来估算“力度”
let start = { x:0, y:0 };   // 指针按下时的坐标
let origin= { x:0, y:0 };   // dice 当前位置（px）

// 初始化：把当前 left/top 作为 origin
(function initPos(){
  const rect = dice.getBoundingClientRect();
  origin.x = rect.left; origin.y = rect.top;
  dice.style.left = origin.x + 'px';
  dice.style.top  = origin.y + 'px';
  dice.style.transform = 'translate(0,0)'; // 用 left/top 定位，便于后续运算
})();

// ========= 拖拽（左键/触摸） =========
function pt(e){ if(e.touches&&e.touches[0]) return {x:e.touches[0].clientX,y:e.touches[0].clientY}; return {x:e.clientX,y:e.clientY}; }

function onDown(e){
  if (rolling) return;
  if (e.button !== undefined && e.button !== 0) return; // 只接受左键
  dragging = true;
  const p = pt(e);
  start.x = p.x; start.y = p.y;
  lastMoves.length = 0;
  cube.classList.add('grab');
  dice.style.willChange = 'left, top';
  dice.setPointerCapture?.(e.pointerId);
  e.preventDefault?.();
}
function onMove(e){
  if (!dragging) return;
  const p = pt(e);
  const dx = p.x - start.x;
  const dy = p.y - start.y;
  dice.style.left = (origin.x + dx) + 'px';
  dice.style.top  = (origin.y + dy) + 'px';

  // 记录移动用于“力度”估算 + 轻微倾斜反馈
  lastMoves.push({dx, dy, time: performance.now()});
  if (lastMoves.length > 32) lastMoves.shift();
  cube.style.setProperty('--rx', (-dy * 0.15) + 'deg');
  cube.style.setProperty('--ry', ( dx * 0.18) + 'deg');
}
async function onUp(){
  if (!dragging) return;
  dragging = false;
  cube.classList.remove('grab');
  dice.style.willChange = 'auto';
  // 固定新的原点
  const rect = dice.getBoundingClientRect();
  origin.x = rect.left; origin.y = rect.top;

  // 松手即摇
  cube.classList.remove('unfold'); marker.classList.remove('show');
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);
  await new Promise(res => setTimeout(res, 300));
  sequenceAfterLanding(n);
}

// 绑定三套事件（Pointer/Mouse/Touch）
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// ========= 摇骰与后续 =========
function rollEnergy(){
  // 取最近位移的模长近似作为力度
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
  cube.classList.add('unfold');           // 摊开
  marker.classList.remove('show');
  await new Promise(r => setTimeout(r, 700));
  const a = anchors[n] || {x:0,y:0};      // 数字前进到对应区域
  marker.style.left = `calc(50% + ${a.x}px)`;
  marker.style.top  = `calc(50% + ${a.y}px)`;
  marker.textContent = n;
  marker.classList.add('show');
  await new Promise(r => setTimeout(r, 750));
  openProject(n);                          // 再显示作品
}

// ========= 作品弹窗 =========
function openProject(n){
  const item = projects[n] || { title: '作品 '+n, desc: '', link: '' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 初始点数
setFace(1);
