// ═══════════════════════════════════════════════════════
//  INTRO.JS — 수평 분리: 상단 SUHO(흰색위) / 하단 SONG(검정위)
//  스크롤 입력 시 unlock → main 타임라인으로 전환
// ═══════════════════════════════════════════════════════
(function () {
  let layer, suhoEl, songEl, hintEl;
  let locked = true, doneFired = false;
  let rafPending = false;
  const eIn3 = t => t * t * t;

  // 화면 크기 기반 폰트 크기 계산 (한 곳에서만 정의)
  function calcFontSize() {
    return Math.max(80, Math.min(innerWidth * 0.28, innerHeight * 0.30));
  }

  function makeLabel(text, top, color) {
    const fs = calcFontSize();
    const el = document.createElement('span');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;top:${top};left:50%;transform:translate(-50%,-50%);` +
      `font-family:"Bebas Neue","Noto Sans KR",sans-serif;font-size:${fs}px;` +
      `font-weight:700;letter-spacing:-0.02em;line-height:1;white-space:nowrap;` +
      `user-select:none;will-change:transform,opacity;color:${color};`;
    return el;
  }

  // resize 시 폰트 크기만 다시 적용 (transform/opacity는 introLayerUpdate가 매 프레임 처리)
  function resizeLabels() {
    if (!suhoEl || !songEl) return;
    const fs = calcFontSize() + 'px';
    suhoEl.style.fontSize = fs;
    songEl.style.fontSize = fs;
  }

  function build() {
    layer = document.createElement('div');
    layer.id = 'intro-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:9;pointer-events:none;overflow:hidden;';
    document.body.appendChild(layer);

    hintEl = document.createElement('div');
    hintEl.id = 'intro-hint';
    hintEl.textContent = 'SCROLL';
    layer.appendChild(hintEl);

    suhoEl = makeLabel('SUHO', '25%', '#141210');  // 흰 배경 위 검은 글자
    songEl = makeLabel('SONG', '75%', '#f0ede8');  // 검은 배경 위 흰 글자
    layer.appendChild(suhoEl);
    layer.appendChild(songEl);
  }

  window.introLayerUpdate = function (hP) {
    if (!layer || !suhoEl || !songEl) return;

    if (hP >= 0.95) {
      layer.style.display = 'none';
      if (!doneFired) { doneFired = true; dispatchEvent(new Event('intro-done')); }
      return;
    }
    layer.style.display = '';

    if (hintEl) hintEl.style.opacity = hP < 0.05 ? '1' : String(Math.max(0, 1 - (hP - 0.05) / 0.08));

    let ty, op;
    if (hP <= 0.38) { ty = 0; op = 1; }
    else {
      const t = Math.min((hP - 0.38) / 0.37, 1);
      ty = eIn3(t) * innerHeight * 0.55;
      op = Math.max(0, 1 - t / 0.9);
    }

    // SUHO 위로(-), SONG 아래로(+)
    suhoEl.style.transform = `translate(-50%, calc(-50% + ${-ty}px))`;
    suhoEl.style.opacity   = String(op);
    songEl.style.transform = `translate(-50%, calc(-50% + ${ty}px))`;
    songEl.style.opacity   = String(op);
  };

  function unlock() {
    if (!locked) return;
    locked = false;
    document.body.classList.remove('intro-active');
    removeEventListener('wheel',     onWheel);
    removeEventListener('touchmove', onTouch);
  }
  function onWheel(e) { e.preventDefault(); unlock(); }
  function onTouch(e) { e.preventDefault(); unlock(); }

  function init() {
    document.body.classList.add('intro-active');
    build();
    addEventListener('wheel',     onWheel, { passive: false });
    addEventListener('touchmove', onTouch, { passive: false });

    // 화면 크기 변경 시 폰트 크기 갱신 (rAF 스로틀 — 프레임당 1회로 부드럽게 즉시 반응)
    addEventListener('resize', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; resizeLabels(); });
    });

    addEventListener('keydown', e => {
      if (['ArrowDown','ArrowUp','PageDown','PageUp',' '].includes(e.key)) {
        e.preventDefault(); unlock();
      }
    });
    setTimeout(() => {
      const il = document.getElementById('intro-layer');
      if (il) { il.style.pointerEvents = 'auto'; il.addEventListener('click', unlock); }
    }, 80);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
