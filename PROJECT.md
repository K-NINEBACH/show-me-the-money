# 내 돈 챙겨줘 — 프로젝트 인수인계 문서

개인 가계부 PWA. 급여 후 과소비 방지가 목적. 서버 없이 브라우저 localStorage에만 저장.

---

## 1. 기술 스택 / 실행

- React 18 + Vite 5, 런타임 의존성은 `lucide-react`(아이콘)뿐. **차트 라이브러리 없음**(recharts 제거됨)
- 빌드 전용(devDependencies)으로 `vite-plugin-pwa`가 있음 — 2026-08-23에 서비스워커
  오프라인 프리캐시용으로 추가(아래 "체감 속도 최적화" 참고). 브라우저로 나가는 코드에는
  전혀 안 실림, `npm run build`할 때만 관여함.
- 스타일링 라이브러리 없이 **인라인 style 객체만** 사용
- **2026-08-21 정리**: 혼자 쓰는 개인용 도구로 확정하면서 안 쓰던 기능(PIN 잠금·휴지통 복원·카테고리별 예산)을 걷어내고, 단일 2,800줄 `App.jsx`를 화면/로직별 여러 파일로 분리했음. `git log`에서 그 커밋 메시지로 찾아보면 변경 배경이 나옴.

```
npm install
npm run dev      # 개발
npm run build    # 배포 빌드 → dist/
```

### 파일 구조
```
passbook-app/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── manifest.webmanifest   # PWA 설정 (앱 이름/아이콘/테마색)
│   ├── sw.js                  # 서비스워커 소스 (빌드 시 vite-plugin-pwa가 dist/sw.js로
│   │                            변환 — public/sw.js를 직접 배포하는 게 아님, 아래 참고)
│   └── icons/icon-192.png, icon-512.png
└── src/
    ├── main.jsx
    ├── App.jsx                 # 셸: 로딩/온보딩/월마감 게이트 + 하단 탭 라우팅 + ctx 계산
    ├── lib/
    │   ├── constants.js         # STORAGE_KEY, PALETTE, QUICK_AMOUNTS (의존성 없음)
    │   ├── theme.js              # THEMES, useTheme, F, paperCard/inputSty/primaryBtn
    │   └── data.js                # defaultData, migrate, 날짜·금액 유틸, fixedInfo 등 (React 없음)
    ├── components/
    │   ├── common.jsx            # MoneyInput, Field, SectionLabel, NavBtn 등 여러 화면 공용 조각
    │   └── ErrorBoundary.jsx
    └── screens/
        ├── Gates.jsx              # Onboarding, MonthWrapUp (탭 밖의 전체화면)
        ├── Home.jsx, Add.jsx, Ledger.jsx, Calendar.jsx, Settings.jsx
```
화면을 고칠 땐 대부분 `screens/` 안의 해당 파일만 보면 됨. 여러 화면이 같이 걸리는 계산(카드값·예산 등)은 `App.jsx`의 `ctx` 구성부에 있음.

### 2026-08-23: 체감 속도 최적화
사용자가 "가볍다고 느껴지게" 요청해서 세 군데를 고침 — 전부 기능은 그대로, 속도만:
- **서비스워커(`public/sw.js`) 캐시 전략 교체**: 예전엔 모든 요청이 네트워크 우선이라, 내용이
  안 바뀐 JS 파일(Vite가 내보내는 `/assets/*.js`는 파일명 자체에 콘텐츠 해시가 붙어서
  내용이 같으면 파일명도 항상 같음)도 앱을 켤 때마다 매번 새로 받아왔음. 이제 해시 붙은
  `/assets/` 파일은 **캐시 우선**(있으면 즉시 응답, 네트워크 요청은 백그라운드로만) —
  체감 실행속도에 가장 크게 기여하는 변경. 캐시 이름도 v1→v2로 올리면서 `activate`에서
  옛 버전 캐시를 지우게 함 — v1은 한 번도 정리된 적이 없어서 배포할 때마다 이전 해시
  파일들이 계속 쌓이고만 있었음.
- **구글폰트 로딩 위치 이동**: 예전엔 `GoogleFonts` 컴포넌트가 React 마운트 후에
  `<style>`로 `@import`를 주입해서, 폰트 요청 자체가 JS 실행 이후로 밀렸음. `index.html`
  `<head>`에 `<link rel="preconnect">` + `<link rel="stylesheet">`로 옮겨서 HTML 파싱
  시점부터 바로 요청이 나가게 함. 전역 리셋 CSS(`box-sizing`, 스크롤바 숨김 등)도 같이
  옮기면서 `GoogleFonts` 컴포넌트 자체를 삭제(3곳에서 호출하던 것 정리).
