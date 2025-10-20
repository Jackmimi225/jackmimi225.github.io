// === 数据区：在这里替换为你的真实作品 ===
// 你可以随意增减项目，把图片放到 assets/ 目录，然后把 thumb 换成你的图片路径。
const projects = [
  { title: '起点 / Start', desc: '从这里开始你的骰子旅行。', type: 'start' },
  { title: '关于我 · About', desc: '一段简短的自我介绍与联系方式。', type: 'about', link: '#about' },
  { title: '作品 A', desc: '示例描述：Unity 交互文字实验。', link: 'https://example.com/a', thumb: 'assets/p1.jpg' },
  { title: '作品 B', desc: '示例描述：p5.js 生成海报系列。', link: 'https://example.com/b', thumb: 'assets/p2.jpg' },
  { title: '作品 C', desc: '示例描述：品牌海报与动态版式。', link: 'https://example.com/c', thumb: 'assets/p3.jpg' },
  { title: '作品 D', desc: '示例描述：摄影 + 字体拼贴。', link: 'https://example.com/d', thumb: 'assets/p4.jpg' },
  { title: '休息一下', desc: '跳过一次：什么也不会发生（灵感需要呼吸）。' },
  { title: '作品 E', desc: '示例描述：动态图形短片。', link: 'https://example.com/e', thumb: 'assets/p5.jpg' },
  { title: '作品 F', desc: '示例描述：网页交互小玩具。', link: 'https://example.com/f', thumb: 'assets/p6.jpg' },
  { title: '彩蛋', desc: '祝你好运：再掷一次骰子！', type: 'reroll' },
  { title: '作品 G', desc: '示例描述：装置概念手稿。', link: 'https://example.com/g', thumb: 'assets/p7.jpg' },
  { title: '作品 H', desc: '示例描述：信息图设计。', link: 'https://example.com/h', thumb: 'assets/p8.jpg' },
  { title: '作品 I', desc: '示例描述：字体变形研究。', link: 'https://example.com/i', thumb: 'assets/p9.jpg' },
  { title: '随机事件', desc: '回到起点或前进 3 步（取决于心情）。', type: 'random' },
  { title: '作品 J', desc: '示例描述：品牌 VI 小集。', link: 'https://example.com/j', thumb: 'assets/p10.jpg' },
  { title: '终点 / End', desc: '旅途的终点（但创作继续）。', type: 'end' },
];

// 如果项目少于 16 个，我们自动填满到 16 个格子。
while (projects.length < 16) projects.splice(projects.length - 1, 0, { title: '空格子', desc: '等待新作品…' });

const N = 16; // 外圈格子数（5x5 外环 = 16）
let pos = 0; // 当前位置 index
let centers = []; // 每个格子的中心点（用于棋子动画）

const board = document.getElementById('board');
const token = document.getElementById('token');
const rollBtn = document.getElementById('rollBtn');
const diceEl = document.getElementById('dice');
const posText = document.getElementById('posText');

const modal = document.getElementById('modal');
const mTitle = document.getElementById('mTitle');
const mDesc = document.getElementById('mDesc');
const mLink = document.getElementById('mLink');
const mMedia = document.getElementById('mMedia');

// 生成外圈轨道：top row(1..5), right col(2..5), bottom row(4..1), left col(4..2)
const ring = [];
for (let c = 1; c <= 5; c++) ring.push([1, c]);
for (let r = 2; r <= 5; r++) ring.push([r, 5]);
for (let c = 4; c >= 1; c--) ring.push([5, c]);
for (let r = 4; r >= 2; r--) ring.push([r, 1]);

// 渲染格子
ring.forEach(([r, c], i) => {
  const tile = document.createElement('div');
  tile.className = 'tile';
  if (i === 0) tile.classList.add('tile--start');
  if (projects[i]?.type === 'about') tile.classList.add('tile--about');
  tile.dataset.r = r;
  tile.dataset.c = c;
  tile.dataset.idx = i;
  tile.innerHTML = `<span>${projects[i]?.title || ('格子 ' + (i+1))}</span><small>${i+1}</small>`;
  tile.style.gridRow = r;
  tile.style.gridColumn = c;
  board.appendChild(tile);
});

