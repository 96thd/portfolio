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

  /* ─── 히스토리 4단계: intro → gallery(첫 카드) → card(선택 카드) → video ──
     각 항목에 state.v를 심어두고 popstate에서 그 값에 맞춰 화면을 맞춘다.
     "몇 칸 뒤로"가 아니라 "어느 상태로"를 기준으로 하므로,
     예기치 못한 항목이 끼어도 엉뚱한 화면으로 가지 않는다.
  ──────────────────────────────────────────────────────────── */
  const curView = () => (history.state && history.state.v) || 'intro';
  const introActive = () => document.body.classList.contains('intro-active');
  function navPush(v, i) { try { history.pushState({ v: v, i: i }, ''); } catch (e) {} }
  function navReplace(v, i) { try { history.replaceState({ v: v, i: i }, ''); } catch (e) {} }

  navReplace('intro');   // 페이지는 항상 인트로에서 시작

  function goCard(i) {
    S.heroPTgt = 1;
    try { scrollTo({ top: cardScrollTop(i), behavior: 'smooth' }); }
    catch (e) { scrollTo(0, cardScrollTop(i)); }
  }

  addEventListener('popstate', () => {
    const v = curView();
    const i = history.state && history.state.i;

    if (v === 'video') {                       // 앞으로가기로 영상 복귀
      if (!isModalOpen() && Number.isFinite(i)) openVideo(i);
      return;
    }
    if (isModalOpen()) doClose();

    if (v === 'card')    { goCard(Number.isFinite(i) ? i : 0); return; }
    if (v === 'gallery') {                     // 첫 카드
      if (introActive() && window.introAPI) window.introAPI.complete();
      else goCard(0);
      return;
    }
    // intro — 인트로를 처음부터 다시
    if (!introActive() && window.introAPI) window.introAPI.toStart();
  });

  // 사용자가 위로 스크롤해 인트로로 되돌아간 경우 히스토리도 맞춰줌
  addEventListener('intro-reenter', () => {
    if (curView() !== 'intro') history.back();
  });

  // 사용자가 위로 스크롤해 인트로로 되돌아간 경우 히스토리도 맞춰줌
  addEventListener('intro-reenter', () => {
    if (curView() === 'gallery') history.back();
  });

  /* ─── scroll ─── */
  addEventListener('scroll', () => {
    // 인트로 복귀 중에는 관성 스크롤이 heroPTgt를 1로 되돌려 인트로를 취소시킬 수 있음
    if (document.body.classList.contains('intro-active')) return;
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
  // iframe 노드가 매번 교체되므로 swapIframe()에서 다시 붙인다.
  function onIframeLoad() {
    if (!isModalOpen()) return;
    ytPlaying = true;
    ytSend({ event: 'listening', id: 1, channel: 'widget' });
  }
  const ifr0 = $('modal-iframe');
  if (ifr0) ifr0.addEventListener('load', onIframeLoad);

  addEventListener('message', e => {
    if (e.origin !== YT_ORIGIN) return;
    let d; try { d = JSON.parse(e.data); } catch (err) { return; }
    // playerState: 1=재생, 2=일시정지, 0=종료
    if (d && d.info && typeof d.info.playerState === 'number') {
      ytPlaying = d.info.playerState === 1;
    }
  });

  // iframe으로 포커스가 넘어가면 되찾아옴 — 단, 클릭으로 들어간 경우에만.
  // (Tab으로 넘어간 것까지 뺏으면 포커스가 CLOSE에 묶여 탭 이동이 막힌다.
  //  iframe은 tabindex="-1"이라 Tab으로는 애초에 들어가지 않음)
  let lastPointerAt = 0;
  addEventListener('pointerdown', () => { lastPointerAt = Date.now(); }, true);

  addEventListener('blur', () => {
    setTimeout(() => {
      if (!isModalOpen()) return;
      if (document.fullscreenElement) return;          // 전체화면 중엔 건드리지 않음
      if (Date.now() - lastPointerAt > 1200) return;   // 클릭이 아닌 경로면 그대로 둠
      if (document.activeElement !== $('modal-iframe')) return;
      const b = $('modal-close'); if (b) b.focus();
    }, 250);
  });

  // iframe 노드를 통째로 새로 만들어 끼운다.
  //  · src 대입은 히스토리 항목을 만들고(열 때 1 + 닫을 때 1) 뒤로가기가 유령 항목에 걸린다.
  //  · location.replace()는 항목은 안 남기지만 자동재생 정책에 걸려 클릭해야 재생된다.
  //  · 새로 만든 iframe의 최초 로드는 항목을 남기지 않으면서 자동재생도 정상 동작한다.
  //    닫을 때 노드를 버리므로 재생·소리도 확실히 정지된다.
  function swapIframe(url) {
    const old = $('modal-iframe');
    if (!old) return null;
    const f = document.createElement('iframe');
    f.id = 'modal-iframe';
    f.setAttribute('tabindex', '-1');           // Tab으로는 들어가지 않음
    f.setAttribute('title', '영상 재생');
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    f.allowFullscreen = true;
    f.addEventListener('load', onIframeLoad);
    if (url) f.src = url;
    old.replaceWith(f);
    return f;
  }

 /* ─── card click → modal ─── */
  D.cWrap.addEventListener('click', e => {
    if (S.heroP < .92) return;
    // 모달이 이미 열려있으면 중복 클릭 방어
    if (isModalOpen()) return;
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

    // 첫 카드가 아니면 "선택한 카드" 단계를 히스토리에 끼워넣음
    // (첫 카드에서 열면 gallery와 중복되므로 생략)
    if (i !== 0 && curView() === 'gallery') navPush('card', i);
    openVideo(i);
    navPush('video', i);
  });

  // 모달 열기 (히스토리는 건드리지 않음 — 호출한 쪽이 책임)
  function openVideo(i) {
    if (!works[i] || !works[i].id) return;
    // enablejsapi=1 — 스페이스바 재생/일시정지를 postMessage로 제어하기 위해 필요
    swapIframe(`${YT_ORIGIN}/embed/${works[i].id}?autoplay=1&enablejsapi=1&origin=${location.origin}`);
    $('modal-title').textContent = works[i].title;
    $('modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
    ytPlaying = true;
    // 배경 UI를 포커스/스크린리더 대상에서 제외 (인스타 링크·PDF 버튼)
    const su = $('stage-ui'); if (su) su.inert = true;
  }

  // 실제 닫기 (히스토리는 건드리지 않음)
  function doClose() {
    if (!isModalOpen()) return;
    swapIframe('');            // 노드 교체 = 재생 정지
    $('modal-bg').classList.remove('open');
    document.body.style.overflow = '';
    const su = $('stage-ui'); if (su) su.inert = false;
  }

  window.closeModal = function (e) {
    // e.target이 없는 호출(Escape 키, 인라인 onclick="closeModal()")도 통과시킴
    const t = e && e.target;
    if (t && t !== $('modal-bg') && !t.closest('#modal-close')) return;
    if (!isModalOpen()) return;
    // 영상 상태가 히스토리에 있으면 back()으로 되돌려 앞으로가기를 살림
    if (curView() === 'video') {
      history.back();
      // 안전망: 히스토리가 오염돼 back()이 헛돌면 직접 닫음
      setTimeout(() => { if (isModalOpen()) doClose(); }, 350);
      return;
    }
    doClose();
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
    // 앞으로가기로 완료된 경우엔 이미 gallery 상태이므로 중복 추가하지 않음
    if (curView() === 'intro') navPush('gallery');
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
