'use strict';
/* ══════════════════════════════════════════════════════════════════
   CARDS — 생성, 위치 계산, dim, 렌더링
══════════════════════════════════════════════════════════════════ */
(function () {
  const { C, S, U, D } = App;
  const { N, R_CARD, STEP, CARD_AX_R, CDEG, isLight } = C;
  const { eOut3, eOut4, clamp, $ } = U;

  /* ─── 카드 DOM 생성 ─── */
  function makeDummyCard(card) {
    card.dataset.dummy = '1';
    card.style.background = isLight ? '#e8e6e0' : '#1e1e1e';
    const bd = document.createElement('div');
    bd.style.cssText = isLight
      ? 'position:absolute;inset:0;border-radius:12px;border:1.5px solid rgba(58,55,51,.28);pointer-events:none;box-sizing:border-box;box-shadow:0 0 24px rgba(58,55,51,.07),inset 0 0 24px rgba(58,55,51,.03);'
      : 'position:absolute;inset:0;border-radius:12px;border:1.5px solid rgba(240,237,232,.55);pointer-events:none;box-sizing:border-box;box-shadow:0 0 24px rgba(240,237,232,.10),inset 0 0 24px rgba(240,237,232,.04);';
    card.appendChild(bd);
    const tx = document.createElement('div');
    tx.textContent = 'NOW WORKING';
    tx.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
      + 'font-family:"Bebas Neue","Noto Sans KR",sans-serif;font-weight:700;letter-spacing:.20em;line-height:1;'
      + (isLight
        ? 'color:#3a3733;text-shadow:0 0 8px rgba(58,55,51,.18),0 0 20px rgba(58,55,51,.06);'
        : 'color:#f0ede8;text-shadow:0 0 8px rgba(240,237,232,.6),0 0 20px rgba(240,237,232,.2),0 0 44px rgba(240,237,232,.10);')
      + 'user-select:none;pointer-events:none;';
    card._dummyTx = tx;
    card.appendChild(tx);
  }

  function makeImageCard(card, w) {
    const img = document.createElement('img');
    img.dataset.vid = w.id;  // src는 지연 할당 — ensureThumb()에서 화면 근처 진입 시 1회만
    img.onerror = function () { this.onerror = null; this.src = `https://i.ytimg.com/vi/${this.dataset.vid}/hqdefault.jpg`; };
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.draggable = false;
    card.appendChild(img);
    card._thumb = img;
    const ov = document.createElement('div'); ov.className = 'card-overlay';
    ov.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0);pointer-events:none;';
    card.appendChild(ov);
    const bd = document.createElement('div'); bd.className = 'card-border';
    bd.style.cssText = 'position:absolute;inset:0;border-radius:12px;border:1px solid rgba(255,255,255,.12);pointer-events:none;box-sizing:border-box;';
    card.appendChild(bd);
  }

  const cardEls = works.map((w, i) => {
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.idx = i;
    (w.id ? makeImageCard : makeDummyCard)(card, w);
    D.cWrap.appendChild(card);
    return card;
  });
  App.cardEls = cardEls;  // events.js에서 클릭 핸들링 시 참조

  let lastCW = -1, lastCH = -1;  // 카드 크기 캐시 — 변할 때만 width/height 기록

  /* ─── 레이아웃 ─── */
  function getLV() {
    const vw = innerWidth, vh = innerHeight;
    const cw = Math.min(Math.min(Math.round(vw * .91), 910), Math.round(vh * .65 * 16 / 9));
    const ch = Math.round(cw * 9 / 16);
    const wax = Math.round(vw * CARD_AX_R);
    const narrow = (wax - cw / 2) - 48 < 230 || (vw - (wax + cw / 2)) < 200 || ((vh - ch) / 2) < 80;
    return { cw, ch, ax: narrow ? Math.round(vw / 2) : wax, narrow };
  }

  function posUI(CW, CH, narrow, hP) {
    const L = $('left'), wl = $('works-label'), inf = $('info');
    const cl = S.AX - CW / 2, ct = S.AY - CH / 2, cb = S.AY + CH / 2;
    const wfs = Math.max(20, Math.round(64 * (CW / 680)));

    const uiOp = (hP < 0.85 ? 0 : eOut3((hP - 0.85) / 0.15)).toFixed(3);
    const uiPE = uiOp > 0.1 ? 'auto' : 'none';

    wl.textContent  = 'WORKS';
    wl.style.fontSize = wfs + 'px';
    wl.style.width    = CW + 'px';
    wl.style.left     = cl + 'px';
    wl.style.top      = Math.max(16, ct - wfs) + 'px';
    wl.style.opacity  = uiOp;

    if (!narrow) {
      const cr = S.AX + CW / 2, lw = Math.max(100, cl - 32);
      L.style.cssText   = `position:absolute;width:${lw}px;left:${cl - lw - 16}px;top:50%;transform:translateY(-50%);text-align:right;pointer-events:${uiPE};z-index:10;opacity:${uiOp};`;
      inf.style.cssText = `position:absolute;left:${cr + 24}px;width:${Math.max(0, innerWidth - cr - 32)}px;top:${S.AY}px;transform:translateY(-50%);z-index:10;pointer-events:none;max-height:${CH}px;overflow:hidden;text-align:left;opacity:${uiOp};`;
      L.classList.remove('narrow'); inf.classList.remove('narrow');
    } else {
      L.style.cssText   = `position:fixed;top:16px;left:16px;width:auto;text-align:left;transform:none;pointer-events:${uiPE};z-index:10;opacity:${uiOp};`;
      inf.style.cssText = `position:absolute;left:${cl}px;width:${CW}px;top:${cb + 12}px;transform:none;z-index:10;pointer-events:none;text-align:center;opacity:${uiOp};`;
      L.classList.add('narrow'); inf.classList.add('narrow');
    }
  }

  // 썸네일 지연 로딩: 화면 근처(±17)에 진입할 때 1회만 src 할당
  function ensureThumb(card) {
    const img = card._thumb;
    if (!img || img.dataset.loaded) return;
    img.dataset.loaded = '1';
    img.src = `https://i.ytimg.com/vi/${img.dataset.vid}/maxresdefault.jpg`;
  }

  // 비현재 카드 dim
  function dimRGBA(abs) {
    const dim  = abs > 9 ? Math.min(.95, abs * .08 + .5) : Math.min(.88, abs * .07 + .5);
    const dimL = abs > 9 ? Math.min(.97, abs * .08 + .56) : Math.min(.92, abs * .10 + .52);
    return isLight ? `rgba(245,244,240,${dimL})` : `rgba(0,0,0,${dim})`;
  }

  /* ─── 카드 렌더링 ─── */
  App.drawCards = function (frac, hP) {
    const { ax, cw: CW, ch: CH, narrow } = getLV();
    S.AX = ax; S.AY = Math.round(innerHeight / 2);
    const CX = S.AX + R_CARD, CY = S.AY;
    posUI(CW, CH, narrow, hP);

    if (CW !== lastCW || CH !== lastCH) {
      const wpx = CW + 'px', hpx = CH + 'px';
      for (let i = 0; i < N; i++) { cardEls[i].style.width = wpx; cardEls[i].style.height = hpx; }
      lastCW = CW; lastCH = CH;
    }

    const introOff   = (1 - eOut4(hP)) * CDEG;
    const cardReveal = hP < 0.55 ? 0 : eOut4((hP - 0.55) / 0.45);
    const uiReveal   = hP < 0.85 ? 0 : eOut3((hP - 0.85) / 0.15);

    for (let i = 0; i < N; i++) {
      const off = i - frac, abs = Math.abs(off), card = cardEls[i];
      if (abs <= 17) ensureThumb(card);  // 더미 카드는 _thumb 없음 → 자동 no-op
      if (abs > 14) { if (card.style.display !== 'none') card.style.display = 'none'; continue; }
      if (card.style.display === 'none') card.style.display = '';

      const ang = (180 - off * STEP) + introOff;
      const rad = ang * Math.PI / 180;
      const cx = CX + R_CARD * Math.cos(rad), cy = CY + R_CARD * Math.sin(rad);
      card.style.transform = `translate3d(${Math.round(cx - CW / 2)}px,${Math.round(cy - CH / 2)}px,0) rotate(${(ang + 180).toFixed(2)}deg)`;
      card.style.zIndex = Math.round(20 - abs);

      if (card.dataset.dummy) {
        if (card._dummyTx) card._dummyTx.style.fontSize = Math.round(clamp(CW * 0.075, 18, 52)) + 'px';
        card.style.opacity = hP >= 1 ? '1' : String(Math.max(0, cardReveal - abs * 0.08));
        continue;
      }

      const ov = card.querySelector('.card-overlay');
      const bd = card.querySelector('.card-border');
      if (abs < .5) {
        ov.style.background = 'rgba(0,0,0,0)';
        bd.style.border     = isLight ? '2px solid rgba(0,0,0,.55)' : '2px solid rgba(255,255,255,.85)';
        card.style.boxShadow = isLight ? '0 0 40px rgba(0,0,0,.06)' : '0 0 40px rgba(255,255,255,.08)';
      } else {
        ov.style.background = dimRGBA(abs);
        bd.style.border     = isLight ? '1px solid rgba(0,0,0,.08)' : '1px solid rgba(255,255,255,.10)';
        card.style.boxShadow = 'none';
      }
      card.style.opacity = hP >= 1 ? '1' : String(Math.max(0, cardReveal - abs * 0.08));
    }

    const ci = ((Math.round(frac) % N) + N) % N;
    const sc = clamp(CW / 680, .65, 1);
    const it = $('info-title'), ir = $('info-role');
    if (it) { it.textContent = works[ci].title || ''; it.style.fontSize = Math.round(18 * sc) + 'px'; it.style.opacity = uiReveal.toFixed(3); }
    if (ir) { ir.style.fontSize = Math.round(13 * sc) + 'px'; ir.style.opacity = uiReveal.toFixed(3); }
  };
})();
