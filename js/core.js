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
  document.documentElement.classList.toggle('force-light',  isLight);
  document.documentElement.classList.toggle('force-dark',  !isLight);

  C.isLight = isLight;
  C.COL_BG  = isLight ? C.DARK_BG  : C.LIGHT_BG;  // 사라지는 패널
  C.DOM_BG  = isLight ? C.LIGHT_BG : C.DARK_BG;   // 남는 패널

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

  function rsz() { S.W = D.bgCV.width = innerWidth; S.H = D.bgCV.height = innerHeight; }
  rsz();

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

  function masterLoop() {
    S.heroP    += (S.heroPTgt - S.heroP)    * 0.063;
    S.cardFrac += (S.cardTgt  - S.cardFrac) * 0.115;
    if (Math.abs(S.heroPTgt - S.heroP)    < .0003) S.heroP    = S.heroPTgt;
    if (Math.abs(S.cardTgt  - S.cardFrac) < .0003) S.cardFrac = S.cardTgt;

    const bgFade = S.introBgActive ? 0 : Math.max(0, 1 - Math.max(0, (S.heroP - 0.78) / 0.22));
    // 변화 시에만 DOM 업데이트
    if (Math.abs(bgFade - lastBgFade) > .001) {
      D.bgCV.style.opacity = bgFade.toFixed(3);
      lastBgFade = bgFade;
    }
    if (!S.introBgActive && bgFade > 0.001) App.drawBg();

    const hint = U.$('scroll-hint');
    if (hint) hint.style.opacity = S.heroP < .1 ? 1 : Math.max(0, 1 - (S.heroP - .1) / .12);

    App.drawCards(S.cardFrac, S.heroP);
    if (typeof window.introLayerUpdate === 'function') window.introLayerUpdate(S.heroP);

    requestAnimationFrame(masterLoop);
  }

  App.startLoop = masterLoop;
})();
