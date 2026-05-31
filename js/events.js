'use strict';
/* ══════════════════════════════════════════════════════════════════
   EVENTS — scroll / keyboard / click / resize / modal / intro handoff / PDF
   마지막에 startLoop() 호출
══════════════════════════════════════════════════════════════════ */
(function () {
  const { C, S, U, D } = App;
  const { N, PX_PER_CARD, CARD_DEAD_PX, HERO_H } = C;
  const { clamp, $ } = U;

  const cardScrollTop = i => HERO_H() + CARD_DEAD_PX + i * PX_PER_CARD;

  /* ─── scroll ─── */
  addEventListener('scroll', () => {
    const sy = scrollY, hh = HERO_H();
    S.heroPTgt = clamp(sy / hh, 0, 1);
    S.cardTgt  = clamp(Math.max(0, sy - hh - CARD_DEAD_PX) / PX_PER_CARD, 0, N - 1);
    S.lastSY = sy;
    clearTimeout(S.snapTO);
    if (sy >= hh * .98) {
      const delay = S.cardTgt < 0.3 ? 500 : 160;
      S.snapTO = setTimeout(() => scrollTo({ top: cardScrollTop(Math.round(S.cardTgt)), behavior: 'smooth' }), delay);
    }
  }, { passive: true });

  /* ─── keyboard (통합: 화살표 + Escape) ─── */
  addEventListener('keydown', e => {
    // input/textarea/contenteditable에 포커스 있으면 무시 (향후 form 추가 대비)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (e.key === 'Escape') { window.closeModal({}); return; }
    if (S.lastSY < HERO_H() * .98) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.min(N - 1, Math.round(S.cardTgt) + 1)), behavior: 'smooth' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.max(0, Math.round(S.cardTgt) - 1)), behavior: 'smooth' }); }
  });

  /* ─── card click → modal ─── */
  D.cWrap.addEventListener('click', e => {
    if (S.heroP < .92) return;
    // 모달이 이미 열려있으면 중복 클릭 방어
    if ($('modal-bg').classList.contains('open')) return;
    const card = e.target.closest('.card');
    if (!card || card.dataset.dummy) return;
    const i = parseInt(card.dataset.idx, 10);
    if (!Number.isFinite(i) || !works[i] || !works[i].id) return;  // 잘못된 인덱스/데이터 방어
    if (Math.abs(i - S.cardFrac) < .5) {
      $('modal-iframe').src = `https://www.youtube-nocookie.com/embed/${works[i].id}?autoplay=1&origin=${location.origin}`;
      $('modal-title').textContent = works[i].title;
      $('modal-bg').classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      scrollTo({ top: cardScrollTop(i), behavior: 'smooth' });
    }
  });

  window.closeModal = function (e) {
    if (e && e.target !== $('modal-bg') && !e.target.closest('#modal-close')) return;
    const iframe = $('modal-iframe');
    // about:blank로 정리: 빈 문자열은 일부 브라우저에서 현재 URL을 재로드하거나 404 콘솔 오류 발생
    if (iframe) iframe.src = 'about:blank';
    $('modal-bg').classList.remove('open');
    document.body.style.overflow = '';
  };

  /* ─── resize ─── */
  function setSH() {
    $('scroll-driver').style.height = (HERO_H() + CARD_DEAD_PX + (N - 1) * PX_PER_CARD + innerHeight) + 'px';
  }
  addEventListener('resize', () => {
    clearTimeout(S.rsTO);
    // 120ms: 모바일 주소바/가상키보드 토글 시 짧은 시간 내 여러 번 발화하는 것 방어
    S.rsTO = setTimeout(() => { App.rsz(); setSH(); }, 120);
  });
  setSH();

  /* ─── intro handoff ─── */
  addEventListener('intro-done', () => {
    S.introBgActive = false;
    S.heroP = 1; S.heroPTgt = 1;
    S.cardTgt = 0; S.cardFrac = 0;
    // behavior:'instant'를 모르는 구형 브라우저는 try/catch로 fallback
    try { scrollTo({ top: HERO_H(), behavior: 'instant' }); }
    catch (e) { scrollTo(0, HERO_H()); }
  }, { once: true });

  /* ─── start the loop ─── */
  App.startLoop();

  /* ─── PDF download filename (background task) ─── */
  (async () => {
    const link = $('pdf-download'); if (!link) return;
    try {
      const r = await fetch('portfolio.pdf', { method: 'HEAD', cache: 'no-store' });
      const lm = r.headers.get('Last-Modified');
      if (lm) {
        const d = new Date(lm);
        const pad = n => String(n).padStart(2, '0');
        link.setAttribute('download',
          `SUHOSONG_PD_Portfolio_${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}.pdf`);
      }
    } catch {}
  })();
})();