- **자주 안 쓰는 화면 코드분할(`React.lazy`)**: 홈/기록/내역(매일 쓰는 3탭)은 그대로
  즉시 로드하고, 온보딩·월마감(`Gates.jsx`)·달력·설정은 `React.lazy` + `Suspense`로
  분리. 매일 실제로 켜서 쓰는 경로의 초기 번들이 252KB(gzip 74.9KB) →
  227KB(gzip 69.2KB)로 줄었고, 달력·설정은 별도 청크(각 6~12KB)로 빠져서 처음 그
  탭에 들어갈 때만 받아옴 — 서비스워커가 캐시해두니 그 다음부턴 이 지연도 없음.
  Playwright로 온보딩→탭 5개 전체 클릭까지 직접 구동해서 콘솔 에러·실패한 요청
  없음을 확인함.
- **폰트 굵기를 실제 사용처에 맞춤**: `index.html`의 구글폰트 URL이 실제로는 안 쓰는
  굵기를 받고 있었음 — Noto Serif KR은 코드 전체에서 거의 다 `fontWeight: 700`으로만
  쓰는데 500도 같이 받고 있었고(유일하게 굵기 명시 없던 `MonthWrapUp` 라벨은 700으로
  통일함), IBM Plex Mono(금액 숫자)는 반대로 700이 훨씬 많이 쓰이는데 500·600만 받고
  있어서 그 자리들이 살짝 더 얇은 굵기로 대체 렌더링되고 있었음. `wght@700` /
  `wght@600;700`으로 정리해서 안 쓰는 굵기 파일은 안 받고, 숫자는 코드에 적힌 굵기
  그대로 나오게 함.
- **서비스워커 설치 시점 프리캐시(`vite-plugin-pwa`, injectManifest 방식)**: 위 캐시
  전략 개선까지는 "한 번 방문해야 캐시됨" 구조라, 오프라인으로 처음 켜거나 아직 한
  번도 안 들어가본 탭(달력·설정처럼 lazy 분리된 것들)은 캐시가 없어서 못 떴음. Vite가
  빌드마다 파일명 해시를 바꾸는 탓에 `public/sw.js`에 정적으로 목록을 못 넣었는데,
  `vite-plugin-pwa`를 `strategies: "injectManifest"`로 붙여서 **빌드 시점에** 그 목록을
  `public/sw.js` 안 `self.__WB_MANIFEST` 자리에 자동으로 채워 넣게 함(`vite.config.js`).
  `manifest.webmanifest`는 원래 손으로 관리하던 것 그대로 두려고 `manifest: false`로
  플러그인이 손 안 대게 막았고, 서비스워커 등록도 `main.jsx`에서 이미 직접 하고
  있어서(`{type:"module"}` 없는 옛날 방식) `injectRegister: false` + `rollupFormat: "iife"`로
  번들 결과물이 계속 클래식 스크립트로 나오게 함. `precacheAndRoute`/`cleanupOutdatedCaches`
  (workbox-precaching)가 캐시 이름 버전 관리·정리까지 대신 해줘서, 위에서 손으로 하던
  `v1→v2` 버전 올리기 같은 관리가 이제 필요 없음. precache 목록에 없는 요청(예:
  `manifest.webmanifest`)만 `public/sw.js`의 남은 커스텀 `fetch` 핸들러가 처리.
  **검증**: `npm run build` → `vite preview`로 실제 프로덕션 빌드를 띄우고, Playwright로
  첫 방문(온라인) 후 `context.setOffline(true)`로 네트워크를 완전히 끊은 채 새로고침 →
  홈 화면 정상 렌더링 + 아직 한 번도 안 들어가본 달력·설정 탭까지 오프라인 상태로 정상
  클릭됨을 확인(콘솔 에러 없음).

