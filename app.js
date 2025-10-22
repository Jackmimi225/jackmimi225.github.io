// === 数据：把你的作品映射到 1..6 ===
const projects = [
  { n:1, title:'作品 1', desc:'示例：Unity 交互文字实验。', link:'#1', thumb:'' },
  { n:2, title:'作品 2', desc:'示例：p5.js 生成海报系列。', link:'#2', thumb:'' },
  { n:3, title:'作品 3', desc:'示例：品牌海报与动态版式。', link:'#3', thumb:'' },
  { n:4, title:'作品 4', desc:'示例：网页交互玩具。', link:'#4', thumb:'' },
  { n:5, title:'作品 5', desc:'示例：装置概念手稿。', link:'#5', thumb:'' },
  { n:6, title:'作品 6', desc:'示例：信息图 & 视觉。', link:'#6', thumb:'' },
];

// 地图锚点（相对于视口中心的偏移，单位像素）
const anchors = {
  1: { x: -120, y: -110 },
  2: { x:  100, y: -120 },
  3: { x:  160, y:   40 },
  4: { x:  -80, y:   60 },
  5: { x:    0, y:  120 },
  6: { x: -160, y:   10 },
};

const cube = document.getElementById('cube');
const rollBtn = document.getElementById('rollBtn');
const unfoldBtn = document.getElementById('unfoldBtn');
const resetBtn = document.getElementById('resetBtn');
const marker = document.getElementById('marker');
const statusEl = document.getElementById('status');

// 渲染右侧列表
const ul = document.getElementById('projList');
projects.forEach(p => {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${p.n}.</strong> ${p.title}`;
  li.addEventListener('click', () => openProject(p.n));
  ul.appendChild(li);
});

let current = 1;
function setCubeTo(n){
  cube.classList.remove('show-1','show-2','show-3','show-4','show-5','show-6');
  cube.classList.add('show-'+n);
  current = n;
  statusEl.textContent = '点数：' + n;
}

// 掷骰子：先抖动，再定格到目标点数
rollBtn.addEventListener('click', async () => {
  rollBtn.disabled = true;
  unfoldBtn.disabled = true;
  cube.classList.remove('unfold');
  marker.classList.remove('show');

  // 抖动动画（随机旋转类）
  const seq = ['show-1','show-2','show-3','show-4','show-5','show-6'];
  let t = 0, i = 0;
  await new Promise(res => {
    const sh = setInterval(() => {
      cube.classList.remove(...seq);
      cube.classList.add(seq[i % 6]);
      i++;
      t += 1;
      if (t > 12) { clearInterval(sh); res(); }
    }, 80);
  });

  // 最终点数
  const n = 1 + Math.floor(Math.random() * 6);
  setCubeTo(n);
  setTimeout(()=>{
    unfoldBtn.disabled = false;
  }, 900);
});

// 展开：把六面摊开，并把标记移动到地图坐标
unfoldBtn.addEventListener('click', () => {
  cube.classList.add('unfold');

  // 展开后延迟移动标记
  setTimeout(() => {
    const a = anchors[current];
    if (!a) return;
    marker.style.left = `calc(50% + ${a.x}px)`;
    marker.style.top = `calc(50% + ${a.y}px)`;
    marker.classList.add('show');

    // 弹出作品卡片
    openProject(current);
  }, 700);
});

resetBtn.addEventListener('click', () => {
  cube.classList.remove('unfold');
  marker.classList.remove('show');
  setCubeTo(1);
  unfoldBtn.disabled = true;
  rollBtn.disabled = false;
});

// 打开对应作品
const modal = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc = document.getElementById('mDesc');
const mLink = document.getElementById('mLink');
const mMedia = document.getElementById('mMedia');

function openProject(n){
  const item = projects.find(p => p.n === n) || projects[0];
  mTitle.textContent = item.title;
  mDesc.textContent = item.desc;
  if (item.link) {
    mLink.href = item.link;
    mLink.style.display = 'inline-flex';
  } else {
    mLink.style.display = 'none';
  }
  mMedia.style.background = item.thumb ? `center/cover no-repeat url('${item.thumb}')` : 'linear-gradient(135deg,#fbcfe8,#bfdbfe)';
  modal.hidden = false;
}

modal.addEventListener('click', (e) => { if (e.target.dataset.close) modal.hidden = true; });

// 初始
setCubeTo(1);
