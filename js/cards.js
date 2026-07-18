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
    card._ov = ov;  // 매 프레임 querySelector 방지용 캐시
    const bd = document.createElement('div'); bd.className = 'card-border';
    bd.style.cssText = 'position:absolute;inset:0;border-radius:12px;border:1px solid rgba(255,255,255,.12);pointer-events:none;box-sizing:border-box;';
    card.appendChild(bd);
    card._bd = bd;
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
  let lastCi = -1, lastSc = -1, lastRv = '';  // 인포 텍스트 캐시

  /* ─── 레이아웃 ─── */
  let lvCache = null, lvW = 0, lvH = 0;  // 뷰포트가 변할 때만 재계산
  function getLV() {
    const vw = innerWidth, vh = innerHeight;
    if (lvCache && vw === lvW && vh === lvH) return lvCache;
    lvW = vw; lvH = vh;
    const cw = Math.min(Math.min(Math.round(vw * .91), 910), Math.round(vh * .65 * 16 / 9));
    const ch = Math.round(cw * 9 / 16);
    const wax = Math.round(vw * CARD_AX_R);
    const narrow = (wax - cw / 2) - 48 < 230 || (vw - (wax + cw / 2)) < 200 || ((vh - ch) / 2) < 80;
    lvCache = { cw, ch, ax: narrow ? Math.round(vw / 2) : wax, narrow };
    return lvCache;
  }

  let lastLayoutKey = '', lastUiOp = '';  // 레이아웃/투명도 캐시 — 변할 때만 DOM 기록
  function posUI(CW, CH, narrow, hP) {
    const L = $('left'), wl = $('works-label'), inf = $('info');
    const cl = S.AX - CW / 2, ct = S.AY - CH / 2, cb = S.AY + CH / 2;

    const uiOpNum = hP < 0.85 ? 0 : eOut3((hP - 0.85) / 0.15);
    const uiOp = uiOpNum.toFixed(3);
    const uiPE = uiOpNum > 0.1 ? 'auto' : 'none';

    // 레이아웃 입력이 변한 프레임에만 cssText 재작성 (매 프레임 재작성 = 모바일 잔버벅임 원인)
    const layoutKey = CW + ',' + CH + ',' + S.AX + ',' + S.AY + ',' + narrow + ',' + uiPE;
    if (layoutKey !== lastLayoutKey) {
      lastLayoutKey = layoutKey;
      const wfs = Math.max(20, Math.round(64 * (CW / 680)));
      wl.textContent  = 'WORKS';
      wl.style.fontSize = wfs + 'px';
      wl.style.width    = CW + 'px';
      wl.style.left     = cl + 'px';
      wl.style.top      = Math.max(16, ct - wfs) + 'px';

      if (!narrow) {
        const cr = S.AX + CW / 2, lw = Math.max(100, cl - 32);
        L.style.cssText   = `position:absolute;width:${lw}px;left:${cl - lw - 16}px;top:50%;transform:translateY(-50%);text-align:right;pointer-events:${uiPE};z-index:10;`;
        inf.style.cssText = `position:absolute;left:${cr + 24}px;width:${Math.max(0, innerWidth - cr - 32)}px;top:${S.AY}px;transform:translateY(-50%);z-index:10;pointer-events:none;max-height:${CH}px;overflow:hidden;text-align:left;`;
        L.classList.remove('narrow'); inf.classList.remove('narrow');
      } else {
        L.style.cssText   = `position:fixed;top:16px;left:16px;width:auto;text-align:left;transform:none;pointer-events:${uiPE};z-index:10;`;
        inf.style.cssText = `position:absolute;left:${cl}px;width:${CW}px;top:${cb + 12}px;transform:none;z-index:10;pointer-events:none;text-align:center;`;
        L.classList.add('narrow'); inf.classList.add('narrow');
      }
      lastUiOp = '';  // cssText가 opacity를 지웠으므로 아래에서 강제 재적용
    }

    if (uiOp !== lastUiOp) {
      lastUiOp = uiOp;
      wl.style.opacity  = uiOp;
      L.style.opacity   = uiOp;
      inf.style.opacity = uiOp;
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
/* ─── 리사이즈 스무딩: 목표 크기/축을 lerp로 따라감 ─── */
  let smCW = 0, smAX = 0, smAY = 0, smInit = false;

  App.drawCards = function (frac, hP) {
    const { ax, cw, narrow } = getLV();
    const tAY = innerHeight / 2;
    if (!smInit) { smCW = cw; smAX = ax; smAY = tAY; smInit = true; }
    smCW += (cw - smCW) * 0.16;
    smAX += (ax - smAX) * 0.16;
    smAY += (tAY - smAY) * 0.16;
    if (Math.abs(cw - smCW) < .5 && Math.abs(ax - smAX) < .5 && Math.abs(tAY - smAY) < .5) {
      smCW = cw; smAX = ax; smAY = tAY;          // 수렴 → 스냅
    } else {
      S.needsDraw = true;                        // 수렴할 때까지 루프 유지
    }
    const CW = Math.round(smCW), CH = Math.round(CW * 9 / 16);
    S.AX = Math.round(smAX); S.AY = Math.round(smAY);
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

      const ang = (180 - off * STEP) + introOff;
      const rad = ang * Math.PI / 180;
      const cx = CX + R_CARD * Math.cos(rad), cy = CY + R_CARD * Math.sin(rad);

      // 뷰포트 컬링: 화면 밖 카드는 렌더링/합성 제외.
      // abs≤14로는 ~29장이 항상 레이어로 살아있는데 실제 화면엔 7~9장만 보임.
      // 회전 여유분으로 카드 폭 65%를 마진으로 둠.
      const m = CW * 0.65;
      if (cx < -m || cx > innerWidth + m || cy < -m || cy > innerHeight + m) {
        if (card.style.display !== 'none') card.style.display = 'none';
        continue;
      }
      if (card.style.display === 'none') card.style.display = '';

      const tf = `translate3d(${Math.round(cx - CW / 2)}px,${Math.round(cy - CH / 2)}px,0) rotate(${(ang + 180).toFixed(2)}deg)`;
      if (tf !== card._lastTf) { card.style.transform = tf; card._lastTf = tf; }
      const z = Math.round(20 - abs);
      if (z !== card._lastZ) { card.style.zIndex = z; card._lastZ = z; }

      const op = hP >= 1 ? '1' : String(Math.max(0, cardReveal - abs * 0.08));
      if (card.dataset.dummy) {
        if (card._dummyTx) {
          const dfs = Math.round(clamp(CW * 0.075, 18, 52)) + 'px';
          if (dfs !== card._lastDfs) { card._dummyTx.style.fontSize = dfs; card._lastDfs = dfs; }
        }
        if (op !== card._lastOp) { card.style.opacity = op; card._lastOp = op; }
        continue;
      }

      const isCenter = abs < .5;
      const ovBg = isCenter ? 'rgba(0,0,0,0)' : dimRGBA(abs);
      if (ovBg !== card._lastOvBg) { card._ov.style.background = ovBg; card._lastOvBg = ovBg; }
      if (isCenter !== card._lastCenter) {
        card._lastCenter = isCenter;
        if (isCenter) {
          card._bd.style.border  = isLight ? '2px solid rgba(0,0,0,.55)' : '2px solid rgba(255,255,255,.85)';
          card.style.boxShadow   = isLight ? '0 0 40px rgba(0,0,0,.06)' : '0 0 40px rgba(255,255,255,.08)';
        } else {
          card._bd.style.border  = isLight ? '1px solid rgba(0,0,0,.08)' : '1px solid rgba(255,255,255,.10)';
          card.style.boxShadow   = 'none';
        }
      }
      if (op !== card._lastOp) { card.style.opacity = op; card._lastOp = op; }
    }

    const ci = ((Math.round(frac) % N) + N) % N;
    const sc = clamp(CW / 680, .65, 1);
    const rv = uiReveal.toFixed(3);
    const it = $('info-title'), ir = $('info-role');
    if (it && (ci !== lastCi || sc !== lastSc)) {
      it.textContent = works[ci].title || '';
      it.style.fontSize = Math.round(18 * sc) + 'px';
      if (ir) ir.style.fontSize = Math.round(13 * sc) + 'px';
      lastCi = ci; lastSc = sc;
    }
    if (rv !== lastRv) {
      if (it) it.style.opacity = rv;
      if (ir) ir.style.opacity = rv;
      lastRv = rv;
    }
  };
})();