### 2026-08-24: 추가 버그 훑기 + 기록 화면 실용성 개선
사용자가 "토큰 많이 써도 되니 오류·버그 잡아서 개선 + 더 심플/컴팩트하게 쓸 수 있는
방식 있으면 적용" 요청. 이번엔 `persist(` 호출을 전부 훑어서 "삭제/덮어쓰기인데 확인창이
없는 곳"을 체계적으로 찾는 방식으로 진행함.
- **`doImport`(설정 → 데이터 가져오기)에 확인창이 아예 없었음** — 앱에서 제일 되돌리기
  어려운 동작(지금 데이터를 통째로 덮어씀)인데, 카드/통장/카테고리 삭제는 전부 confirm이
  있으면서 여기만 빠져 있었음. 확인창 추가(가져올 지출 건수도 같이 보여줌) + 가져오기
  성공 후 `spendingGoalInput`이 마운트 시점 값에 멈춰있던 것도 같이 고침(새로 가져온
  목표 지출액을 입력창에 바로 반영).
- **내역 수정 폼을 연 채로 기간/카테고리 필터를 바꾸면**, 그 항목이 목록에서 잠깐
  사라졌다가 필터를 되돌렸을 때 `editingId`가 그대로 남아있어서 수정 폼이 예고 없이
  다시 열려 있는 것처럼 보였음 — 필터(`timeScope`/`category`/`search`)가 바뀌면
  `editingId`를 자동으로 닫게 함.
- **`autoProcessFixed`가 같은 달 자동이체 대상을 한 번에 여러 개 처리할 때** 전부
  `Date.now()`가 같은 밀리초라 랜덤 접미사만으론 드물게 `id`가 겹칠 수 있었음 —
  루프 인덱스를 타임스탬프에 직접 더해서 항상 겹치지 않게 함(`createdTime()`이 id의
  숫자를 그대로 이어붙여 정렬 기준으로 쓰기 때문에, 구분자를 붙이는 대신 자릿수를
  유지하는 방식으로 함 — 안 그러면 Number.MAX_SAFE_INTEGER를 넘어 최신순 정렬이 깨짐).
- **PWA를 백그라운드에 오래 두고 자정을 넘겨서 돌아오는 경우**(모바일에서 흔함),
  `today`/`curKey` 같은 값들이 마지막 렌더링 시점에 멈춰있어서 "오늘 지출"·며칠차
  표시가 어제 기준으로 보이고, 달이 바뀌었으면 월마감 화면도 안 떴음 — `visibilitychange`/
  `focus` 이벤트로 화면에 돌아올 때마다 강제로 한 번 더 렌더링해서 날짜 관련 값이 항상
  다시 계산되게 함(`App.jsx`).
- **기록(할부/고정지출) 폼도 최근 사용 카드/통장을 기본값으로**: 메인 지출 입력엔 이미
  있던 "최근 쓴 카드/카테고리 기억" 기능을, `InstallmentForm`에도 `findRecentFixedDefaults`로
  똑같이 적용 — 두 번째·세 번째 고정지출을 등록할 때도 매번 첫 카드/첫 통장부터 다시
  고를 필요 없음.
- **카드가 하나도 없으면(온보딩에서 "안 써요" 선택) 기록 화면의 "카드" 버튼 자체를
  숨김** — 예전엔 눌러도 빈 셀렉트+경고문구만 뜨고 등록이 막히는 막다른 버튼이었음.
  기본 결제수단도 카드가 없으면 "현금"으로 시작하게 바꿈. 이제 막다른 골목이 된
  경고문구도 같이 정리(죽은 코드 제거).

검증: Playwright로 카드 없이 온보딩 → 기록 화면(카드 버튼 없음 확인) → 설정에서 카드
추가 → 기록 화면(카드 버튼 다시 나타남 확인) → 데이터 내보내기/가져오기(확인창 문구
확인) → 내역 수정 폼 열고 필터 전체↔이번달 왔다갔다(자동으로 닫히는지 확인)까지 전부
직접 구동, 콘솔 에러 없음. 프로덕션 빌드 기준 오프라인 회귀 테스트도 다시 통과.

### 배포
GitHub 저장소 최상단에 폴더 안 파일들을 올리고 → Vercel "Add New Project" → Vite 자동 인식 → Deploy.
**재배포는 반드시 같은 프로젝트/같은 도메인으로.** localStorage는 도메인에 묶여 있어서 주소가 바뀌면 기존 데이터가 전부 날아감.

---

## 2. 가장 중요한 규칙 (반드시 지킬 것)

### STORAGE_KEY 고정
```js
const STORAGE_KEY = "passbook-data-v4";
```
**절대 바꾸지 말 것.** 바꾸면 실사용자 데이터가 전부 사라짐.

