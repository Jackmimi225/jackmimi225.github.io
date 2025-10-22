// ===== 1) 事件绑定：改为监听 dice，而不是 cube =====
dice.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup',   onUp);

// 兼容老浏览器（Safari 等）
dice.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup',   onUp);

dice.addEventListener('touchstart', onDown, {passive:false});
window.addEventListener('touchmove', onMove, {passive:false});
window.addEventListener('touchend',  onUp);

// ===== 2) onDown：去掉 setPointerCapture，目标就是 dice =====
function onDown(e){
  if (rolling) return;
  if (e.button !== undefined && e.button !== 0) return; // 仅左键

  // 收起准备新一轮
  vp.classList.remove('flat'); 
  unfolded = false;
  cube.classList.remove('unfold');
  // 如果你用了红点版本：marker.classList.remove('show');
  dice.classList.remove('unfolding');

  dragging = true;

  const p = (e.touches && e.touches[0]) ? {x:e.touches[0].clientX, y:e.touches[0].clientY}
                                        : {x:e.clientX, y:e.clientY};
  start.x = p.x;
  start.y = p.y;
  lastMoves.length = 0;

  dice.style.willChange = 'left, top';
  cube.classList.add('grab');

  // ★ 不再调用 setPointerCapture，避免跨元素捕获导致的无响应
  // dice.setPointerCapture?.(e.pointerId); // ← 移除
  e.preventDefault?.();
}


