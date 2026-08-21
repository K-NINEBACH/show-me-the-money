# 내 돈 챙겨줘 — 프로젝트 인수인계 문서

개인 가계부 PWA. 급여 후 과소비 방지가 목적. 서버 없이 브라우저 localStorage에만 저장.

---

## 1. 기술 스택 / 실행

- React 18 + Vite 5, 의존성은 `lucide-react`(아이콘)뿐. **차트 라이브러리 없음**(recharts 제거됨)
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
│   ├── sw.js                  # 서비스워커
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
  isReceivable,              // 대리결제(추후 정산) 여부
  settled, repaidAmount, settledAt,
  settlementCardDelta, settlementCardId, settlementBalanceId,  // 정산 시 되돌리기용
  linkedTransitMonth,        // 대중교통 누적 항목 표시 (예: "2026-07")
  isCardAdjustment,          // 카드값에 흔적 남기기용(2026-08-21). "카드반영"/카드값 수동
                              // 추가로 생긴 항목 표시. cardSpentThisCycle 집계에서는 제외
                              // (fixedSumAll이 이미 매달 반영하고 있어서 이중계산 방지)
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
- 대리결제(추후 정산) 체크박스

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
- 대리결제는 **미정산일 때만** 연필 버튼으로 그 자리에서 바로 정산(`settleReceivable`, Home.jsx에서 import) — 정산 끝나면 연필 사라지고 상태 태그로 바뀜. 정산완료 후엔 수정 UI 없음(다시 고치려면 삭제 후 재등록)
- 입출금은 삭제만 가능(수정 UI 없음)
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
- 대리결제(추후 정산) — 홈 또는 내역(미정산 줄의 연필)에서 정산 가능, 부족분→카드값 / 초과분→통장 자동 반영 (정산 로직은 `settleReceivable` 하나, Home.jsx에서 export해 Ledger.jsx도 같이 씀)
- 잔액·카드값 스냅(맞추기), 고정지출 자동 출금처리(`autoPayDay`), 미처리 배지
- 대중교통비 빠른입력 — **누적 금액 갱신 방식**(더하지 않고 교체)
- 결제 문자 파싱(`parsePaymentText`) — 현대카드로 검증됨. "누적" 금액·마스킹 이름(`*`) 제외, 날짜 이후 단어를 가맹점명 우선
- JSON 백업/복원, 온보딩, 월 마감 요약
- 렌더링 중 에러가 나도 흰 화면 대신 안내+새로고침을 보여주는 `ErrorBoundary`

---

## 8. 남은 작업 / 알려진 제약

### PENDING
- **기록 속도 개선** — 자주 쓰는 카테고리/카드 기본값, 즐겨찾기 원터치 재등록 (사용자가 "나중에" 하기로 함)
- **할부 종료 알림** — "이번 달이 마지막 회차" 안내 미착수
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