### migrate() 유지
`migrate(raw)` 함수가 구버전 데이터 구조를 자동 변환함 (`light` 테마 → `beige`, `cardBill` → `cards[]`, `account` → `accounts[]`, `salary` → `spendingGoal` 등).
데이터 구조를 바꿀 때는 **반드시 migrate에 변환 로직을 추가**해야 기존 사용자가 깨지지 않음.

### 실사용 중
개발자 본인이 실제로 매일 쓰고 있고 지인 공유 예정. 데이터 손실 위험이 있는 변경은 신중히.

---

## 3. 데이터 모델 (defaultData)

```js
{
  theme: "dark",              // THEMES 키 (6종)
  onboarded: false,           // 온보딩 완료 여부
  lastSeenMonth: null,        // 월 마감 요약 표시 기준 (예: "2026-07")
  spendingGoal: 0,            // 이번 달 목표 지출액
  accounts: [{ id, name, initialBalance }],        // 통장(다중)
  cards:    [{ id, name, bill }],                  // 카드(다중). bill = 일시불 누적분
  categories: [{ id, name, color }],
  expenses: [...],
  fixedExpenses: [...],
  balanceEntries: [...],
}
```
`pinLock`·`trash`·카테고리 `budget` 필드는 2026-08-21에 제거됨. `migrate()`가 옛 백업에 남아있어도 조용히 지움 — 다시 쓰지 말 것.

### expenses[] (지출)
```js
{
  id, amount, categoryId, date, memo,
  paymentMethod: "card" | "cash",
  cardId,                    // 카드 결제 시
  linkedBalanceId,           // 현금(통장) 결제 시 생성된 balanceEntry id
  isReceivable,              // 대리결제(추후 정산) 여부 — 2026-08-21부터 새로 안 만듦(레거시 전용, 아래 참고)
  settled, repaidAmount, settledAt,
  settlementCardDelta, settlementCardId, settlementBalanceId,  // 정산 시 되돌리기용 (레거시)
  linkedTransitMonth,        // 대중교통 누적 항목 표시 (예: "2026-07")
  isCardAdjustment,          // 카드값에 흔적 남기기용(2026-08-21). "카드반영"/카드값 수동
                              // 추가로 생긴 항목 표시. cardSpentThisCycle 집계에서는 제외
                              // (fixedSumAll이 이미 매달 반영하고 있어서 이중계산 방지)
  reimbursedAmount, reimbursedAt, reimbursementBalanceId,  // 2026-08-21 신규: 대리결제를
                              // isReceivable 없이 평범한 지출로 기록하고, 나중에 내역에서
                              // "정산받음"으로 표시할 때 씀. 원래 지출 금액은 안 건드리고
                              // 받은 돈만 balanceEntries에 순수 입금(type:"in")으로 남김
}
```

### fixedExpenses[] (고정지출/할부)
```js
{
  id, name, baseAmount,
  totalMonths,               // 0이면 매달 반복, 1 이상이면 할부
  startInstallment,          // 등록 시점의 회차
  setupMonthKey,             // 등록한 달
  overrides: { "2026-07": 55000 },   // 특정 달만 금액 다르게
  paymentMethod: "card" | "cash",
  cardId, accountId,
  paidMonths: { "2026-07": entryId | true },  // 출금/카드반영 처리 여부
  autoPayDay,                // 통장형 자동 출금처리 날짜 (1~31, null이면 수동)
}
```

### balanceEntries[] (통장 입출금)
```js
{
  id, accountId, type: "in" | "out", amount, date, memo,
  linkedFixedId, linkedFixedMonth,   // 고정지출 출금처리로 생성된 경우
  isAdjustment,                       // 잔액 스냅으로 생성된 조정 기록
  transferId,                         // 통장 간 이체 (같은 id를 가진 out/in 한 쌍)
}
```

---

## 4. 핵심 도메인 로직 (⚠️ 여기가 제일 헷갈리는 부분)

### 고정지출 3분류 — 자동 반영 여부가 다름

| 분류 | 조건 | 카드값/예산 반영 |
|---|---|---|
| 통장형 | `paymentMethod === "cash"` | 예산엔 자동 포함. 통장 출금은 **수동 "출금처리"** 또는 `autoPayDay` 자동 |
| 카드 할부 | `paymentMethod === "card"` && `totalMonths > 0` | **자동으로 카드값에 포함** (`cardTotals.fixedPortion`) |
| 카드 매달반복 | `paymentMethod === "card"` && `totalMonths === 0` | 자동 반영 **안 함**. 홈에서 **"카드반영"** 버튼 눌러야 카드값에 더해짐 |

