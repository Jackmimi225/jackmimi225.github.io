const projects = {
  1: { title: '作品 1', desc: '示例：Unity 交互文字实验。', link: '#' },
  2: { title: '作品 2', desc: '示例：p5.js 生成海报系列。', link: '#' },
  3: { title: '作品 3', desc: '示例：品牌与动态版式。', link: '#' },
  4: { title: '作品 4', desc: '示例：互动网页玩具。', link: '#' },
  5: { title: '作品 5', desc: '示例：装置概念草图。', link: '#' },
  6: { title: '作品 6', desc: '示例：信息图/视觉。', link: '#' },
};

const anchors = {
  1: { x: -140, y: -120 },
  2: { x:  110, y: -130 },
  3: { x:  170, y:   30 },
  4: { x:  -90, y:   60 },
  5: { x:   10, y:  130 },
  6: { x: -170, y:   10 },
};

const cube = document.getElementById('cube');
const marker = document.getElementById('marker');
const modal = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc = document.getElementById('mDesc');
const mLink = document.getElementById('mLink');

let dragging = false;
let lastMoves = [];
let rolling = false;

function computeEnergy(){
  const now = performance.now();
  const recent = lastMoves.filter(m => now - m.time < 200);
  if (recent.length < 1) return 0;
  let vx = 0, vy = 0, totalDt = 0;
  for (const m of recent){ vx += m.dx; vy += m.dy; totalDt += (m.dt || 16.7); }
  if (totalDt <= 0) return 0;
  vx /= (totalDt/16.67); vy /= (totalDt/16.67);
  return Math.hypot(vx, vy);
}

function getRollPlan(){
  const energy = computeEnergy();
  const steps = Math.min(24, Math.max(8, Math.round(energy / 6) + 8));
  const final = 1 + Math.floor(Math.random() * 6);
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
      const interval = 40 + 360 * t*t;
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
  await new Promise(res => setTimeout(res, 700));
  const a = anchors[n] || {x:0,y:0};
  marker.style.left = `calc(50% + ${a.x}px)`;
  marker.style.top = `calc(50% + ${a.y}px)`;
  marker.textContent = n;
  marker.classList.add('show');
  await new Promise(res => setTimeout(res, 750));
  openProject(n);
}

function openProject(n){
  const item = projects[n];
  if (!item) return;
  mTitle.textContent = item.title || ('作品 ' + n);
  mDesc.textContent = item.desc || '';
  if (item.link){ mLink.href = item.link; mLink.style.display = 'inline-block'; }
  else { mLink.style.display = 'none'; }
  modal.hidden = false;
}
modal.addEventListener('click', e => { if (e.target.dataset.close) modal.hidden = true; });

cube.addEventListener('pointerdown', (e) => {
  if (rolling) return;
  dragging = true;
  lastMoves.length = 0;
  cube.setPointerCapture(e.pointerId);
  cube.classList.add('grab');
  e.preventDefault();
});
cube.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const now = performance.now();
  lastMoves.push({ dx: e.movementX, dy: e.movementY, dt: e.timeStamp, time: now });
  if (lastMoves.length > 32) lastMoves.shift();
});
cube.addEventListener('pointerup', async (e) => {
  if (!dragging) return;
  dragging = false;
  cube.classList.remove('grab');
  cube.classList.remove('unfold');
  marker.classList.remove('show');
  const plan = getRollPlan();
  const n = await animateRoll(plan.steps, plan.final);
  await new Promise(res => setTimeout(res, 300));
  sequenceAfterLanding(n);
});

window.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !rolling && !dragging){
    const n = await animateRoll(12, 1 + Math.floor(Math.random()*6));
    await new Promise(res => setTimeout(res, 300));
    sequenceAfterLanding(n);
  }
});

setFace(1);
