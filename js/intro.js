// ═══════════════════════════════════════════════════════
//  INTRO.JS — 잠긴 게이트(locked gate) + 재진입(re-entry)
//  · document 스크롤은 잠가두고, 입력을 "누적"해 heroP(0→1)만 굴림.
//    → 인트로 동안 카드는 안 움직임(내려갔다 튕김 제거)
//  · 핸드오프 후, 카드 0번(맨 위)에서 위로 스크롤하면 인트로로 재진입
//    → 누적값을 역으로 굴려 인트로가 부드럽게 되돌아옴(역재생)
// ═══════════════════════════════════════════════════════
(function () {
  let layer, suhoEl, songEl, hintEl;
  let doneFired = false;      // true = 갤러리(카드) 상태
  let engaged = false;        // 인트로 안쪽(heroP<0.9)까지 들어온 적 있음 → 완료 허용
  let abortFrames = 0;        // prog가 끝(=1)에 머문 프레임 수 → 재진입 취소 감지
  let accum = 0;              // 누적 입력량(px)
  let touchY = null;
  let rafPending = false;
  const eIn3 = t => t * t * t;

  // 재진입 트리거 누적 + 임계값
  let reAccum = 0, rwTouchY = null;
  const REENTER_THRESH = 60;

  // 인트로 완료에 필요한 누적 스크롤 거리. 작을수록 빨리 끝남.
  function introDist() { return Math.max(700, innerHeight * 1.3); }

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

  // 입력 누적 → heroPTgt 갱신 (master loop의 lerp가 부드럽게 따라옴)
  function addInput(dy) {
    accum = Math.max(0, Math.min(accum + dy, introDist()));
    const prog = accum / introDist();
    if (window.App && App.S) App.S.heroPTgt = prog;
  }

  function onWheel(e) { e.preventDefault(); addInput(e.deltaY); }
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchMove(e) {
    e.preventDefault();
    if (touchY === null) { touchY = e.touches[0].clientY; return; }
    const y = e.touches[0].clientY;
    addInput((touchY - y) * 1.4);   // 손가락 위로 밀면 진행(+)
    touchY = y;
  }
  function onKey(e) {
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); addInput(introDist() * 0.16); }
    else if (['ArrowUp', 'PageUp'].includes(e.key))     { e.preventDefault(); addInput(-introDist() * 0.16); }
  }
  function onClick() { addInput(introDist()); }  // 클릭 = 인트로 완료(부드럽게)

  function addInputListeners() {
    addEventListener('wheel',      onWheel,      { passive: false });
    addEventListener('touchstart', onTouchStart, { passive: true  });
    addEventListener('touchmove',  onTouchMove,  { passive: false });
    addEventListener('keydown',    onKey);
  }
  function removeInputListeners() {
    removeEventListener('wheel', onWheel);
    removeEventListener('touchstart', onTouchStart);
    removeEventListener('touchmove', onTouchMove);
    removeEventListener('keydown', onKey);
  }

  /* ── 재진입 감시: 카드 0번(맨 위)에서 위로 스크롤 시 인트로 복귀 ── */
  function rwWheel(e) {
    if (!doneFired) return;
    if (scrollY > 2) { reAccum = 0; return; }
    if (e.deltaY < 0) { reAccum += -e.deltaY; if (reAccum >= REENTER_THRESH) reenter(); }
    else reAccum = 0;
  }
  function rwTouchStart(e) { rwTouchY = e.touches[0].clientY; reAccum = 0; }
  function rwTouchMove(e) {
    if (!doneFired) return;
    if (scrollY > 2) { rwTouchY = e.touches[0].clientY; return; }
    const y = e.touches[0].clientY;
    if (rwTouchY !== null) {
      const dy = y - rwTouchY;                 // 손가락 아래로 = 위로 스크롤 의도
      if (dy > 0) { reAccum += dy; if (reAccum >= REENTER_THRESH) reenter(); }
    }
    rwTouchY = y;
  }
  function startReentryWatch() {
    reAccum = 0; rwTouchY = null;
    addEventListener('wheel',      rwWheel,      { passive: true });
    addEventListener('touchstart', rwTouchStart, { passive: true });
    addEventListener('touchmove',  rwTouchMove,  { passive: true });
  }
  function stopReentryWatch() {
    removeEventListener('wheel', rwWheel);
    removeEventListener('touchstart', rwTouchStart);
    removeEventListener('touchmove', rwTouchMove);
  }

  function reenter() {
    stopReentryWatch();
    doneFired = false;
    engaged = false;
    abortFrames = 0;
    accum = introDist();                 // heroP=1 지점에서 시작 → 위로 스크롤하면 하강
    touchY = null;
    try { window.scrollTo(0, 0); } catch (e) {}
    document.body.classList.add('intro-active');
    addInputListeners();
  }

  // 핸드오프(완료) — 잠금 해제 + 입력 리스너 제거 + 재진입 감시 시작
  function teardown() {
    document.body.classList.remove('intro-active');
    removeInputListeners();
    startReentryWatch();
  }

  window.introLayerUpdate = function (hP) {
    if (!layer || !suhoEl || !songEl) return;

    if (doneFired) { if (layer.style.display !== 'none') layer.style.display = 'none'; return; }

    if (hP < 0.9) engaged = true;             // 인트로 안쪽까지 시각적으로 들어옴
    const prog = accum / introDist();
    if (prog >= 0.999) abortFrames++; else abortFrames = 0;

    // 완료(=카드로): 인트로 들어갔다 다시 내려왔거나(engaged), 재진입만 하고
    // 그냥 끝까지 밀어 취소(abort)한 경우. hP>=0.95라 글자는 이미 사라진 뒤라 깔끔.
    if (hP >= 0.95 && (engaged || abortFrames > 10)) {
      layer.style.display = 'none';
      doneFired = true; engaged = false;
      teardown();
      dispatchEvent(new Event('intro-done'));
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

  function init() {
    document.body.classList.add('intro-active');
    build();
    addInputListeners();

    addEventListener('resize', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; resizeLabels(); });
    });

    setTimeout(() => {
      const il = document.getElementById('intro-layer');
      if (il) { il.style.pointerEvents = 'auto'; il.addEventListener('click', onClick); }
    }, 80);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
