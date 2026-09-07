'use strict';
/* ══════════════════════════════════════════════════════════════════
   EVENTS — scroll / keyboard / click / resize / modal / intro handoff / PDF
   마지막에 startLoop() 호출
══════════════════════════════════════════════════════════════════ */
(function () {
  const { C, S, U, D } = App;
  const { N, PX_PER_CARD } = C;
  const { clamp, $ } = U;

  // 인트로는 잠긴 게이트(intro.js)에서 처리 → document 스크롤은 카드 전용.
  // scrollY = 0 → 카드 0번. 인트로 핸드오프 이후에만 스크롤 이벤트가 발생함.
  const cardScrollTop = i => i * PX_PER_CARD;

  // 모달을 열면서 history 항목을 쌓았는지 여부 (뒤로가기 처리용)
  let modalPushed = false;

  /* ─── scroll ─── */
  addEventListener('scroll', () => {
    const sy = scrollY;
    S.heroPTgt = 1;                                    // 갤러리 진입 후 heroP 고정
    S.cardTgt  = clamp(sy / PX_PER_CARD, 0, N - 1);
    S.lastSY = sy;
    clearTimeout(S.snapTO);
    const delay = S.cardTgt < 0.3 ? 220 : 140;
    S.snapTO = setTimeout(() => scrollTo({ top: cardScrollTop(Math.round(S.cardTgt)), behavior: 'smooth' }), delay);
  }, { passive: true });

  /* ─── keyboard (통합: 화살표 + Escape) ─── */
  addEventListener('keydown', e => {
    // input/textarea/contenteditable에 포커스 있으면 무시 (향후 form 추가 대비)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (e.key === 'Escape') { window.closeModal({}); return; }
    if (document.body.classList.contains('intro-active')) return;  // 인트로 중엔 intro.js가 처리
    if (e.key === 'ArrowDown') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.min(N - 1, Math.round(S.cardTgt) + 1)), behavior: 'smooth' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.max(0, Math.round(S.cardTgt) - 1)), behavior: 'smooth' }); }
  });

 /* ─── card click → modal ─── */
  D.cWrap.addEventListener('click', e => {
    if (S.heroP < .92) return;
    // 모달이 이미 열려있으면 중복 클릭 방어
    if ($('modal-bg').classList.contains('open')) return;
    const card = e.target.closest('.card');
    if (!card) return;
    const i = parseInt(card.dataset.idx, 10);
    if (!Number.isFinite(i) || !works[i]) return;  // 잘못된 인덱스 방어

    // 중앙이 아니면 더미든 영상이든 일단 그 카드로 이동
    if (Math.abs(i - S.cardFrac) >= .5) {
      scrollTo({ top: cardScrollTop(i), behavior: 'smooth' });
      return;
    }

    // 중앙에 온 카드: 더미는 모달 없음, 영상만 모달
    if (card.dataset.dummy || !works[i].id) return;

    $('modal-iframe').src = `https://www.youtube-nocookie.com/embed/${works[i].id}?autoplay=1&origin=${location.origin}`;
    $('modal-title').textContent = works[i].title;
    $('modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
    // 배경 UI를 포커스/스크린리더 대상에서 제외 (인스타 링크·PDF 버튼)
    const su = $('stage-ui'); if (su) su.inert = true;
    // 히스토리 항목 추가 → 모바일 뒤로가기가 사이트 이탈 대신 모달만 닫음
    try { history.pushState({ modal: true }, ''); modalPushed = true; } catch (e) { modalPushed = false; }
  });

  // 실제 닫기 동작 — 히스토리는 건드리지 않음
  function doCloseModal() {
    const iframe = $('modal-iframe');
    // about:blank로 정리: 빈 문자열은 일부 브라우저에서 현재 URL을 재로드하거나 404 콘솔 오류 발생
    if (iframe) iframe.src = 'about:blank';
    $('modal-bg').classList.remove('open');
    document.body.style.overflow = '';
    const su = $('stage-ui'); if (su) su.inert = false;
  }

  window.closeModal = function (e) {
    // e.target이 없는 호출(Escape 키 등)도 안전하게 통과시킴
    const t = e && e.target;
    if (t && t !== $('modal-bg') && !t.closest('#modal-close')) return;
    if (!$('modal-bg').classList.contains('open')) return;
    // pushState로 쌓아둔 항목이 있으면 back() → popstate가 doCloseModal 실행
    if (modalPushed) { modalPushed = false; history.back(); return; }
    doCloseModal();
  };

  // 뒤로가기(또는 back() 호출) → 모달만 닫기
  addEventListener('popstate', () => {
    if (!$('modal-bg').classList.contains('open')) return;
    modalPushed = false;
    doCloseModal();
  });

  /* ─── resize ─── */
  function setSH() {
    $('scroll-driver').style.height = ((N - 1) * PX_PER_CARD + innerHeight) + 'px';
  }
addEventListener('resize', () => {
  S.needsDraw = true;   // ← 추가: 드래그 중에도 루프를 깨워 레이아웃 즉시 갱신
  clearTimeout(S.rsTO);
  S.rsTO = setTimeout(() => { App.rsz(); setSH(); }, 120);
});
  setSH();

  /* ─── intro handoff (재진입 가능하므로 once 아님) ─── */
  addEventListener('intro-done', () => {
    S.introBgActive = false;
    S.heroP = 1; S.heroPTgt = 1;
    // cardFrac은 인트로 동안 0으로 잠겨 있었으므로 리셋·튕김 없음 → 카드 0번에서 자연 시작
    try { scrollTo({ top: 0, behavior: 'instant' }); }
    catch (e) { scrollTo(0, 0); }
  });

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
