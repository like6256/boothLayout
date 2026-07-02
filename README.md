# 부스 플래너 (Booth Planner)

행사 부스 배치도를 만드는 전용 웹 툴입니다. Adobe Illustrator로 하던 부스 배치 작업을
브라우저에서 훨씬 빠르고 간단하게 할 수 있습니다.

- 실제 치수(mm/cm/m) 기반 — 부스 크기를 입력하면 비율이 정확합니다
- 책상 위에 진열대/뽑기통/POP를 올리면 **책상을 움직일 때 함께 이동** (부모-자식 구조)
- PNG / SVG / PDF 내보내기 (SVG·PDF는 실척 mm 단위)
- 자동 저장 + 최근 프로젝트 + 즐겨찾기 프리셋

## 실행 방법

Node.js 18 이상이 필요합니다. (개발은 Node 22에서 확인)

```bash
# 1. 의존성 설치 (최초 1회)
npm install

# 2. 개발 서버 실행
npm run dev
# → 브라우저에서 http://localhost:5173 접속
```

배포용 빌드:

```bash
npm run build      # dist/ 폴더에 정적 파일 생성
npm run preview    # 빌드 결과 로컬 확인 (http://localhost:4173)
```

`dist/` 폴더는 어떤 정적 웹 서버에나 올릴 수 있고, 사내 공유 폴더 + 간단한 서버로도 배포 가능합니다.

## 주요 기능

| 기능 | 사용법 |
|---|---|
| 부스 생성 | 툴바 "부스 크기" 또는 "새로 만들기" — 2×2m, 3×3m 등 프리셋 또는 자유 입력 |
| 기물 추가 | 왼쪽 팔레트 클릭 (책상, 아크릴 진열대, 뽑기통, 의자, 배너, 선반, 박스, POP, 상품, 원탁, 사각형, 원형) |
| 이동/회전/크기 | 드래그 / 선택 후 회전 핸들 / 모서리 핸들 또는 속성 패널에 숫자 입력 |
| 부모-자식 (얹기) | 기물을 책상 위로 드래그해서 놓으면 자동으로 얹힘 → 책상 이동 시 함께 이동. 얹힌 기물만 따로 끌어낼 수도 있음. 툴바 "자동 얹기"로 on/off |
| 다중 선택 | Shift+클릭 또는 빈 곳에서 드래그(마퀴) |
| 그룹 | Ctrl+G / 해제 Ctrl+Shift+G |
| 레이어 | 오른쪽 하단 패널 — 숨기기(👁), 잠금(🔒), 순서(⤒▲▼⤓), 더블클릭으로 이름 변경 |
| 정렬/균등 배치 | 2개 이상 선택 → 속성 패널의 정렬 버튼 |
| 그리드/스냅 | 툴바 토글, 간격 선택 (10~500mm) |
| 스마트 가이드 | 드래그 중 다른 기물 가장자리/중심에 자동 정렬 (분홍 점선) |
| 저장/열기 | Ctrl+S → `.booth.json` 파일 다운로드 / Ctrl+O로 열기. 작업 내용은 브라우저에 자동 저장됨 |
| 내보내기 | 툴바 "내보내기" → PNG / SVG / PDF |
| 즐겨찾기 | 기물(하위 포함) 선택 → 속성 패널 "★ 즐겨찾기" → 팔레트에서 재사용 |
| 다크 모드 | 툴바 ☾ 버튼 |

## 단축키

| 키 | 동작 |
|---|---|
| 휠 | 확대/축소 (마우스 위치 기준) |
| Space+드래그, 가운데 버튼 드래그 | 화면 이동 |
| V / H | 선택 도구 / 이동 도구 |
| Ctrl+Z / Ctrl+Shift+Z (또는 Ctrl+Y) | 실행 취소 / 다시 실행 |
| Ctrl+C / Ctrl+V / Ctrl+D | 복사 / 붙여넣기 / 복제 |
| Ctrl+A | 전체 선택 |
| Ctrl+G / Ctrl+Shift+G | 그룹 / 그룹 해제 |
| Delete / Backspace | 삭제 |
| 방향키 (+Shift) | 미세 이동 (5배 크게) |
| [ / ] | 뒤로 / 앞으로 (z순서) |
| Ctrl+0 | 화면에 맞추기 |
| Ctrl+S / Ctrl+O | 저장 / 열기 |
| Esc | 선택 해제 |

## 기술 구조

- **Vite + React 18 + TypeScript** — 빠른 개발/빌드, 타입 안정성
- **Konva (react-konva)** — 캔버스 렌더링. 기물의 부모-자식 구조를 Konva 그룹 중첩으로
  직접 표현해서 "책상 위 기물 동반 이동"이 렌더링 레벨에서 자연스럽게 동작
- **Zustand + zundo** — 상태 관리 + Undo/Redo (문서 상태만 히스토리에 기록)
- **jsPDF** — PDF 내보내기 (SVG → PNG 래스터 → 실척 mm 페이지)

### 좌표 규약

- 내부 단위는 항상 **mm**, 화면 단위 변환은 표시 시점에만
- `Item.x/y`는 기물 **중심** 좌표. 루트 기물은 월드 좌표, 자식 기물은 부모의
  회전 전 좌상단 원점 기준 로컬 좌표
- `rotation`은 부모 기준 상대각 → 절대각 = 조상 회전의 합

### 폴더 구조

```
src/
  types.ts            핵심 타입 (Item, ProjectDoc, …)
  presets.ts          기물 카탈로그 — 새 기물은 여기 한 줄만 추가
  store/store.ts      zustand 스토어 (문서 + UI 상태 + 모든 액션)
  utils/
    geometry.ts       좌표 변환, AABB, 히트 테스트, 드롭 대상 탐색
    guides.ts         스마트 가이드 계산
    export.ts         SVG/PNG/PDF 내보내기
    persist.ts        파일 저장/열기, localStorage(자동저장·최근·즐겨찾기)
    units.ts, id.ts   단위 변환, id 생성
  components/
    CanvasStage.tsx   Konva 스테이지 (팬/줌/마퀴/Transformer)
    ObjectNode.tsx    기물 렌더러 (재귀) + 드래그/스냅/자동 얹기
    GridLayer.tsx     그리드 + 부스 외곽선
    Minimap.tsx       미니맵
    Toolbar/Palette/Inspector/LayersPanel/StatusBar/BoothDialog
  hooks/useShortcuts.ts  전역 단축키 (한글 IME 대응: e.code 기준)
```

### 새 기물 추가하기

`src/presets.ts`의 `CATALOG` 배열에 한 줄 추가하면 팔레트에 자동 반영됩니다:

```ts
{ key: 'fridge', label: '냉장고', shape: 'rect', w: 600, h: 700, color: '#a7c7e7' },
```
