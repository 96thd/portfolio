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

  // 히스토리 이동으로 특정 카드에 착지.
  //  · 스크롤 이벤트가 오기를 기다리지 않고 cardTgt를 직접 지정해 결정적으로 만든다.
  //  · behavior:'smooth'는 이동 중 스냅 타이머와 얽히므로 즉시 이동을 쓴다.
  function goCard(i) {
    S.heroPTgt = 1;
    clearTimeout(S.snapTO);
    cancelSnap();
    document.body.style.overflow = '';        // 혹시 남아있을 스크롤 잠금 해제
    const top = cardScrollTop(i);
    try { scrollTo({ top: top, behavior: 'auto' }); } catch (e) { scrollTo(0, top); }
    S.cardTgt = i;
    S.needsDraw = true;
    // 레이아웃 반영이 늦어 스크롤이 안 먹은 경우 한 번 더 보정
    requestAnimationFrame(() => {
      if (Math.abs(scrollY - top) > 4) { try { scrollTo(0, top); } catch (e) {} }
      clearTimeout(S.snapTO);
      S.cardTgt = i;
      S.needsDraw = true;
    });
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

  /* ─── 카드 스냅 ───────────────────────────────────────────────
     예전엔 scrollTo({behavior:'smooth'}) — 브라우저 기본 이징이 길고(≈400ms)
     조정이 안 돼 늘어지는 느낌. 직접 rAF로 강한 ease-out을 굴린다.
     사용자 입력(휠/터치/화살표)이 들어오면 즉시 취소해 끊기지 않게. */
  let snapRAF = 0, snapping = false;
  function cancelSnap() { snapping = false; if (snapRAF) cancelAnimationFrame(snapRAF); snapRAF = 0; }
  function snapTo(i) {
    i = Math.round(clamp(i, 0, N - 1));
    const targetY = cardScrollTop(i);
    const startY = scrollY, dist = targetY - startY;
    if (Math.abs(dist) < 1) { S.cardTgt = i; return; }
    cancelSnap();
    snapping = true;
    S.cardTgt = i;                                          // cardFrac이 목표 카드로 수렴
    const dur = Math.min(210, 90 + Math.abs(dist) * 0.5);   // 90~210ms 강한 ease-out
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function step(now) {
      if (!snapping || document.body.classList.contains('intro-active')) { cancelSnap(); return; }
      const p = Math.min(((now || performance.now()) - t0) / dur, 1);
      scrollTo(0, Math.round(startY + dist * ease(p)));
      if (p < 1) snapRAF = requestAnimationFrame(step);
      else cancelSnap();
    })(t0);
  }
  addEventListener('wheel',      cancelSnap, { passive: true });
  addEventListener('touchstart', cancelSnap, { passive: true });

  // 좌측 "SUHO SONG" 텍스트 클릭/터치 → 인트로 첫 화면으로.
  // (카드 화면에서 인트로로 가는 유일한 경로 — 스크롤로는 못 들어감)
  // 모션: 단일 엔진. scrollY는 즉시 맨 위로(콘텐츠는 fixed라 안 보임) 점프하고,
  //       cardFrac→0(카드 되감기)과 heroP→0(인트로 형성 + 아래로 스윕아웃)을
  //       마스터 루프에서 동시에 lerp. 이음새 없음 → 시작 카드 무관하게 같은 속도.
  (function () {
    const h1 = document.querySelector('#left h1');
    if (!h1) return;
    h1.addEventListener('click', () => {
      if (introActive()) return;
      if (isModalOpen()) doClose();
      cancelSnap();
      navReplace('intro');                        // 히스토리도 인트로로 (앞으로가기 없어짐)
      try { scrollTo(0, 0); } catch (e) {}
      if (window.introAPI && window.introAPI.toStart) window.introAPI.toStart();
    });
  })();

  // 인트로 → 첫 카드 핸드오프 직후 잠깐: 관성으로 살짝 밀려도 스냅은 첫 카드로.
  // (붙잡지 않고 자유 스크롤은 허용 — 멈추면 딱 한 번 card 0으로 스냅)
  let handoffUntil = 0;

  /* ─── scroll ─── */
  addEventListener('scroll', () => {
    // 인트로 복귀 중에는 관성 스크롤이 heroPTgt를 1로 되돌려 인트로를 취소시킬 수 있음
    if (document.body.classList.contains('intro-active')) return;
    if (snapping) return;                              // 스냅 애니메이션이 만든 스크롤 이벤트는 무시
    const sy = scrollY;
    S.heroPTgt = 1;                                    // 갤러리 진입 후 heroP 고정
    S.cardTgt  = clamp(sy / PX_PER_CARD, 0, N - 1);
    S.lastSY = sy;
    clearTimeout(S.snapTO);
    // 핸드오프 창 안 + 아직 첫 카드 근처면 무조건 card 0으로 스냅(한 번).
    const toFirst = performance.now() < handoffUntil && S.cardTgt < 1.5;
    const delay = toFirst ? 90 : (S.cardTgt < 0.3 ? 150 : 80);
    S.snapTO = setTimeout(() => snapTo(toFirst ? 0 : S.cardTgt), delay);
  }, { passive: true });

  /* ─── keyboard (갤러리 화살표 내비 + Escape) ─── */
  addEventListener('keydown', e => {
    // input/textarea/contenteditable에 포커스 있으면 무시 (향후 form 추가 대비)
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // 인자 없이 호출 — closeModal이 e.target 없는 경우를 처리함
    if (e.key === 'Escape') { window.closeModal(); return; }

    // 모달이 열려 있으면 갤러리 조작 키를 여기서 끊는다. 영상 단축키(space/←→ 등)는
    // 사용자가 플레이어를 클릭해 포커스가 iframe으로 넘어간 뒤 YouTube가 직접 처리한다.
    // (포커스가 아직 부모에 있을 때 Space가 닫기 버튼을 누르는 것만 막는다.)
    if (isModalOpen()) { if (e.key === ' ') e.preventDefault(); return; }

    if (document.body.classList.contains('intro-active')) return;  // 인트로 중엔 intro.js가 처리
    if (e.key === 'ArrowDown') { e.preventDefault(); snapTo(Math.round(S.cardTgt) + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); snapTo(Math.round(S.cardTgt) - 1); }
  });

  /* ─── 영상 모달 ───────────────────────────────────────────────
     교차 출처(youtube-nocookie) iframe이라 부모는 안쪽 키 입력을 못 읽는다.
     포커스를 뺏지 않고 그대로 두면(클릭하면 iframe으로 이동) YouTube 네이티브
     단축키(space, ←→, ↑↓, j l, m, f, c, 0~9, ,/. 등)가 전부 그냥 동작한다.
     닫기는 ✕ 버튼 / 바깥(어두운 배경) 클릭 / Escape(포커스가 아직 부모에 있을 때).
  ──────────────────────────────────────────────────────────── */
  const YT_ORIGIN = 'https://www.youtube-nocookie.com';

  const isModalOpen = () => $('modal-bg').classList.contains('open');

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
    f.setAttribute('title', '영상 재생');
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    f.allowFullscreen = true;
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

    // "선택한 카드" 단계 유지. 이미 card 단계에 있으면 새로 쌓지 않고 번호만 교체 —
    // 안 그러면 닫고 다른 카드를 열었을 때 뒤로가기가 이전 카드로 간다.
    if (i === 0) {
      if (curView() === 'card') navReplace('gallery', 0);   // 첫 카드는 gallery와 동일
    } else if (curView() === 'card') {
      navReplace('card', i);
    } else if (curView() === 'gallery') {
      navPush('card', i);
    }
    openVideo(i);
    navPush('video', i);
  });

  // 모달 열기 (히스토리는 건드리지 않음 — 호출한 쪽이 책임)
  function openVideo(i) {
    if (!works[i] || !works[i].id) return;
    swapIframe(`${YT_ORIGIN}/embed/${works[i].id}?autoplay=1`);
    $('modal-title').textContent = works[i].title;
    $('modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
    // 배경 UI를 포커스/스크린리더 대상에서 제외 (인스타 링크·PDF 버튼)
    const su = $('stage-ui'); if (su) su.inert = true;
    // 포커스를 닫기 버튼에 둔다 → 클릭 전까지 Escape로 닫힘. 영상을 클릭하면
    // 포커스가 iframe으로 넘어가고 그때부터 YouTube 네이티브 단축키가 동작.
    const b = $('modal-close'); if (b) b.focus();
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

  /* ─── intro handoff (SUHO SONG 클릭으로 다시 들어올 수 있으므로 once 아님) ─── */
  addEventListener('intro-done', () => {
    S.introBgActive = false;
    S.heroP = 1; S.heroPTgt = 1;
    // cardFrac은 인트로 동안 0으로 잠겨 있었으므로 리셋·튕김 없음 → 카드 0번에서 자연 시작
    cancelSnap();
    S.cardTgt = 0;
    try { scrollTo({ top: 0, behavior: 'instant' }); }
    catch (e) { scrollTo(0, 0); }
    // 짧은 핸드오프 창: 관성으로 첫 카드 근처까지 밀려도 멈추면 card 0으로 스냅(한 번)
    handoffUntil = performance.now() + 550;
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