function computeCenters() {
  const boardRect = board.getBoundingClientRect();
  centers = ring.map(([r, c]) => {
    const el = [...board.children].find(d => d.classList.contains('tile') && +d.dataset.r === r && +d.dataset.c === c);
    const rect = el.getBoundingClientRect();
    return { x: rect.left - boardRect.left + rect.width / 2, y: rect.top - boardRect.top + rect.height / 2 };
  });
  // 把棋子移动到当前位置（用于首次计算或窗口尺寸变化）
  moveTokenTo(pos, false);
}
window.addEventListener('resize', () => computeCenters());
computeCenters();

// 设置初始状态
highlight(pos);
posText.textContent = projects[pos].title;

// 掷骰子
rollBtn.addEventListener('click', async () => {
  rollBtn.disabled = true;
  const steps = await rollDiceAnimation(); // 得到 1..6
  await stepMove(steps);
  onLanded();
  rollBtn.disabled = false;
});

function rollDiceAnimation() {
  return new Promise(resolve => {
    let t = 0;
    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      // 模拟摇动
      const n = Math.floor(1 + Math.random() * 6);
      diceEl.textContent = n;
      if (p < 1) {
        t = requestAnimationFrame(tick);
      } else {
        const final = Math.floor(1 + Math.random() * 6);
        diceEl.textContent = final;
        resolve(final);
      }
    };
    t = requestAnimationFrame(tick);
  });
}

function stepMove(steps) {
  return new Promise(resolve => {
    let remain = steps;
    const run = () => {
      if (remain <= 0) return resolve();
      pos = (pos + 1) % N;
      highlight(pos);
      moveTokenTo(pos, true);
      setTimeout(() => {
        remain--;
        run();
      }, 360);
    };
    run();
  });
}

function moveTokenTo(i, animate) {
  const p = centers[i];
  if (!p) return;
  const tr = `translate(${p.x}px, ${p.y}px)`;
  if (!animate) token.style.transition = 'none';
  token.style.transform = `translate(-50%, -50%) ${' '} translate(${p.x}px, ${p.y}px)`; // keep -50% centering then apply offset
  if (!animate) {
    // force reflow to apply instantly, then restore transition
    token.getBoundingClientRect();
    token.style.transition = 'transform .35s ease';
  }
}

function highlight(i) {
  [...board.querySelectorAll('.tile')].forEach(el => el.classList.remove('tile--active'));
  const el = [...board.querySelectorAll('.tile')].find(e => +e.dataset.idx === i);
  if (el) el.classList.add('tile--active');
  posText.textContent = projects[i].title;
}

function onLanded() {
  const item = projects[pos];
  if (!item) return;
  // 特殊类型
  if (item.type === 'reroll') {
    // 再掷一次
    rollBtn.click();
    return;
  }
  if (item.type === 'random') {
    if (Math.random() > 0.5) { pos = 0; computeCenters(); moveTokenTo(pos, true); highlight(pos); }
    else {
      const add = 3; pos = (pos + add) % N; computeCenters(); moveTokenTo(pos, true); highlight(pos);
    }
  }
  // 打开弹窗
  openModal(item);
}

function openModal(item) {
  mTitle.textContent = item.title || '未命名作品';
  mDesc.textContent = item.desc || '';
  if (item.link) {
    mLink.href = item.link;
    mLink.style.display = 'inline-flex';
  } else {
    mLink.style.display = 'none';
  }
  // 媒体区域（如果设置了 thumb 就用图片，否则用渐变）
  if (item.thumb) {
    mMedia.style.background = 'center/cover no-repeat url("' + item.thumb + '")';
    mMedia.setAttribute('aria-hidden', 'false');
  } else {
    mMedia.style.background = 'linear-gradient(135deg, #fbcfe8, #bfdbfe)';
    mMedia.setAttribute('aria-hidden', 'true');
  }
  modal.hidden = false;
}

modal.addEventListener('click', (e) => {
  if (e.target.dataset.close) modal.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modal.hidden = true;
});
