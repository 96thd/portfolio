'use strict';
/* ══════════════════════════════════════════════════════════════════
   CORE — 상수, 상태, 이징, DOM refs, 마스터 루프
   다른 파일에서 App.* 로 참조
══════════════════════════════════════════════════════════════════ */
window.App = (function () {
  const N = works.length;

  /* ─── constants ─── */
  const C = {
    N,
    PX_PER_CARD : 160,
    CARD_DEAD_PX: 480,
    HERO_H      : () => innerHeight * 1.5,
    R_CARD      : 1800,
    STEP        : 5.5,
    CARD_AX_R   : 0.47,
    CDEG        : 48,
    DARK_BG     : '#121212',
    LIGHT_BG    : '#f5f4f0',
  };
  const isLight = (() => { try { return matchMedia('(prefers-color-scheme:light)').matches; } catch (e) { return false; } })();
  // 접근성: 움직임 최소화 요청 시 그레인·글리치·경계 흔들림·글자 비행을 끈다.
  const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { return false; } })();

  C.isLight = isLight;
  C.reduceMotion = reduceMotion;
  function applyThemeColors(light) {
    C.isLight = light;
    C.COL_BG = light ? C.DARK_BG  : C.LIGHT_BG;   // 사라지는 패널
    C.DOM_BG = light ? C.LIGHT_BG : C.DARK_BG;    // 남는 패널
  }
  applyThemeColors(isLight);
  // 테마 실시간 반영: 로드 후 OS 라이트/다크가 바뀌면 C 색상을 갱신하고,
  // JS로 칠한 부분(카드 더미/테두리/글로우/dim, 캔버스 분할)을 콜백으로 다시 맞춘다.
  // CSS 토큰은 미디어쿼리로 알아서 바뀌므로 여기선 JS 쪽만 챙긴다.
  C._themeCbs = [];

  /* ─── state (mutable, 다른 모듈에서 직접 수정) ─── */
  const S = {
    heroP: 0, heroPTgt: 0, cardFrac: 0, cardTgt: 0, lastSY: 0,
    snapTO: null, rsTO: null, introBgActive: false,
    AX: 0, AY: 0, W: 0, H: 0,
  };

  /* ─── utils ─── */
  const U = {
    eOut3 : t => 1 - (1 - Math.min(t, 1)) ** 3,
    eOut4 : t => 1 - (1 - Math.min(t, 1)) ** 4,
    clamp : (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    $     : id => document.getElementById(id),
  };

  /* ─── DOM refs ─── */
  const D = {
    bgCV  : U.$('bg-canvas'),
    cWrap : U.$('cards-wrap'),
  };
  // 필수 DOM 검증 — 누락 시 앱이 조용히 죽지 않고 명확히 알림
  if (!D.bgCV || !D.cWrap) {
    console.error('[App] 필수 DOM 누락:', { bgCV: !!D.bgCV, cWrap: !!D.cWrap });
    return { C: {}, S: {}, U, D: {}, rsz: () => {} };
  }
  D.bgCtx = D.bgCV.getContext('2d');

  function rsz() { S.W = D.bgCV.width = innerWidth; S.H = D.bgCV.height = innerHeight; S.needsDraw = true; }
  rsz();

  /* ─── 테마 변경 감시 ─── */
  try {
    const mqd = matchMedia('(prefers-color-scheme:dark)');
    const onTheme = () => {
      const light = !mqd.matches;
      if (light === C.isLight) return;
      applyThemeColors(light);
      C._themeCbs.forEach(fn => { try { fn(light); } catch (e) {} });
      S.needsDraw = true;
    };
    mqd.addEventListener ? mqd.addEventListener('change', onTheme) : mqd.addListener(onTheme);
  } catch (e) {}

  /* ─── public API ─── */
  return { C, S, U, D, rsz };
})();

/* ══════════════════════════════════════════════════════════════════
   MASTER LOOP — 모든 모듈 로드 후 마지막에 시작
══════════════════════════════════════════════════════════════════ */
(function () {
  const { S, D, U } = App;
  if (!D.bgCV) return;  // 필수 DOM 없으면 루프 시작 안 함

  let lastBgFade = -1;
  let prevSettled = false;   // 정착 후 마지막 1프레임은 그리고 나서 스킵
  const hintEl = U.$('scroll-hint');
  S.needsDraw = false;       // resize 등 외부에서 강제 리드로우 요청용

  // 프레임레이트 독립 보간: lerp 계수는 60fps 기준값이므로,
  // 실제 프레임 간격(dt)에 맞춰 k' = 1 - (1-k)^(dt/16.667) 로 보정한다.
  // 안 하면 120/144Hz에서 인트로·카드 모션이 ~2배 빠르고, 렉/탭복귀 때 튄다.
  let lastT = 0;
  const HZ60 = 1000 / 60;
  const adj = (k, f) => 1 - Math.pow(1 - k, f);

  function masterLoop(now) {
    now = now || performance.now();
    let dt = lastT ? now - lastT : HZ60;
    lastT = now;
    const f = Math.min(dt, 50) / HZ60;   // 50ms(≈3프레임)로 상한 → 탭 복귀 점프 방지

    S.heroP    += (S.heroPTgt - S.heroP)    * adj(0.063, f);
    S.cardFrac += (S.cardTgt  - S.cardFrac) * adj(0.115, f);
    if (Math.abs(S.heroPTgt - S.heroP)    < .0003) S.heroP    = S.heroPTgt;
    if (Math.abs(S.cardTgt  - S.cardFrac) < .0003) S.cardFrac = S.cardTgt;

    const bgFade = S.introBgActive ? 0 : Math.max(0, 1 - Math.max(0, (S.heroP - 0.78) / 0.22));

    // ── 유휴 스킵: 갤러리에서 모든 값이 수렴했고 배경도 안 보이면 이번 프레임은 일 없음.
    //    rAF 틱만 유지 → 입력이 오면 다음 프레임에 즉시 재개. PC 상시 부하 제거.
    const settled = S.heroP === S.heroPTgt && S.cardFrac === S.cardTgt
                 && bgFade <= 0.001 && !S.needsDraw;
    if (settled && prevSettled) { requestAnimationFrame(masterLoop); return; }
    prevSettled = settled;
    S.needsDraw = false;

    // 변화 시에만 DOM 업데이트
    if (Math.abs(bgFade - lastBgFade) > .001) {
      D.bgCV.style.opacity = bgFade.toFixed(3);
      lastBgFade = bgFade;
    }
    if (!S.introBgActive && bgFade > 0.001) App.drawBg();

    if (hintEl) hintEl.style.opacity = S.heroP < .1 ? 1 : Math.max(0, 1 - (S.heroP - .1) / .12);

    App.drawCards(S.cardFrac, S.heroP, f);
    if (typeof window.introLayerUpdate === 'function') window.introLayerUpdate(S.heroP);

    requestAnimationFrame(masterLoop);
  }

  App.startLoop = masterLoop;
})();