> 카드 매달반복(휴대폰요금·유튜브·쿠팡멤버십 등)을 자동 반영하지 않는 이유: 결제일이 제각각이라 카드 앱 기준으로 실시간 대조할 때 오차가 생겼기 때문.

### 카드 금액 2층 구조
```js
cardTotals = cards.map(c => ({
  ...c,
  fixedPortion,                  // 이번 달 할부분 (자동 계산, 저장 안 됨)
  total: c.bill + fixedPortion,  // 화면에 보이는 금액
}))
```
- `c.bill` = 일시불/직접등록분 **누적 저장값**
- `fixedPortion` = 매달 다시 계산되는 값, 저장하지 않음
- **`reconcileCard`(맞추기)**: 사용자는 카드 앱의 **할부 포함 총액**을 입력 → 내부에서 `fixedPortion`을 빼고 `bill`에 저장. (이거 안 하면 이중계산 버그)
- **`payCard`(결제하기)**: 통장에서 `bill + fixedPortion` **전액** 출금, `bill`만 0으로 리셋. 할부는 다음 달 자동으로 다시 계산됨.

### 예산 계산 2종
```js
spent          = normalSpent + fixedSum + cardBillTotal
remaining      = spendingGoal - spent            // ★ 홈 원형게이지 메인값
processedSpent = spent - unpaidFixedSum
realRemaining  = spendingGoal - processedSpent   // 서브 "반영 전 여유"
```
- **메인 = `remaining`**: 아직 출금처리 안 했어도 전부 미리 반영한 "이번 달 운용 가능"
- **서브 = `realRemaining`**: 미처리분을 뺀 값. UI 표기는 **"반영 전 여유"** (예전 "실제 여유"는 오해 소지가 있어 변경됨)

### fixedSum vs fixedSumAll
- `fixedSum` = 통장형 + **아직 카드반영 안 한** 카드매달반복 (예산 계산용. 카드할부는 `cardBillTotal`에 이미 포함되므로, 카드매달반복은 반영되는 순간 `cardBillTotal`로 넘어가므로 각각 **중복 방지**)
  - 2026-08-21 수정: 카드반영을 누른 뒤에도 `fixedSum`이 계속 그 항목을 잡고 있어서 `spent`가 이중계산되던 버그를 고침. `fixedCardRecurringUnpaid`(=`paidMonths[curKey]` 없는 것만) 기준으로 바뀜.
- `fixedSumAll` = 전부, 반영 여부 무관 (화면 표시용 — 여긴 원래도 이중계산 없었음)

### ctx 객체
`App()`에서 모든 파생값을 계산해 `ctx` 하나로 만들어 자식 컴포넌트에 통째로 내려줌. 상태관리 라이브러리 없음.

---

## 5. 화면 구성

하단 탭 5개: **홈 / 기록 / 내역 / 달력 / 설정**

