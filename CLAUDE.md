# CLAUDE.md

## 개요

송수호(SUHO SONG) — MV 프로듀서의 개인 포트폴리오 웹사이트.
스크롤로 카드가 원호를 그리며 회전하는 인터랙티브 갤러리로 유튜브 뮤직비디오 작업물을 보여준다.

- **빌드 도구 없음.** 순수 정적 사이트 (HTML + CSS + 바닐라 JS). 번들러·프레임워크·`package.json` 없음.
- **배포 파일은 전부 `site/` 안에 있다.** GitHub Pages는 `site/`만 서빙한다.
  레포 루트에는 인프라/메타 파일만 둔다 (`.github/`, `CLAUDE.md`, `README.md`, `.gitignore`).
- **배포:** GitHub Actions (`.github/workflows/deploy.yml`) — `main`에 push 시 `site/`를
  통째로 업로드해 `https://96thd.github.io/portfolio/` 로 발행. 빌드 단계 없이 정적 파일 그대로.
  (Pages Source 설정 = "GitHub Actions".)
- **로컬 확인:** `site/`를 정적 서버로 연다. 예: `python3 -m http.server 8000 --directory site`
  후 `http://localhost:8000/`. (모듈 로딩·fetch 때문에 `file://` 직접 열기는 일부 기능이 동작하지 않음.)
- **`screenshots/`** 는 로컬 전용 스크린샷 모음 폴더 (`.gitignore` 처리, 레포/배포에 안 들어감).

## 기술 스택

| 영역 | 내용 |
|------|------|
| 렌더링 | 바닐라 JS, `<canvas>` 2D (배경), DOM transform (카드) |
| 스타일 | 순수 CSS, CSS 변수 토큰, `prefers-color-scheme` 다크/라이트 |
| 폰트 | Google Fonts (Bebas Neue, Noto Sans KR/SC/JP, DM Mono) |
| 영상 | YouTube `youtube-nocookie.com` iframe 임베드 + postMessage 제어 |
| PWA | `site.webmanifest`, favicon/아이콘 세트 |
| PDF 자동 생성 | GitHub Actions + Puppeteer (`.github/workflows/build-pdf.yml`) |
| 배포 | GitHub Actions Pages (`.github/workflows/deploy.yml`) — `site/` 업로드 |

## 파일 구조

```
site/                 ← GitHub Pages가 서빙하는 폴더. 배포 파일은 전부 여기.
  index.html          메인 페이지. <script>를 아래 순서대로 로드 (순서 중요)
  pdf.html            PDF 생성 전용 페이지 (Actions에서 Puppeteer가 렌더 → site/portfolio.pdf)
  portfolio.pdf       자동 생성 결과물 (Actions가 커밋, 직접 수정 금지)
  favicon.svg, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest
  css/
    style.css         토큰, 레이아웃, 카드/좌측패널/인포/모달
    intro.css         인트로 레이어 (SCROLL 힌트, intro-active 잠금)
  js/                 로드 순서 = 의존 순서
    works.js          데이터: const works = [{ id: <YouTube ID>, title }]. id:'' 는 "NOW WORKING" 더미 카드
    core.js           window.App — 상수(C)/상태(S)/유틸(U)/DOM refs(D) + 마스터 rAF 루프
    bg.js             App.drawBg — 스크롤에 따라 접히는 흑백 분할 배경 (필름 그레인/글리치)
    cards.js          App.drawCards — 카드 생성, 원호 배치, dim, 썸네일 지연 로딩, UI 위치
    events.js         스크롤/키보드/클릭/리사이즈/모달/히스토리 내비/PDF 파일명. 끝에서 App.startLoop() 호출
    intro.js          잠긴 게이트 인트로 + 재진입(위로 스크롤 시 역재생). window.introAPI
.github/workflows/
  deploy.yml          site/** 변경 시 site/ 를 Pages로 업로드 (빌드 없음)
  build-pdf.yml       site/js/works.js · site/pdf.html 변경 시 PDF 재생성 후 커밋
                      → 완료 이벤트(workflow_run)로 deploy.yml이 이어받아 새 PDF 발행
screenshots/          로컬 전용 (.gitignore). 배포/레포에 안 들어감
```

## 아키텍처 핵심

- **`window.App` 싱글턴** (`core.js`): 모든 모듈이 `App.C/S/U/D`를 공유. `App.S`는 가변 상태로
  다른 모듈이 직접 수정한다 (`S.heroPTgt`, `S.cardTgt` 등).
- **단일 마스터 루프** (`core.js`): 하나의 `requestAnimationFrame` 루프가 `heroP`(인트로 진행도)와
  `cardFrac`(현재 카드 위치)를 lerp로 보간하고 `drawBg` / `drawCards` / `introLayerUpdate`를 호출.
  값이 모두 수렴하면 프레임을 스킵해 유휴 부하를 없앤다.
- **스크롤 모델:** document 스크롤 = 카드 인덱스 (`scrollY / PX_PER_CARD`). 인트로 동안에는
  `body.intro-active`로 스크롤을 잠그고 휠/터치 입력을 누적해 `heroP`만 굴린다.
- **히스토리 4단계:** intro → gallery → card → video. 각 `history.state.v`에 상태를 심어
  `popstate`에서 화면을 복원한다 ("몇 칸 뒤로"가 아니라 "어느 상태로").
- **성능 최적화가 많음:** DOM 쓰기 캐싱(`_lastTf`, `_lastZ` 등), 뷰포트 컬링, 썸네일 지연 로딩,
  배경 오프스크린 캐시. 코드 수정 시 이 캐시 무효화 패턴을 깨지 않도록 주의.

## 작업 시 주의사항

- **배포 파일 경로는 모두 `site/` 아래다.** 아래 경로 표기는 `site/` 생략형 (실제 = `site/js/...`).
- **`site/portfolio.pdf`는 직접 편집하지 않는다.** `works.js` 또는 `pdf.html`을 고치면 Actions가 재생성한다.
- **`site/index.html`의 `<script>` 로드 순서를 바꾸지 않는다.** `works.js` → `core.js` → 나머지 → `events.js`(루프 시작).
- 작업물 추가/수정은 `site/js/works.js` 배열만 편집하면 메인 갤러리와 PDF 양쪽에 반영된다.
- 다크/라이트 양쪽을 지원한다. 색은 `site/css/style.css` 상단 토큰과 `site/js/core.js`의 `isLight` 분기를 함께 확인.
- 주석은 한국어로 작성되어 있다. 기존 스타일(간결한 한국어 설명, 구분선 배너)을 따른다.
- 배포는 `main`에 push하면 자동 (`site/**` 변경 시 `deploy.yml`). 별도 빌드 단계 없음.
