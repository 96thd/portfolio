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
  const REENTER_THRESH = 120;   // 쉰 뒤 위로 미는 제스처가 이만큼 쌓여야 인트로 재진입

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

  /* ── 재진입 감시: 첫 카드(최상단)에서 "멈췄다가 다시 위로" 일 때만 인트로 복귀 ──
     핵심: 첫 카드가 detent(걸림턱)처럼 동작해야 한다.
     · 다른 카드에서 첫 카드로 쭉 스크롤 → 관성/연속 입력으로는 절대 재진입 안 함.
     · 최상단에서 스크롤이 잦아든 뒤(restedAtTop), 새로 위로 미는 제스처(500ms 창)에서만
       누적을 세고, 임계값을 넘으면 재진입.                                     */
  let suppressUntil = 0;               // 이 시각 전까지는 재진입 자체를 잠금
  const QUIET_MS = 150;                // 이만큼 입력이 없으면 "최상단에서 쉬는 중"
  const GESTURE_MS = 500;              // 재진입 제스처 유효 시간
  let restedAtTop = false;             // 최상단에서 스크롤이 잦아든 적 있음
  let quietTO = 0;
  let gestureActive = false, gestureT0 = 0;

  // 스크롤/휠/터치 어느 것이든 "입력 중"으로 기록 → 잦아든 뒤에만 restedAtTop=true.
  // 관성 휠 이벤트는 최상단 도달 후에도 계속 오지만 간격이 촘촘해 타이머가 안 익음.
  function noteInput() {
    restedAtTop = false;
    clearTimeout(quietTO);
    quietTO = setTimeout(() => {
      restedAtTop = (doneFired && scrollY <= 2 && performance.now() >= suppressUntil);
    }, QUIET_MS);
  }
  addEventListener('scroll', noteInput, { passive: true });

  function reentryInput(dy) {          // dy>0 = 위로(재진입 방향)
    if (!doneFired) return;
    const now = performance.now();
    const wasRested = restedAtTop;     // 이번 입력을 기록하기 전 상태
    noteInput();
    if (now < suppressUntil || scrollY > 2) { gestureActive = false; reAccum = 0; return; }
    if (!gestureActive) {
      if (!wasRested) return;          // 관성/연속 스크롤 중이었음 → 첫 카드에서 그냥 멈춤
      gestureActive = true; gestureT0 = now; reAccum = 0;
    }
    if (now - gestureT0 > GESTURE_MS) { gestureActive = false; reAccum = 0; return; }
    if (dy > 0) { reAccum += dy; if (reAccum >= REENTER_THRESH) reenter(); }
    else { gestureActive = false; reAccum = 0; }    // 아래로 방향 전환 → 제스처 취소
  }
  function rwWheel(e) { reentryInput(-normDY(e)); }  // 휠 위로 = deltaY<0
  function rwTouchStart(e) { rwTouchY = e.touches[0].clientY; reAccum = 0; gestureActive = false; }
  function rwTouchMove(e) {
    if (!doneFired) return;
    const y = e.touches[0].clientY;
    if (rwTouchY !== null) reentryInput(y - rwTouchY);   // 손가락 아래로 = 위로 스크롤 의도
    rwTouchY = y;
  }
  function startReentryWatch() {
    reAccum = 0; rwTouchY = null; gestureActive = false; restedAtTop = false;
    noteInput();
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
    dispatchEvent(new Event('intro-reenter'));
    doneFired = false;
    engaged = false;
    abortFrames = 0;
    // 1.0이 아닌 0.75 지점에서 시작: UI가 페이드아웃되고 카드가 살짝 어두워져
    // "재진입이 걸렸다"는 피드백이 즉시 보임. (1.0 시작이면 스와이프 2~3번까지
    // 화면 변화가 전혀 없어 재진입이 죽은 것처럼 느껴짐)
    accum = introDist() * 0.75;
    touchY = null;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (window.App && App.S) App.S.heroPTgt = accum / introDist();
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

  // 히스토리 내비게이션에서 인트로 상태를 제어하기 위한 최소 API
  window.introAPI = {
    reenter: reenter,                        // 스크롤 재진입 (75% 지점에서 시작)
    complete: () => addInput(introDist()),   // 인트로 → 갤러리 (부드럽게 완료)
    // 뒤로가기로 돌아올 때는 인트로를 처음(0%)부터 보여줘야 한다.
    // reenter()의 75% 시작점은 "계속 위로 스크롤 중"을 전제한 값이라
    // 그대로 쓰면 글자가 이미 사라진 상태로 보인다.
    toStart: () => {
      reenter();
      accum = 0;
      if (window.App && App.S) App.S.heroPTgt = 0;
    },
    // 히스토리 이동 직후 관성으로 인한 오작동 재진입을 잠시 막는다
    suppressReentry: (ms) => {
      suppressUntil = performance.now() + (ms || 900);
      reAccum = 0; rwTouchY = null; gestureActive = false; restedAtTop = false;
    },
    isActive: () => !doneFired,
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