### 홈 (`HomeView`)
- 통장 잔액 카드(초록 테두리 = "실제 돈") — 다중 계좌면 탭해서 펼침, 입금/출금/**이체**, 실제 잔액 스냅
- 미처리 고정지출 배지
- 구분선 + 여백으로 시각 분리
- 원형 게이지(골드 = "계획") — 메인 `remaining`, 서브 "미처리 N원 · 반영 전 여유 N원"
- 월 요약 → 지출 현황(고정지출/현금지출) → 카드별 블록(맞추기·결제하기) → 대중교통 빠른입력 → **예산 관리(접기/펼치기)**
- 최근 기록 섹션은 **삭제됨** (내역과 중복이라)

### 기록 (`AddView`)
결제수단 3종: **카드 / 현금(통장) / 할부(고정지출)**
- 할부 선택 시 `InstallmentForm` 표시 (등록·수정·정렬)
- 금액은 `MoneyInput` (실시간 천단위 콤마 + "원")
- **결제 문자 붙여넣기 파싱** 버튼
- 대리결제 체크박스 **없음** (2026-08-21에 제거) — 대신 내준 돈도 그냥 평범하게 카드/현금
  지출로 기록. 나중에 돌려받으면 내역에서 "정산받음"으로 표시 (아래 `LedgerView` 참고)
- 2026-08-22: 카테고리·카드·통장 선택을 칩 버튼 → **셀렉트**로 컴팩트화(같은 줄에 카테고리+
  카드/통장). "+ 새 카테고리"는 셀렉트 맨 아래 옵션으로 흡수. `InstallmentForm`의 카드/통장
  선택도 동일. 빠른금액 버튼(`QuickAmountButtons`)은 그대로 둠 — 새로 기록할 땐 실제로
  빠르게 누르는 용도라 컴팩트화 대상에서 제외(수정 폼과는 다른 판단)

### 내역 (`LedgerView`) — 2026-08-21에 시간범위×카테고리 2축 구조로 재설계
- **시간범위** (`timeScope`): 이번달 / 전체 / 기간 — 항상 상단 탭 3개
- **카테고리** (`category`): 전체 흐름(기본값) / 카드 / 대리결제 / 입출금 — "더보기" 드롭다운
- 두 축이 독립이라 "이번달만 대리결제" "전체 기간 입출금"처럼 아무 조합이나 가능
- `category === "all"`이면 지출·대리결제·입출금 **셋을 한 목록에 시간순으로 섞어서** 보여줌
  (`combined` 배열, `kind: "expense" | "receivable" | "balance"`로 구분해 각각
  `LedgerRow`/`ReceivableRow`/`BalanceRow`로 렌더링)
- 대리결제는 어느 카테고리에서 보든 정산상태 태그가 항상 붙음: 미정산 / 정산완료 /
  부족분 N원 카드값 / 초과분 N원 통장
- `category === "card"`일 때의 합계(`cardListTotal`)는 대리결제 원금 전체가 아니라
  **정산 부족분만** 더함 — 실제 `card.bill` 구성과 일치시키기 위함. 카드로 결제한
  대리결제 자체는 목록에 그대로 보이되(원금 표시), 합계엔 부족분만 반영
- 정렬: **최신순(등록 시각 기준)/높은금액순/낮은금액순** — 날짜 그룹핑 없이 평면 리스트
- 지출 수정(연필) — 수정 시 카드값/통장 즉시 반영
- 대리결제(레거시, `isReceivable`)는 **미정산일 때만** 연필 버튼으로 그 자리에서 바로 정산(`settleReceivable`, Home.jsx에서 import) — 정산 끝나면 연필 사라지고 상태 태그로 바뀜. 정산완료 후엔 수정 UI 없음(다시 고치려면 삭제 후 재등록)
- 입출금은 삭제만 가능(수정 UI 없음)
- **일반 지출(카드/현금)의 정산받음**: `renderEditForm` 안에 "정산" 섹션이 따로 있음.
  `reimbursedAmount`가 없으면 "미리정산하기" 버튼 하나만 보이다가(`reimburseOpen` 상태로
  접힘/펼침) 누르면 입력폼(받은 금액 → `confirmReimburse`), 있으면 "정산받음 N원 · 취소"
  (`cancelReimburse`)로 바뀜. 원래 지출 금액·카드값/통장 차감은 안 건드리고, 받은 돈만
  `balanceEntries`에 순수 입금으로 추가 — 부족분/초과분 나눌 필요 없음(레거시
  `settleReceivable`과 다른 점). 목록 줄에는 "정산받음 N원" 태그로 표시(`LedgerRow`).
  삭제 시 연결된 입금 기록도 같이 삭제됨(`remove()`에서 `reimbursementBalanceId` 처리)
- 2026-08-22: 수정 폼(`renderEditForm`) 컴팩트하게 정리 — 카테고리/카드/통장 칩버튼 →
  셀렉트, 빠른금액 버튼 제거, 날짜+메모 한 줄. 삭제는 풀버튼 대신 휴지통 아이콘만
- 삭제는 **되돌릴 수 없음** — `window.confirm()` 한 번만 물어보고 바로 지움 (2026-08-21에 21일 휴지통 보관 기능을 걷어냄)

### 달력 (`CalendarView`)
일별 지출 합계, 히트맵(빨강 농도), 입금일 초록점, 최고지출일 금테두리, 지난달 대비 배지, 날짜 클릭 시 그날 내역

### 설정 (`SettingsView`)
섹션: 화면(테마 6종 3×2) / 예산 / 계좌·카드 / 카테고리(목록·삭제만) / 데이터(JSON 백업·복원)

### 게이트 화면 (순서대로)
1. `Onboarding` — 8단계, 테마 실시간 미리보기 (`!data.onboarded`)
2. `MonthWrapUp` — 달이 바뀌면 지난달 요약 후 넘어가기

---

## 6. 테마 시스템

`THEMES` 객체에 6종(검정·베이지·흰색·청록·파랑·초록, 2026-08-21에 15종에서 추림). 각 테마는 동일한 키 세트를 가짐:
```js
{ id, label, swatch, mode, bg, bg2, navBg, paper, paperLine,
  ink, cream, gold, goldSoft, good, warn, danger, muted, border }
```
`THEME_ORDER`로 표시 순서 관리. `dark`만 `mode: "dark"`, 나머지는 전부 light 계열.
`useTheme()` 훅으로 어디서든 `T` 접근. **하드코딩 색상 쓰지 말고 반드시 `T.xxx` 사용.**

의미 구분: **초록(`T.good`) = 실제 돈 / 골드(`T.gold`) = 계획·목표**

---

## 7. 완료된 기능 요약

- 다중 통장·다중 카드, 통장 간 이체(양쪽 자동 기록, 삭제 시 쌍으로 삭제)
- 고정지출/할부 (할부 회차 자동 진행, 월별 금액 오버라이드, 같은 유형 내 카드↔카드·통장↔통장 재지정)
- 대신 내준 돈 정산받기 — **2026-08-21부터 새 방식**: 그냥 평범한 지출로 기록하고, 내역에서
  그 지출 수정 → "정산받음"에 받은 금액 입력 → 순수 입금으로 기록(`confirmReimburse`).
  구버전 `isReceivable` 방식(대리결제 체크 → 홈/내역에서 부족분→카드값·초과분→통장 자동
  반영, `settleReceivable`)은 레거시 데이터 호환용으로 남아있고 계속 동작함
- 잔액·카드값 스냅(맞추기), 고정지출 자동 출금처리(`autoPayDay`), 미처리 배지
- 대중교통비 빠른입력 — **누적 금액 갱신 방식**(더하지 않고 교체)
- 결제 문자 파싱(`parsePaymentText`) — 현대카드로 검증됨. "누적" 금액·마스킹 이름(`*`) 제외, 날짜 이후 단어를 가맹점명 우선
- JSON 백업/복원, 온보딩, 월 마감 요약
- 렌더링 중 에러가 나도 흰 화면 대신 안내+새로고침을 보여주는 `ErrorBoundary`

### 2026-08-22: 앱 전체 칩버튼 → 셀렉트 정리
카테고리/카드/통장처럼 "여럿 중 하나 고르기"는 전부 `<select>`로 통일(기록·수정·
할부·홈의 대중교통/입출금/이체 등). 예외적으로 남겨둔 것:
- **결제수단(카드/현금/할부) 같은 화면 전환용 3-way 버튼**은 그대로 — 값이 아니라
  모드를 바꾸는 것이라 셀렉트로 옮기지 않음
- **빠른금액 버튼(`QuickAmountButtons`)**은 기록·통장/카드 신규등록처럼 "빠르게 새로
  입력"하는 곳엔 남기고, 수정·조정처럼 "이미 있는 값 고치는" 곳에서만 뺌
- 설정 화면의 "카드값 수동 추가/초기화"는 별도 섹션을 없애고 "카드 관리" 목록 각
  줄의 "조정" 버튼으로 흡수(카드 정보가 두 군데 흩어져 있던 걸 한 곳으로)

---

## 8. 남은 작업 / 알려진 제약

### PENDING
- **기록 속도 개선** — "자주 쓰는 카테고리/카드 기본값"은 2026-08-22에 완료(`findRecentDefaults`,
  최근 지출 기준 자동). "즐겨찾기 원터치 재등록"은 아직 미착수
- ~~할부 종료 알림~~ — 2026-08-22 완료. `fixedInfo()`가 `isLast` 반환, 표시되는 3곳(홈/기록/내역)에 "마지막" 배지
- **다른 카드사/은행 문자 파싱** — 현대카드만 검증. 실제 케이스 나오면 그때 다듬기로 함

### 구조적 제약 (해결 불가)
- **푸시 알림 불가** — 웹앱이라 "오늘 기록 안 하셨어요" 같은 리마인드 못 보냄
- **알림 자동 캐치 불가** — 네이티브(안드로이드 Kotlin + NotificationListenerService + 서버/DB)가 필요하고 iOS는 원천 불가. 그래서 **붙여넣기 반자동**으로 대체함
- **데이터가 기기 안에만 존재** — 브라우저 데이터 삭제하면 복구 불가. 백업 안내 필요

### 과거 버그 (수정 완료, 재발 주의)
- 정산된 대리결제 삭제 시 카드값이 안 빠지던 버그 → `settlementCardDelta` 등을 지출에 저장해 되돌림
- 카드 맞추기 이중계산 → `reconcileCard`에서 `fixedPortion` 차감
- 결제하기가 일시불만 출금하던 버그 → `bill + fixedPortion` 전액 출금으로 수정
- 문자 파싱이 "누적" 금액·마스킹 이름을 메모에 넣던 버그

### 2026-08-22~23: 전체 코드 훑기 — "삭제된 카드/통장을 계속 참조" 버그 계열
사용자 요청("1부터 100까지 전부다 확인")으로 전체를 다시 훑으면서, 카드/통장을 삭제한
뒤에도 다른 데이터가 그 id를 계속 들고 있어서 생기는 같은 패턴의 버그를 여러 곳에서
발견·수정함. 공통 패턴: `f.cardId || data.cards[0]?.id` 처럼 **falsy만 걸러내는 폴백은
"삭제된 카드의 id"(truthy)를 못 잡아낸다** — 그러면 실제로는 아무 카드/통장도 안
바뀌었는데 성공 토스트만 뜨는 조용한 실패가 생김. 고친 곳:
- `fixedSum`이 "카드반영" 누른 뒤에도 그 항목을 이중으로 잡던 버그 (App.jsx)
- `autoProcessFixed`의 `autoPayDay=31`이 30일 이하 달엔 영원히 안 걸리던 버그, `aid` 유효성 (lib/data.js)
- `TransitQuickAdd`/`markFixedPaid`/Ledger `startEdit`/Add `findRecentDefaults` — 삭제된
  카드·통장을 기본값으로 들고 있던 것들에 `data.cards.some(...)` 검증 추가
- `removeBalance`가 연결된 `fixedExpenses[].paidMonths` 마커를 안 지우던 것
- `isCardAdjustment` 지출을 수정할 때 결제수단/카드를 바꿀 수 있어서 원본 고정지출
  마커와 어긋날 수 있던 것 → 수정 폼에서 그 필드들 비활성화
- **`settleReceivable`의 `settlementCardId`**(Home.jsx) — 대리결제 원래 카드가 삭제된
  상태로 부족분 정산하면 어느 카드값에도 안 반영되면서 "카드값에 반영됐어요" 토스트만
  뜨던 것
- **`removeCard`가 `fixedExpenses`를 안 건드리던 것**(Settings.jsx) — 할부/카드매달반복이
  삭제된 카드를 계속 가리키면 `cardTotals.fixedPortion` 집계에서 안 잡혀서 그 금액이
  예산 계산(`spent`)에서 통째로 조용히 빠짐. 카드 삭제 시 남은 첫 카드로 재배정하도록
  수정 + 확인창에 영향받는 건수 안내 추가. `App.jsx`의 `fixedPortion` 매칭도 방어적으로
  보강(옛 백업으로 들어온 유효하지 않은 cardId 대비)
- 안 쓰이던 `StatCard` 컴포넌트 제거 (`components/common.jsx`)

검토했지만 **문제없다고 확인**한 것: `unmarkFixedPaid`/`remove()`/`saveEdit()`의 카드값
"되돌리기" 폴백은 삭제된 카드를 가리켜도 안전함 — 되돌릴 대상 자체가 카드와 함께
이미 사라졌으니 아무것도 안 하는 게 맞는 동작.

---

## 9. 용어 통일 (UI 문구)

| 쓰는 말 | 안 쓰는 말 |
|---|---|
| 대리결제(추후 정산) | 채권 |
| 할부(고정지출) | 할부(대출) |
| 통장(자동이체) | 통장(대출/자동이체) |
| 반영 전 여유 | 실제 여유 |
| 표기내역 (모든 placeholder) | 예: 월세, 쏘렌토할부 등 |

- 목표지출액 기준이며 **급여일 개념 없음** (달력상 1일~말일)
- 카드 결제하기(bill 전액 출금)는 **홈에서만**. 대리결제 정산은 2026-08-21부터 **홈·내역 둘 다** 가능
