'use strict';
/* ══════════════════════════════════════════════════════════════════
   BACKGROUND — horizontal split that collapses on scroll
   dark:  상단 흰색이 위로 사라짐    light: 하단 검정이 아래로 사라짐
══════════════════════════════════════════════════════════════════ */
(function () {
  const { C, S, D } = App;

  const DR = 400;
  const dp = new Float32Array(DR);
  let dPh = 0;

  function uDisp() {
    dPh += 0.016;
    for (let i = 0; i < DR; i++) {
      const x = i / DR;
      dp[i] = Math.sin(x * 8.1 + dPh * 2.3) * 3.5
            + Math.sin(x * 21.3 + dPh * 4.1) * 1.8
            + Math.sin(x * 53.7 + dPh * 1.2)
            + (Math.random() < .004 ? (Math.random() - .5) * 18 : 0);
    }
  }

  function bndY(x) {
    const xf = x / S.W;
    const base  = S.H * (0.50 + xf * 0.02);
    const shift = (C.isLight ? 1 : -1) * S.heroP * S.H * 0.80;
    return base + shift + (dp[Math.min(~~(xf * DR), DR - 1)] || 0);
  }

  // glitch
  let gT = .6, gA = false, gL = [];
  function sG() {
    gA = true; gL = [];
    for (let i = 0; i < 3 + ~~(Math.random() * 5); i++)
      gL.push({ x: Math.random() * S.W, w: 1 + Math.random() * 3, a: .14 + Math.random() * .2, life: .04 + Math.random() * .08, age: 0 });
  }

  App.drawBg = function () {
    const ctx = D.bgCtx, W = S.W, H = S.H;
    uDisp();
    ctx.fillStyle = C.DOM_BG; ctx.fillRect(0, 0, W, H);

    const ay = C.isLight ? H : 0;
    ctx.beginPath(); ctx.moveTo(0, ay);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, bndY(x));
    ctx.lineTo(W, ay); ctx.closePath();
    ctx.fillStyle = C.COL_BG; ctx.fill();

    // 경계선 노이즈
    if (S.heroP < 0.98) {
      for (let x = 0; x < W; x += 3) {
        const s = bndY(x), nh = 10 + Math.sin(dPh * 2 + x * .03) * 5;
        for (let ny = s - nh; ny < s + nh; ny += 4) {
          if (ny < 0 || ny > H) continue;
          ctx.fillStyle = `rgba(128,128,128,${(1 - Math.abs(ny - s) / nh) * .10 * Math.random()})`;
          ctx.fillRect(x, ny, 2, 2);
        }
      }
    }
    // film grain
    for (let i = 0; i < 50; i++) {
      const nx = Math.random() * W, ny = Math.random() * H, a = .02 + Math.random() * .06;
      ctx.fillStyle = ny < bndY(nx) ? `rgba(210,210,210,${a})` : `rgba(30,30,30,${a})`;
      ctx.fillRect(nx, ny, 1, 1);
    }
    // glitch streaks
    gT -= .016;
    if (!gA && gT <= 0) { if (Math.random() < .06) sG(); gT = .12 + Math.random() * .15; }
    if (gA) {
      let done = true;
      gL.forEach(g => {
        g.age += .016;
        if (g.age < g.life) {
          done = false;
          ctx.fillStyle = `rgba(150,150,150,${g.a * (1 - g.age / g.life)})`;
          ctx.fillRect(g.x, 0, g.w, H);
        }
      });
      if (done) { gA = false; gT = 2 + Math.random() * 3; }
    }
    // scanlines
    for (let y = 0; y < H; y += 6) { ctx.fillStyle = 'rgba(0,0,0,.018)'; ctx.fillRect(0, y, W, 1); }
  };
})();
