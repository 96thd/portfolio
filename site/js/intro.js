// ═══════════════════════════════════════════════════════
//  INTRO.JS — 잠긴 게이트(locked gate)
//  · document 스크롤은 잠가두고, 입력을 "누적"해 heroP(0→1)만 굴림.
//    → 인트로 동안 카드는 안 움직임(내려갔다 튕김 제거)
//  · 카드 화면으로 넘어온 뒤에는 스크롤로 인트로에 다시 못 들어감.
//    돌아가려면 좌측 "SUHO SONG" 텍스트 클릭/터치 → introAPI.toStart()
// ═══════════════════════════════════════════════════════
(function () {
  let layer, suhoEl, songEl, hintEl;
  let doneFired = false;      // true = 갤러리(카드) 상태
  let engaged = false;        // 인트로 안쪽(heroP<0.9)까지 들어온 적 있음 → 완료 허용
  let abortFrames = 0;        // prog가 끝(=1)에 머문 프레임 수 → (구)취소 감지
  let accum = 0;              // 누적 입력량(px)
  let touchY = null;
  let rafPending = false;
  const eIn3 = t => t * t * t;

  // 인트로 완료에 필요한 누적 스크롤 거리. 작을수록 빨리 끝남.
  // 데스크톱 ≈ 화면 1.1개, 터치 ≈ 0.65개. (예전 1.3×vh 에서 소폭 축소)
  const isCoarse = (() => { try { return matchMedia('(pointer:coarse)').matches; } catch (e) { return false; } })();
  function introDist() {
    return isCoarse ? Math.max(360, innerHeight * 0.65)
                    : Math.max(600, innerHeight * 1.1);
  }

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

  // Firefox 등은 deltaMode가 line(1)/page(2) 단위 → px로 정규화
  function normDY(e) {
    return e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  }

  function onWheel(e) { e.preventDefault(); addInput(normDY(e)); }
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchMove(e) {
    e.preventDefault();
    if (touchY === null) { touchY = e.touches[0].clientY; return; }
    const y = e.touches[0].clientY;
    addInput((touchY - y) * 1.8);   // 손가락 위로 밀면 진행(+)
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

  // 인트로 첫 화면으로 (좌측 "SUHO SONG" 클릭 / 히스토리 popstate 에서 호출)
  function enterIntro() {
    doneFired = false;
    engaged = false;
    abortFrames = 0;
    accum = 0;
    touchY = null;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (window.App && App.S) {
      App.S.heroPTgt = 0;
      App.S.cardTgt = 0; App.S.cardFrac = 0;   // 카드도 첫 장으로 되돌림 (인트로 뒤에서)
      App.S.heroReturnFast = true;             // heroP 1→0 을 빠르게 (core.js)
      App.S.needsDraw = true;
    }
    document.body.classList.add('intro-active');
    addInputListeners();
  }

  // 핸드오프(완료) — 잠금 해제 + 입력 리스너 제거
  function teardown() {
    document.body.classList.remove('intro-active');
    removeInputListeners();
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
      dispatchEvent(new Event('intro-done'));
      // 스크롤 잠금은 250ms 더 유지 → 인트로를 세게 끝냈을 때 남은 관성이
      // 문서로 새어 두 번째 카드로 밀려버리는 것을 막는다. 그동안 onWheel이
      // preventDefault + (accum 포화라)no-op 로 관성을 삼킨다.
      setTimeout(teardown, 250);
      return;
    }
    layer.style.display = '';

    if (hintEl) hintEl.style.opacity = hP < 0.05 ? '1' : String(Math.max(0, 1 - (hP - 0.05) / 0.08));

    const RM = window.App && App.C && App.C.reduceMotion;
    let ty, op;
    if (hP <= 0.38) { ty = 0; op = 1; }
    else {
      const t = Math.min((hP - 0.38) / 0.37, 1);
      ty = RM ? 0 : eIn3(t) * innerHeight * 0.55;   // RM: 날아가지 않고 제자리 페이드
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

  // 외부(events.js) 제어용 최소 API
  window.introAPI = {
    complete: () => addInput(introDist()),   // 인트로 → 갤러리 (부드럽게 완료)
    toStart: enterIntro,                      // 갤러리/카드 → 인트로 첫 화면
    isActive: () => !doneFired,
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
