// ===== 基本配置 =====
const SIZE = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--size')) || 200;

// 展开图上的“棋盘路径”（像大富翁那样绕一圈）——共 10 格：沿 3×4 边框一圈走
const cell = (i,j) => ({ x: (-SIZE + SIZE/2) + i*SIZE, y: (-SIZE + SIZE/2) + j*SIZE });
// 顺时针：上边 3 格 → 右边 3 格 → 下边 2 格 → 左边 2 格 = 10 格
const route = [
  cell(0,0), cell(1,0), cell(2,0),
  cell(2,1), cell(2,2), cell(2,3),
  cell(1,3), cell(0,3),
  cell(0,2), cell(0,1),
];
// 每个格子落地后的作品编号（可自定义）；默认循环 1..6
const routeProjects = [1,2,3,4,5,6,1,2,3,4];

// 你的作品数据
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
let posIndex = 0;           // 棋盘当前位置索引（0..route.length-1）
let unfolded = false;       // 是否处于展开视角

// 初始化：把当前位置转为 left/top 绝对定位
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
  // 收起（下次重新展开）
  vp.classList.remove('flat'); unfolded = false;
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

  // ===== 顺序 1：松手 → 摇骰 =====
  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);     // 结束时骰子已定格到数字 n

  // ===== 顺序 2：定格后给观众看清数字（短暂停顿）=====
  await sleep(600);

  // ===== 顺序 3：再展开为平面网（正面朝向）=====
  enterUnfold();

  // ===== 顺序 4：在“棋盘路径”上逐格前进 n 步 =====
  await moveSteps(n);

  // ===== 顺序 5：到达后再显示作品 =====
  const projId = routeProjects[posIndex];
  openProject(projId);
}

// 三套事件：Pointer / Mouse / Touch（跨浏览器稳）
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// ===== 掷骰与展开序列工具 =====
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
function enterUnfold(){
  if (unfolded) return;
  vp.classList.add('flat');           // 平面视角（无透视）
  dice.classList.add('unfolding');    // 底图更亮
  cube.classList.add('unfold');       // 纸盒网摊开
  // 初次展开：把 marker 放到当前格
  placeMarker(posIndex);
  marker.classList.add('show');
  unfolded = true;
}

// 逐格前进 n 步（像大富翁）
async function moveSteps(n){
  for (let k = 0; k < n; k++){
    posIndex = (posIndex + 1) % route.length;
    placeMarker(posIndex);            // CSS 里 left/top 有 0.25s 过渡
    await sleep(280);                 // 与过渡时间匹配，形成“咔哒咔哒”走格
  }
}
function placeMarker(idx){
  const p = route[idx];
  marker.style.left = `calc(50% + ${p.x}px)`;
  marker.style.top  = `calc(50% + ${p.y}px)`;
}

// ===== 弹窗（作品） =====
function openProject(projId){
  const item = projects[projId] || { title:'作品', desc:'', link:'' };
  mTitle.textContent = item.title;
  mDesc.textContent  = item.desc;
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// 小工具
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// 初始朝上
setFace(1);


