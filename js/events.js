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

  /* ─── keyboard (통합: 화살표 + Escape + 모달 스페이스) ─── */
  addEventListener('keydown', e => {
    // input/textarea/contenteditable에 포커스 있으면 무시 (향후 form 추가 대비)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // 인자 없이 호출 — closeModal이 e.target 없는 경우를 처리함
    if (e.key === 'Escape') { window.closeModal(); return; }

    // 모달이 열려 있는 동안: 스페이스=재생/일시정지, 그 외 키는 카드로 새지 않게 차단
    if (isModalOpen()) {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); ytToggle(); }
      return;
    }

    if (document.body.classList.contains('intro-active')) return;  // 인트로 중엔 intro.js가 처리
    if (e.key === 'ArrowDown') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.min(N - 1, Math.round(S.cardTgt) + 1)), behavior: 'smooth' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scrollTo({ top: cardScrollTop(Math.max(0, Math.round(S.cardTgt) - 1)), behavior: 'smooth' }); }
  });

  /* ─── 유튜브 플레이어 제어 (iframe postMessage) ─────────────────
     교차 출처라 iframe 내부의 키 입력은 읽을 수 없음.
     → 클릭으로 포커스가 iframe에 들어가면 즉시 되찾아와서
       Escape·스페이스가 이 페이지에서 계속 동작하게 함.
     대가: 유튜브 자체 단축키(k/j/l/f/방향키)는 동작하지 않음.
  ──────────────────────────────────────────────────────────── */
  const YT_ORIGIN = 'https://www.youtube-nocookie.com';
  let ytPlaying = true;   // autoplay=1로 열리므로 재생 상태로 시작

  const isModalOpen = () => $('modal-bg').classList.contains('open');

  function ytSend(msg) {
    const f = $('modal-iframe');
    if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage(JSON.stringify(msg), YT_ORIGIN); } catch (e) {}
  }
  function ytToggle() {
    ytSend({ event: 'command', func: ytPlaying ? 'pauseVideo' : 'playVideo', args: [] });
    ytPlaying = !ytPlaying;   // 상태 이벤트가 오면 아래 message 핸들러가 보정
  }

  // 플레이어 상태 이벤트 수신 등록 (직접 조작해도 ytPlaying이 어긋나지 않게)
  const ifr = $('modal-iframe');
  if (ifr) ifr.addEventListener('load', () => {
    if (!isModalOpen()) return;
    ytPlaying = true;
    ytSend({ event: 'listening', id: 1, channel: 'widget' });
  });

  addEventListener('message', e => {
    if (e.origin !== YT_ORIGIN) return;
    let d; try { d = JSON.parse(e.data); } catch (err) { return; }
    // playerState: 1=재생, 2=일시정지, 0=종료
    if (d && d.info && typeof d.info.playerState === 'number') {
      ytPlaying = d.info.playerState === 1;
    }
  });

  // iframe으로 포커스가 넘어가면 되찾아옴. 클릭/드래그가 끝날 여유를 두고 실행.
  addEventListener('blur', () => {
    setTimeout(() => {
      if (!isModalOpen()) return;
      if (document.fullscreenElement) return;          // 전체화면 중엔 건드리지 않음
      if (document.activeElement !== $('modal-iframe')) return;
      const b = $('modal-close'); if (b) b.focus();
    }, 250);
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

    // enablejsapi=1 — 스페이스바 재생/일시정지를 postMessage로 제어하기 위해 필요
    $('modal-iframe').src = `${YT_ORIGIN}/embed/${works[i].id}?autoplay=1&enablejsapi=1&origin=${location.origin}`;
    $('modal-title').textContent = works[i].title;
    $('modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
    ytPlaying = true;
    // 배경 UI를 포커스/스크린리더 대상에서 제외 (인스타 링크·PDF 버튼)
    const su = $('stage-ui'); if (su) su.inert = true;
  });

  window.closeModal = function (e) {
    // e.target이 없는 호출(Escape 키, 인라인 onclick="closeModal()")도 통과시킴
    const t = e && e.target;
    if (t && t !== $('modal-bg') && !t.closest('#modal-close')) return;
    if (!isModalOpen()) return;
    const iframe = $('modal-iframe');
    // about:blank로 정리: 빈 문자열은 일부 브라우저에서 현재 URL을 재로드하거나 404 콘솔 오류 발생
    if (iframe) iframe.src = 'about:blank';
    $('modal-bg').classList.remove('open');
    document.body.style.overflow = '';
    const su = $('stage-ui'); if (su) su.inert = false;
  };

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
