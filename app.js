// ===== 作品与锚点（按需改） =====
const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。',  link: '#' },
};
// 相对视口中心的偏移（像素）
const anchors = {
  1: { x: -140, y: -120 },
  2: { x:  110, y: -130 },
  3: { x:  170, y:   30 },
  4: { x:  -90, y:   60 },
  5: { x:   10, y:  130 },
  6: { x: -170, y:   10 },
};

// ===== 选择器 =====
const cube   = document.getElementById('cube');
const marker = document.getElementById('marker');
const modal  = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc  = document.getElementById('mDesc');
const mLink  = document.getElementById('mLink');

// ===== 状态 =====
let dragging = false;
let rolling  = false;
let lastMoves = [];
let lastX = 0, lastY = 0, lastT = 0;

// ===== 工具：取指针坐标（兼容鼠标/触屏） =====
function getPoint(e){
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// 记录最近移动（Safari 里没有 movementX/Y，就用 clientX/Y 差分）
function pushMove(e){
  const now = performance.now();
  const p = getPoint(e);
  let dx = (typeof e.movementX === 'number') ? e.movementX : (lastT ? p.x - lastX : 0);
  let dy = (typeof e.movementY === 'number') ? e.movementY : (lastT ? p.y - lastY : 0);
  const dt = lastT ? (now - lastT) : 16.7;

  lastMoves.push({ dx, dy, dt, time: now });
  if (lastMoves.length > 32) lastMoves.shift();

  lastX = p.x; lastY = p.y; lastT = now;

  // 拖拽时的即时报错（视觉反馈）
  cube.style.setProperty('--rx', (-dy * 0.30) + 'deg');
  cube.style.setProperty('--ry', ( dx * 0.35) + 'deg');
}

// 计算“力度”
function computeEnergy(){
  const now = performance.now();
  const recent = lastMoves.filter(m => now - m.time < 200);
  if (!recent.length) return 0;
  let vx = 0, vy = 0, totalDt = 0;
  for (const m of recent){ vx += m.dx; vy += m.dy; totalDt += (m.dt || 16.7); }
  vx /= (totalDt/16.67); vy /= (totalDt/16.67);
  return Math.hypot(vx, vy);
}

// 掷骰计划（步数随力度变化）
function getRollPlan(){
  const energy = computeEnergy();
  const steps = Math.min(24, Math.max(8, Math.round(energy / 6) + 8)); // 8~24步
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
      setFace(order[i % order.length]);
      i++;
      if (i < steps) setTimeout(loop, interval);
      else { setFace(final); rolling = false; resolve(final); }
    })();
  });
}

async function sequenceAfterLanding(n){
  cube.classList.add('unfold');
  marker.classList.remove('show');
  await new Promise(res => setTimeout(res, 700)); // 等展开

  const a = anchors[n] || {x:0,y:0};
  marker.style.left = `calc(50% + ${a.x}px)`;
  marker.style.top  = `calc(50% + ${a.y}px)`;
  marker.textContent = n;
  marker.classList.add('show');

  await new Promise(res => setTimeout(res, 750)); // 等移动完成
  openProject(n);
}

function openProject(n){
  const item = projects[n];
  if (!item) return;
  mTitle.textContent = item.title || ('作品 ' + n);
  mDesc.textContent  = item.desc  || '';
  if (item.link) { mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

// ===== 事件（Pointer + Mouse + Touch 三套并存，谁来用谁） =====
function onDown(e){
  if (rolling) return;
  dragging = true;
  lastMoves.length = 0;
  const p = getPoint(e);
  lastX = p.x; lastY = p.y; lastT = performance.now();
  cube.classList.add('grab');
  cube.releasePointerCapture?.(e.pointerId); // 兼容性保护
  e.preventDefault?.();
}
function onMove(e){
  if (!dragging) return;
  pushMove(e);
}
async function onUp(e){
  if (!dragging) return;
  dragging = false;
  cube.classList.remove('grab');
  cube.classList.remove('unfold');
  marker.classList.remove('show');

  const { steps, final } = getRollPlan();
  const n = await animateRoll(steps, final);
  await new Promise(res => setTimeout(res, 300)); // 定格瞬间
  sequenceAfterLanding(n);
}

// Pointer（新浏览器）
cube.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);

// Mouse（桌面兜底）
cube.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);

// Touch（移动端兜底）
cube.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// 初始朝上
setFace(1);
