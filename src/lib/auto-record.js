import { parsePaymentText, todayISO, fixedInfo } from "./data";

/*
  결제 알림을 사람 확인 없이 바로 기록으로 넣는 자리.

  **두 가지를 넣는다.**
    · 카드 승인  → 지출 기록 (여유 계산에 들어간다)
    · 은행 입출금 → 통장 입출금 기록 (잔액만 맞춘다, 여유와 무관하다)

  은행 쪽은 통장 잔고를 실제와 맞추는 용도다. 그래서 여유 계산을 건드리지
  않는다 — 원래 balanceEntries는 spent에 안 들어간다.

  **문제는 앱이 스스로 만드는 입출금과 겹치는 것이다.** 카드값을 결제하면
  앱이 출금을 만드는데 은행 알림도 온다. 고정지출 출금처리도, 대리결제
  정산 입금도 마찬가지다. 그대로 두면 통장에서 같은 돈이 두 번 빠지고,
  그건 잔액이 조금 틀린 것보다 나쁘다 — 어느 쪽이 진짜인지 알 수가 없다.
  그래서 **같은 날·같은 금액·같은 방향**이 이미 있으면 넣지 않는다.

  자동으로 넣는 조건을 좁게 잡는다. 애매하면 넣지 않고 알림함에 남겨서
  사람이 보게 한다. **놓치는 건 나중에 넣으면 되지만, 잘못 들어간 건 찾기가
  어렵다.**

  넣은 것에는 auto 표시를 남긴다. 내역에서 '자동' 배지로 보이므로, 이상하면
  그 줄들만 훑어서 지울 수 있다. 표시가 없으면 자동 등록은 위험한 기능이 된다.
*/

/** 이 말이 있으면 통장 입출금이 아니다 — 취소·환불·안내 문구 */
const NEGATIVE = /취소|환불|거절|실패|누적|한도|승인취소|출금취소/;

/** 이 말이 있어야 결제다 */
const POSITIVE = /승인|결제/;

/*
  카드 결제가 아닌 문구.

  **'누적'은 여기 없다.** 현대카드 결제 문자는 늘 끝에 "누적1,778,985원"이 붙는데,
  예전엔 '누적'이 있으면 결제가 아니라고 걸러서 현대카드 결제가 한 번도 자동으로
  못 들어갔다('누적 사용액 안내'를 거르려던 것). 그런 안내 문자에는 '승인'이 없으니
  POSITIVE에서 이미 떨어진다.

  대신 '결제 예정·청구·안내'는 거른다. '결제'라는 글자가 있어서 예전 규칙으로도
  카드 결제로 들어갈 수 있던 문구다 — 다음 달 청구 금액 안내가 지출로 잡히면
  그 달 여유가 통째로 틀어진다.
*/
/*
  **'예정'·'안내' 한 낱말로 거르지 않는다**(2026-09-14). 현대카드 앱 푸시로 받기로 하면서 보니
  "승인 안내"나 "적립 예정 88M"이 붙은 진짜 결제가 걸러질 수 있었다. 거를 것은 결제일·청구
  안내뿐이라 그 말 묶음으로 좁혔다.
*/
const CARD_NOT_APPROVAL = /취소|환불|거절|실패|청구|결제\s*(?:예정|금액|일)|출금\s*예정|납부\s*예정|이용\s*대금/;

/*
  광고 문자 — 법으로 '(광고)'를 달게 돼 있다. "(광고) 결제 시 3,000원 할인"은 금액과
  '결제'가 다 있어서, 카드가 하나뿐이면 카드 결제로 들어갈 수 있었다(2026-09-13).
*/
const AD = /[([]\s*광고\s*[)\]]/;

/** 카드 결제로 보이나 */
function looksLikeCardApproval(text) {
  if (AD.test(text)) return false;
  if (!POSITIVE.test(text)) return false;
  if (CARD_NOT_APPROVAL.test(text)) return false;
  return true;
}

/*
  **문자로 온 '결제'는 카드 말이 있어야 카드 결제다**(2026-09-13).

  문자함을 통째로 읽으면 간편결제·쇼핑몰의 "결제 완료 12,000원"도 들어온다. 포인트나
  페이머니로 냈을 수 있고, 카드로 냈으면 카드사 문자가 따로 온다. 예전엔 카드가 하나뿐이면
  이런 문자가 그 카드 결제로 들어갔다. 카드사 문자는 '승인'이나 '카드'·'체크'가 꼭 있다.
  보낸 앱이 카드사·은행이면 예전처럼 본다.
*/
function cardApproval(text, pkg) {
  if (!looksLikeCardApproval(text)) return false;
  // 날짜·시각이 없다고 거르지 않는다 — "승인 14,900원 유튜브"처럼 짧게 오는 정기결제 알림이 있다.
  // 광고 푸시는 법으로 '(광고)'를 달아야 해서 AD가 거른다.
  return !!issuerOf(pkg) || /승인|카드|체크/.test(text);
}

/*
  카드 결제 취소로 보이나. 통장 '출금취소'는 카드 취소가 아니다 — 입출금 말이
  섞여 있으면 여기서 뺀다.
*/
function looksLikeCardCancel(text) {
  if (AD.test(text)) return false;
  if (!/취소|환불/.test(text)) return false;
  if (/거절|실패|출금|입금|이체/.test(text)) return false;
  return true;
}

/*
  할부로 산 결제인가("3개월", "무이자할부"). 일시불이면 아니다.

  할부 결제 문자에는 총액이 찍힌다. 그대로 넣으면 몇 달에 나눠 낼 돈이 이번 달
  카드값에 통째로 잡혀 여유가 크게 틀어진다. 이 앱은 할부를 '할부(고정지출)'로
  따로 등록해 회차마다 나눠 세는 구조라, 자동으로 넣지 않고 사람에게 넘긴다.
*/
function looksLikeInstallmentPurchase(text) {
  if (/일시불/.test(text)) return false;
  return /할부|\d{1,2}\s*개월/.test(text);
}

/** 알림함에서 '취소'로 보여 줄 문구인가 (화면용) */
export function isCancelText(text) {
  return /취소|환불/.test(String(text || ""));
}

/*
  **알림을 보낸 앱으로 은행·카드사를 가린다.**

  문구에 은행 이름이 아예 없는 경우가 흔하다. KB스타뱅킹 출금 알림이 그렇다 —
  "출금 30,000원 · 김*혁님 09/09 22:54 · 카카오페이 FBS출금 30,000 잔액1,392,375"
  어디에도 '국민'이 없다. 글자만 보면 어느 통장인지 영영 못 고른다.

  게다가 본문에 '카카오페이' 같은 **남의 이름**이 들어 있어서, 글자만 보다가는
  엉뚱한 통장에 붙을 수도 있다. 보낸 앱은 그런 착각을 안 한다.

  그래서 패키지를 먼저 보고, 거기서 못 고를 때만 글자로 넘어간다.
  후보가 둘 이상 걸리면(같은 은행 통장이 둘이면) 고르지 않는다 — 그건 사람이 본다.
*/
const ISSUERS = [
  { re: /kbstar|kbbank|kbcard|kookmin/, keys: ["국민", "KB", "kb"] },
  { re: /shinhan/, keys: ["신한"] },
  { re: /woori/, keys: ["우리"] },
  { re: /hanabank|hanacard|hanaskcard/, keys: ["하나"] },
  { re: /nonghyup|nhbank|nhcard|nhqv/, keys: ["농협", "NH", "nh"] },
  { re: /kakaobank/, keys: ["카카오뱅크", "카뱅"] },
  { re: /kakaopay/, keys: ["카카오페이"] },
  { re: /tossbank/, keys: ["토스뱅크"] },
  { re: /viva|toss/, keys: ["토스"] },
  { re: /ibk|ionebank|i-one/, keys: ["기업", "IBK", "ibk"] },
  { re: /hyundaicard/, keys: ["현대"] },
  { re: /lottecard/, keys: ["롯데"] },
  { re: /samsungcard/, keys: ["삼성"] },
  { re: /bccard/, keys: ["비씨", "BC"] },
  { re: /citibank/, keys: ["씨티"] },
];

function issuerOf(pkg) {
  const p = String(pkg || "").toLowerCase();
  if (!p) return null;
  return ISSUERS.find((it) => it.re.test(p)) || null;
}

function pickByKeys(list, keys) {
  const hits = (list || []).filter((x) =>
    keys.some((k) => String(x.name || "").includes(k)),
  );
  return hits.length === 1 ? hits[0] : null;
}

/*
  **보낸 곳을 아는데 그 이름의 통장·카드가 없으면, 글자로 찍지 않는다.**

  글자 대조는 이름 앞 두 글자가 문구 아무 데나 있으면 잡는다. 그런데 은행
  문구에는 남의 회사 이름이 자주 들어간다 — KB 출금 알림 본문의 '카카오페이'가
  그렇다. 카카오페이 통장을 따로 두고 있으면 KB에서 나간 돈이 거기 붙는다.
  잔액이 두 군데 다 틀어지고, 눈으로는 알아채기 어렵다.

  보낸 앱이 KB라는 걸 아는 이상 그건 확실히 틀린 답이다. 못 고르면 보류하고
  사람에게 넘긴다. 보낸 곳을 모를 때만 예전처럼 글자로 넘어간다.
*/
function issuerOfName(name) {
  const n = String(name || "");
  if (!n) return null;
  return ISSUERS.find((it) => it.keys.some((k) => n.includes(k))) || null;
}

/*
  **문자는 맨 앞의 보낸 곳 이름으로 가린다**(2026-09-13).

  문자로 온 것은 보낸 앱이 문자 앱이라 패키지로 못 가린다. 예전엔 그때 이름 두 글자를
  문구 **아무 데서나** 찾았는데, 가맹점 이름이 끼어들었다 — 현대카드 문자의 '롯데마트'가
  롯데카드에 붙었다. 카드·통장이 하나뿐이면 아예 안 보고 붙여서, KB국민체크 문자가
  현대카드에, 기업은행 출금이 국민은행에 붙었다. 잔액 자동 맞춤(2026-09-13)이 붙은 뒤로는
  국민은행 잔액이 기업은행 잔액으로 덮어써지기까지 한다.

  카드·은행 문자는 보낸 곳 이름으로 시작한다("[KB국민체크]", "현대카드 승인", "[IBK기업]").
  '[Web발신]'과 앞의 전화번호(문자 앱 알림 제목)를 걷어 내고 앞부분에서만 찾는다.
*/
function issuerOfHead(text) {
  const head = String(text || "")
    .replace(/[[(]?\s*web\s*발신\s*[\])]?/gi, " ")
    .replace(/^[^가-힣A-Za-z]+/, "")
    .slice(0, 12);
  let best = null;
  let at = Infinity;
  for (const it of ISSUERS) {
    for (const k of it.keys) {
      const i = head.indexOf(k);
      if (i >= 0 && i < at) { best = it; at = i; }
    }
  }
  return best;
}

function pickOne(list, text, pkg) {
  if (!list || list.length === 0) return null;
  const byPkg = issuerOf(pkg);
  const issuer = byPkg || issuerOfHead(text);

  /*
    **하나뿐이어도 '다른 은행'이면 붙이지 않는다.**

    하나뿐이면 거기 붙이는 게 보통 맞다 — 이름을 '주거래'처럼 지어 뒀어도
    받는 곳이 거기밖에 없다. 하지만 이름이 대놓고 다른 은행을 가리키면
    얘기가 다르다. 국민은행 통장 하나만 등록해 둔 상태에서 기업은행 출금
    알림이 오면, 그건 앱이 아직 모르는 통장에서 나간 돈이다. 국민은행에
    붙이면 그 잔고가 틀어지고, 정작 기업은행은 여전히 안 보인다.

    이름에 은행이 안 적혀 있으면 예전처럼 그냥 붙인다.
  */
  if (list.length === 1) {
    const only = list[0];
    const mine = issuerOfName(only.name);
    if (issuer && mine && mine !== issuer) return null;
    return only;
  }

  if (byPkg) return pickByKeys(list, byPkg.keys);
  if (issuer) {
    const hit = pickByKeys(list, issuer.keys);
    if (hit) return hit;
    // 그 이름의 카드·통장이 없으면, 이름에 다른 회사가 안 적힌 것(별명) 중에서만 고른다
    list = list.filter((x) => !issuerOfName(x.name));
  }

  for (const x of list) {
    const key = String(x.name || "").replace(/[^가-힣A-Za-z]/g, "").slice(0, 2);
    if (key && text.includes(key)) return x;
  }
  return null;
}

/*
  어느 카드에 달 것인가.

  문구에 카드 이름의 일부가 있으면 그 카드를 쓴다("현대카드" → 이름에 '현대'가
  든 카드). 못 찾으면 **자동 등록하지 않는다** — 카드가 여럿인데 엉뚱한 카드에
  달면 카드값이 둘 다 틀어지고, 그건 눈으로 알아채기 어렵다.
  카드가 하나뿐이면 그 카드로 본다.
*/
function findCard(cards, text, pkg) {
  return pickOne(cards, text, pkg);
}

/** 통장 입출금으로 보이나 */
const IN_WORDS = /입금|이체입금|받으심/;
const OUT_WORDS = /출금|이체출금|자동이체|납부/;

function bankDirection(text) {
  if (NEGATIVE.test(text) || AD.test(text)) return null;
  if (IN_WORDS.test(text)) return "in";
  if (OUT_WORDS.test(text)) return "out";
  return null;
}

/*
  어느 통장인가. 카드와 같은 방식이다 — 보낸 앱(패키지)을 먼저 보고, 안 되면
  이름 앞 두 글자가 문구에 있는지 본다. 통장이 하나뿐이면 그것으로 본다.
  못 고르면 자동으로 안 넣는다.
*/
function findAccount(accounts, text, pkg) {
  return pickOne(accounts, text, pkg);
}

/*
  이미 들어와 있는 입출금인가.

  **앱이 스스로 만든 것과 겹치는 걸 막는 자리다.** 카드값 결제·고정지출
  출금처리·대리결제 정산이 전부 여기 걸린다. 같은 날 같은 금액을 진짜로
  두 번 옮겼다면 두 번째는 알림함에 남으니 사람이 보고 넣으면 된다 —
  반대 방향(두 번 빠지는 것)은 되돌리기가 훨씬 어렵다.
*/
function alreadyInLedger(entries, { amount, date, type, accountId, time }) {
  return (entries || []).some(
    (b) =>
      b.auto &&
      // 잔액 맞춤은 거래가 아니다 — 같은 금액이 우연히 겹쳐도 짝으로 보면 안 된다
      !b.isAdjustment &&
      Number(b.amount) === Number(amount) &&
      b.date === date &&
      b.type === type &&
      (accountId ? (b.accountId || null) === accountId : true) &&
      sameMoment(b, time),
  );
}

/*
  **같은 날·같은 금액이어도 시각이 다르면 다른 거래다.**

  예전엔 같은 날·같은 금액이면 무조건 같은 건으로 보고 보류했다. 그러면 지하철을
  하루 두 번 타도(1,450원 × 2) 두 번째가 알림함에 걸려 사람이 눌러야 했다.

  그렇다고 그냥 풀면 반대가 터진다 — 같은 결제가 카드사 앱 알림과 문자로 두 번
  오면 두 번 들어간다. 그래서 문자에 찍힌 결제 시각(17:15)을 자동 기록에 남겨 두고
  (autoTime), 시각이 같으면 같은 거래, 다르면 다른 거래로 본다.

  손으로 적은 기록(auto 아님)이나 앱이 스스로 만든 입출금(카드값 결제·출금처리)은
  시각이 없으니 같은 날·같은 금액이면 같은 거래로 본다. 한쪽이라도 시각을 모르면
  같은 거래로 본다 — 두 번 들어가는 쪽이 되돌리기 어렵다.
*/
function sameMoment(entry, time) {
  if (!entry.auto) return true;
  if (!entry.autoTime || !time) return true;
  return entry.autoTime === time;
}

/*
  **먼저 적혀 있던 기록을 은행·카드 알림으로 바로잡는다**(2026-09-11).

  손으로 적었거나 앱이 스스로 만든 기록(auto 아님)이 이 알림과 같은 거래면, 새로
  넣지 않고 그 기록을 알림이 알려 준 대로 고친 뒤 '확인됨'(bankConfirmed)으로 표시한다.
  한 번 맞춰진 기록은 다시 짝이 되지 않는다 — 같은 금액이 진짜로 두 번 나갔을 때
  두 번째 알림을 삼키지 않기 위해서다. 예전엔 같은 날·같은 금액이면 몇 번이든
  같은 기록 하나에 다 걸려 넘어갔다.

  앱이 짐작으로 적는 자리가 둘 있어서 날짜·통장까지 바로잡는다.
    · 카드값 '결제하기'는 무조건 첫 번째 통장에서 출금으로 적는다. 실제로 다른
      통장에서 나갔으면 은행 알림이 그 통장에 또 적혀 **두 번 빠졌다.**
    · 자동이체(autoPayDay)는 정해 둔 날짜로 출금을 적는다. 주말 등으로 실제 출금일이
      다르면 날짜가 안 맞아 같은 건으로 못 알아보고 **두 번 빠졌다.** 그래서 고정지출에
      딸린 기록은 같은 달·같은 통장이면 날짜가 달라도 같은 건으로 본다.
  은행이 알려 준 날짜·통장이 진실이다. 이체(한 쌍)는 옮기지 않고 확인만 한다.
*/
function reconcileBalance(entries, { amount, dir, bDate, bKey, accountId, firstAccountId }) {
  const acctOf = (b) => b.accountId || firstAccountId;
  const open = (b) => !b.auto && !b.bankConfirmed && b.type === dir && Number(b.amount) === Number(amount);
  const list = entries || [];
  const hit =
    list.find((b) => open(b) && b.date === bDate && acctOf(b) === accountId) ||
    // 다른 통장으로 옮기는 건 앱이 통장을 짐작한 기록만 — 카드값 '결제하기'(첫 통장에 적는다).
    // 손으로 적은 지출의 출금까지 옮기면 우연히 같은 금액인 다른 통장 거래에 끌려간다.
    list.find((b) => open(b) && !b.transferId && b.date === bDate && /카드값 결제$/.test(String(b.memo || ""))) ||
    list.find((b) => open(b) && !b.transferId && b.linkedFixedId && String(b.date).slice(0, 7) === bKey && acctOf(b) === accountId);
  if (!hit) return null;
  const fixed = hit.transferId ? { bankConfirmed: true } : { date: bDate, accountId, bankConfirmed: true };
  return list.map((b) => (b.id === hit.id ? { ...b, ...fixed } : b));
}

/** 카드도 같다 — 손으로 먼저 적어 둔 같은 결제면 넣지 않고 확인만 한다 */
function reconcileExpense(expenses, { amount, date, cardId }) {
  const hit = (expenses || []).find((e) => !e.auto && !e.bankConfirmed && (e.paymentMethod || "cash") === "card"
    && (e.cardId || null) === cardId && Number(e.amount) === Number(amount) && e.date === date);
  if (!hit) return null;
  return expenses.map((e) => (e.id === hit.id ? { ...e, bankConfirmed: true } : e));
}

/** 문자에 찍힌 결제 시각 "17:15". 없으면 null */
function timeOf(text) {
  const m = String(text || "").match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/*
  은행 알림에 찍힌 거래 후 잔액 "잔액1,392,375" → 1392375. 없으면 null.
  마이너스 통장은 "잔액-120,000"처럼 온다. '잔액부족'처럼 숫자가 안 붙으면 잔액이 아니다.
*/
export function balanceOf(text) {
  const m = String(text || "").match(/잔액\s*[:：]?\s*(-)?\s*(\d[\d,]*)/);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return m[1] ? -n : n;
}

/** 앱이 아는 이 통장의 잔액 — App.jsx의 accountTotals와 같은 계산 */
function ledgerBalance(accounts, entries, accountId) {
  const first = accounts[0]?.id;
  const acc = accounts.find((a) => a.id === accountId);
  return (entries || []).reduce((s, b) => {
    if ((b.accountId || first) !== accountId) return s;
    if (b.type === "in") return s + Number(b.amount);
    if (b.type === "out") return s - Number(b.amount);
    return s;
  }, Number(acc?.initialBalance || 0));
}

/*
  **같은 거래인지 가르는 열쇠** — 날짜·시각·금액·종류(카드 결제/취소/입금/출금).

  문자함을 직접 읽으면(껍데기 1.2) 같은 결제가 두 길로 온다. 문자 앱 알림은
  "보낸 사람 + 본문", 문자함은 본문만이라 글자로는 다른 알림이다. 그대로 두면
  결제는 시각으로 걸러지지만, 취소는 두 번째 것이 되돌릴 기록을 못 찾아 알림함에
  뜨고, 애매해서 보류된 것은 알림함에 두 줄로 뜬다. 그래서 받는 자리에서 한 번 거른다.
  시각이나 날짜가 없으면 열쇠를 안 만든다 — 그땐 다른 거래일 수 있다.
*/
export function dealKey(text) {
  const t = String(text || "");
  const r = parsePaymentText(t);
  const amount = Number(r.amount);
  const time = timeOf(t);
  if (!amount || !time || !r.date) return null;
  const kind = looksLikeCardCancel(t) ? "cancel" : looksLikeCardApproval(t) ? "card" : bankDirection(t) || "etc";
  return `${r.date}|${time}|${amount}|${kind}`;
}

/** "2026-09-13 10:02" — 잔액을 맞춘 시점. 문자열 비교로 앞뒤를 가린다 */
export function syncMoment(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/*
  이미 들어와 있는 지출인가.

  같은 날·같은 금액·같은 카드면 같은 건으로 본다. 정기결제를 앱에서 '카드반영'
  으로 넣어 두었는데 카드사 승인 문자가 따로 오는 경우가 있고, 그때 둘 다
  들어가면 그 달 지출이 두 배로 잡힌다.

  놓칠 위험(같은 날 같은 금액을 진짜로 두 번 쓴 경우)도 있지만, 그때는 알림함에
  남아서 사람이 보고 넣으면 된다. 반대 방향의 실수는 되돌리기 어렵다.
*/
function alreadyRecorded(expenses, { amount, date, cardId, time }) {
  return expenses.some(
    (e) =>
      e.auto &&
      Number(e.amount) === Number(amount) &&
      e.date === date &&
      (e.cardId || null) === (cardId || null) &&
      sameMoment(e, time),
  );
}

/*
  이번 달에 **이미 처리한** 고정지출인가 — 이름 조각이 문구에 있을 때만.

  '카드반영'·'출금처리'를 먼저 눌러 둔 뒤 실제 결제 알림이 오는 경우다. 그 고정지출은
  이미 처리돼 있어서 짝을 못 찾고, 예전엔 새 지출로 한 번 더 들어갔다 — 같은 돈이
  두 번 잡힌다. 이름 조각까지 맞을 때만 같은 건으로 본다. 금액만 맞으면 우연히 같은
  금액의 다른 결제일 수 있다.
*/
function paidFixedHit(fixedExpenses, { amount, isCard, cardId, accountId, text }, key) {
  const hay = String(text || "");
  return (fixedExpenses || []).find((f) => {
    if (!(f.paidMonths && f.paidMonths[key])) return false;
    if (((f.paymentMethod || "cash") === "card") !== isCard) return false;
    if (isCard && f.totalMonths > 0) return false;
    const info = fixedInfo(f, key);
    if (!info.active || Number(info.amount) !== Number(amount)) return false;
    if (isCard && f.cardId && cardId && f.cardId !== cardId) return false;
    if (!isCard && f.accountId && accountId && f.accountId !== accountId) return false;
    const name = String(f.name || "").replace(/[^가-힣A-Za-z0-9]/g, "");
    for (let len = Math.min(name.length, 6); len >= 2; len -= 1) {
      if (hay.includes(name.slice(0, len))) return true;
    }
    return false;
  }) || null;
}

/** 할부 개월 수 "3개월" → 3. 모르면 null */
function monthsOf(text) {
  const m = String(text || "").match(/(\d{1,2})\s*개월/);
  const n = m ? Number(m[1]) : null;
  return n && n >= 2 && n <= 60 ? n : null;
}

/*
  이 승인이 '할부 회차 금액'과 같은가.

  할부는 앱이 매달 cardTotals.fixedPortion으로 카드값에 이미 넣고 있다. 이 승인이
  정말 그 할부 청구라면 bill에 또 더해져 **그 달 카드값이 두 배**가 된다. 그런데
  문자만 보고는 진짜 할부 청구인지 우연히 금액이 같은 다른 결제인지 가를 수 없다.
  그래서 자동으로 넣지 않고 사람에게 넘긴다 — 알림함에서 보고 넣으면 된다.
*/
function looksLikeInstallmentCharge(fixedExpenses, { amount, cardId }, key) {
  return (fixedExpenses || []).some((f) => {
    if ((f.paymentMethod || "cash") !== "card") return false;
    if (!(f.totalMonths > 0)) return false;
    if (f.cardId && cardId && f.cardId !== cardId) return false;
    const info = fixedInfo(f, key);
    return info.active && Number(info.amount) === Number(amount);
  });
}

/*
  이 알림이 '그 달에 아직 처리 안 한 고정지출'인가.

  **여기가 중복 문제의 진짜 답이다.** 유튜브·쿠팡 정기결제나 청약·적금
  자동이체는 통장·카드에서 먼저 빠져나가고, 사람은 며칠 뒤에 앱에서
  '카드반영'이나 '출금처리'를 누른다. 날짜가 다르니 같은 날 비교로는 못
  막고, 그러면 같은 돈이 두 번 잡힌다.

  그래서 날짜를 넓게 보는 대신 **고정지출 자체를 처리 완료로 표시한다.**
  앱이 버튼을 눌렀을 때 하는 일과 똑같이 한다 — 기록을 남기고 그 id를
  paidMonths에 적는다. 그러면 그 항목은 '출금처리 안 한 고정지출' 목록에서
  사라지고, 누를 버튼 자체가 없어진다. 며칠이 지나든 중복이 생길 수 없다.

  금액과 결제 수단이 둘 다 맞아야 짝으로 본다. 금액만 보면 우연히 같은
  금액의 다른 지출이 고정지출을 처리 완료로 만들어 버린다.
*/
function matchFixed(data, { amount, isCard, cardId, accountId, text }, key) {
  const list = data.fixedExpenses || [];

  const candidates = [];
  for (const f of list) {
    if (f.paidMonths && f.paidMonths[key]) continue;   // 이미 처리됨

    /*
      **카드 쪽은 '매달반복'만 짝으로 본다.**

      카드 할부(totalMonths > 0)에는 '카드반영' 버튼이 아예 없다 — 앱이 매달
      cardTotals.fixedPortion으로 카드값에 이미 넣고 있기 때문이다. 여기서 짝을
      지어 bill에 또 더하면 **그 달 카드값이 정확히 두 배가 된다.**
      paidMonths를 적어도 소용없다(unpaidFixed가 할부는 안 본다).

      통장 쪽은 할부여도 상관없다 — 통장형은 paidMonths로 '출금처리'를 관리하고,
      fixedSum이 처리 여부와 무관하게 항상 잡고 있어서 이중계산이 안 생긴다.
    */
    if (isCard && f.totalMonths > 0) continue;

    const info = fixedInfo(f, key);
    if (!info.active) continue;
    if (Number(info.amount) !== Number(amount)) continue;

    const fixedIsCard = (f.paymentMethod || "cash") === "card";
    if (fixedIsCard !== isCard) continue;

    // 카드·통장이 지정돼 있으면 그것도 맞아야 한다
    if (isCard && f.cardId && cardId && f.cardId !== cardId) continue;
    if (!isCard && f.accountId && accountId && f.accountId !== accountId) continue;

    candidates.push({ fixed: f, info });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  /*
    **금액이 같은 고정지출이 여럿일 때.**

    실제로 흔하다 — 10만 원짜리가 '데이트(여행)'·'가족모임'·'주택청약'처럼
    셋씩 있다. 금액만 보고 아무거나 고르면 잔액은 맞지만 **어느 항목이
    나갔는지 이름이 뒤바뀐다.**

    그래서 알림 문구에 항목 이름의 조각이 들어 있으면 그쪽을 먼저 고른다
    (은행 문자에는 대개 받는 곳이나 적요가 찍힌다 — '청약', '보험' 등).
    힌트가 없으면 고르지 않고 **알림함에 남긴다.** 아무거나 골라서 이름이
    틀리는 것보다, 사람이 보고 누르는 편이 낫다.
  */
  const hay = String(text || "");
  for (const c of candidates) {
    const name = String(c.fixed.name || "").replace(/[^가-힣A-Za-z0-9]/g, "");
    for (let len = Math.min(name.length, 6); len >= 2; len -= 1) {
      const key = name.slice(0, len);
      if (key && hay.includes(key)) return c;
    }
  }
  return null;
}

/**
 * 알림 목록을 훑어 자동으로 넣을 수 있는 것만 넣는다.
 *
 * @param held  알림함에 이미 보류돼 있는 것들. 자동으로 넣지는 않고, 결제·취소
 *              짝을 맞출 때만 본다.
 * @returns {{ next, registered, leftover, dropped, undone }}
 *   next       바뀐 데이터(바뀐 게 없으면 원본 그대로)
 *   registered 자동으로 넣은 항목들
 *   leftover   자동으로 못 넣어 알림함에 남길 것들
 *   dropped    결제·취소가 짝이 맞아 알림함에서 치울 것들(held 포함)
 *   undone     취소 알림을 받아 기록에서 뺀 지출들
 *   skipped    이미 적혀 있는 거래라 넘긴 알림들(두 번 넣지 않는다)
 */
export function autoRecordPayments(data, items, held = []) {
  const registered = [];
  const leftover = [];

  let expenses = data.expenses;
  let cards = data.cards;
  let balanceEntries = data.balanceEntries || [];
  let fixedExpenses = data.fixedExpenses || [];
  const balanceEntries0 = balanceEntries;
  const fixedExpenses0 = fixedExpenses;
  let accounts = data.accounts || [];
  const accounts0 = accounts;
  const synced = [];
  let seq = 0;

  /*
    **은행 알림의 잔액으로 통장 잔액을 맞춘다**(2026-09-13).

    은행 입출금 알림에는 거래 뒤 잔액이 찍힌다("잔액1,392,375"). 그게 은행이 알려 준
    진짜 잔액이다. 앱이 계산한 잔액이 다르면 차액만큼 '은행 잔액에 맞춤' 기록을 넣는다
    (isAdjustment — 여유 계산에는 안 들어간다. 통장 입출금은 원래 안 들어간다).

    이러면 알림을 몇 개 놓쳤든, 카드값 '결제하기'를 실제 출금보다 먼저 눌렀든, 다음
    은행 알림 한 번에 잔액이 다시 맞는다. 사람이 '실제 잔액으로 맞추기'를 누르던 걸
    알림이 올 때마다 대신 하는 것이다.

    **순서가 뒤집히면 안 맞춘다.** 알림이 늦게 들어오는 일이 있다(리스너가 다시 붙으며
    알림창을 훑을 때, 문자함을 뒤늦게 읽을 때). 마지막으로 맞춘 시점(bankSync.at)보다
    앞선 거래의 잔액으로 맞추면 그 뒤 거래가 지워진다. 그런 알림으로 새 기록이 들어갔으면
    그 거래는 이미 마지막 잔액에 들어 있던 것이라, 같은 금액을 되돌려 잔액을 그대로 둔다.
    시각이 안 찍힌 알림은 앞뒤를 모르니 맞추지 않는다.
  */
  const syncBank = (item, accountId, text, date, time, added) => {
    const bank = balanceOf(text);
    if (bank == null || !time) return;
    const at = `${date} ${time}`;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const adjust = (diff, memo) => {
      balanceEntries = [...balanceEntries, {
        // id의 숫자가 곧 만든 시각이다(createdTime) — 글자를 끼우면 숫자가 이어 붙어 열 배 뒤로
        // 정렬된다. 같은 묶음의 기록(Date.now()+건수)과 안 겹치게 1초 뒤로 둔다
        id: "b" + (Date.now() + 1000 + seq++), type: diff > 0 ? "in" : "out", amount: Math.abs(diff), date,
        memo, accountId, isAdjustment: true, auto: true,
      }];
    };
    if (acc.bankSync?.at && at < acc.bankSync.at) {
      if (added) adjust(added.type === "in" ? -Number(added.amount) : Number(added.amount), "은행 잔액에 이미 들어 있던 거래");
      return;
    }
    const diff = bank - ledgerBalance(accounts, balanceEntries, accountId);
    if (diff !== 0) {
      adjust(diff, "은행 잔액에 맞춤");
      synced.push({ item, accountId, name: acc.name, diff });
    }
    accounts = accounts.map((a) => (a.id === accountId ? { ...a, bankSync: { at, balance: bank } } : a));
  };

  /*
    처리 완료로 적는 달은 '지금'이 아니라 **그 결제가 실제로 일어난 달**이다.

    12월 31일 결제 알림을 1월 1일에 읽는 일이 실제로 생긴다. 그때 이번 달을
    처리 완료로 적으면 12월 것은 계속 미처리로 남고, 1월 것은 나가지도 않았는데
    처리된 것이 된다 — 양쪽이 다 틀린다.
  */
  const keyOf = (iso) => String(iso).slice(0, 7);

  /* 고정지출을 처리 완료로 표시한다 — 버튼을 누른 것과 같은 효과 */
  const markPaid = (fixedId, markerId, key) => {
    fixedExpenses = fixedExpenses.map((x) =>
      x.id === fixedId
        ? { ...x, paidMonths: { ...(x.paidMonths || {}), [key]: markerId } }
        : x,
    );
  };

  /*
    **결제했다가 바로 취소하면 둘 다 넣지 않는다.**

    결제 문자와 취소 문자가 따로 온다. 예전엔 취소를 그냥 보류해서, 알림함에
    '36,280원 쿠팡페이'가 똑같은 모양으로 두 줄 떴고 둘 다 '채우기'가 있었다.
    결제가 두 번 잡힌 것처럼 보이고, 둘 다 누르면 실제로 두 번 들어간다.

    같은 카드·같은 금액의 결제와 취소가 알림함(새로 온 것 + 이미 보류된 것)에
    같이 있으면 서로 지운다. 둘 다 아직 기록 전이라 아무것도 안 건드린다.
  */
  const info = (item) => {
    const text = String(item?.text || "");
    const r = parsePaymentText(text);
    const amount = Number(r.amount);
    const pkg = item?.pkg;
    const isCancel = looksLikeCardCancel(text);
    const isApproval = !isCancel && cardApproval(text, pkg);
    const card = (isCancel || isApproval) && amount > 0 ? findCard(cards, text, pkg) : null;
    return { item, text, r, amount, pkg, isCancel, isApproval, card };
  };
  const all = [...items.map(info), ...held.map(info)];
  const paired = new Set();
  for (const c of all) {
    if (!c.isCancel || !c.card) continue;
    const a = all.find((x) => x.isApproval && x.card && x.card.id === c.card.id && x.amount === c.amount && !paired.has(x.item));
    if (a) { paired.add(a.item); paired.add(c.item); }
  }
  const dropped = [...paired];
  const undone = [];
  const skipped = [];

  for (const it of all.slice(0, items.length)) {
    const { item, text, r, amount, pkg } = it;
    if (paired.has(item)) continue;
    if (!amount || amount <= 0) {
      leftover.push(item);
      continue;
    }

    /*
      **이미 자동으로 들어간 결제에 취소가 오면 그 기록을 뺀다.**

      결제 알림이 먼저 와서 자동으로 들어간 뒤 몇 분 뒤 취소가 오는 경우다. 앱이
      스스로 넣은 것을 같은 경로로 되돌리는 것이라 대칭이 맞는다. 좁게 잡는다 —
      자동으로 들어간 것, 같은 카드·같은 금액, 이번 달, 정산을 안 붙인 것만.
      손으로 적은 기록이나 지난달 것(카드값을 이미 냈을 수 있다)은 건드리지 않고
      알림함에 '취소'로 남겨 사람이 본다. 가맹점 이름이 같은 게 있으면 그걸 고른다.
    */
    /*
      손으로 적은 결제도 되돌린다(2026-09-11, "확인 안 눌러도 자동으로" 요청).
      자동으로 들어간 것을 먼저 고르고, 없을 때 손으로 적은 것을 본다. 가맹점 이름이
      같은 게 있으면 그걸 고른다. 정산을 붙인 것·지난달 것은 여전히 안 건드린다.
      할부로 자동 등록한 결제의 취소면 그 할부 항목을 지운다.
    */
    if (it.isCancel) {
      const nowKey = keyOf(todayISO());
      const pool = it.card
        ? expenses.filter((e) => (e.paymentMethod || "cash") === "card" && e.cardId === it.card.id
            && Number(e.amount) === amount && !e.isCardAdjustment && e.reimbursedAmount == null && keyOf(e.date) === nowKey)
        : [];
      const byMerchant = (list) => list.filter((e) => r.merchant && e.memo === r.merchant);
      const autos = pool.filter((e) => e.auto);
      const manuals = pool.filter((e) => !e.auto);
      const pick = [byMerchant(autos), autos, byMerchant(manuals), manuals].find((l) => l.length)?.slice(-1)[0];
      if (pick) {
        expenses = expenses.filter((e) => e.id !== pick.id);
        cards = cards.map((c) => (c.id === it.card.id ? { ...c, bill: Math.max(0, Number(c.bill || 0) - amount) } : c));
        undone.push(pick);
        continue;
      }
      const inst = it.card
        ? fixedExpenses.find((f) => f.auto && f.cardId === it.card.id && f.setupMonthKey === nowKey && f.totalMonths > 0
            && Number(f.purchaseAmount) === amount)
        : null;
      if (inst) {
        fixedExpenses = fixedExpenses.filter((f) => f.id !== inst.id);
        undone.push(inst);
        continue;
      }
      leftover.push(item);
      continue;
    }

    const card = cardApproval(text, pkg) ? findCard(cards, text, pkg) : null;

    /*
      카드로 못 붙이면 통장 입출금으로 시도한다. 순서가 중요하다 —
      카드 승인 문구에도 '결제'가 들어가서, 은행부터 보면 카드 결제가
      통장 출금으로 잘못 들어간다.
    */
    if (!card) {
      const dir = bankDirection(text);
      const acc = dir ? findAccount(data.accounts, text, pkg) : null;
      if (!dir || !acc) {
        leftover.push(item);
        continue;
      }
      const bDate = r.date || todayISO();
      const bKey = keyOf(bDate);
      const time = timeOf(text);
      /*
        이미 적혀 있는 거래면 넘긴다. 예전엔 알림함에 보류해 사람이 '버리기'를
        눌러야 했는데, 앱이 스스로 만든 출금(카드값 결제·출금처리)이나 같은 알림이
        두 번 온 것이라 넣을 이유가 없다. 넘겼다는 건 알림 문구로 알린다.
      */
      const fixedUp = reconcileBalance(balanceEntries, { amount, dir, bDate, bKey, accountId: acc.id, firstAccountId: data.accounts?.[0]?.id });
      if (fixedUp) {
        balanceEntries = fixedUp;
        skipped.push(item);
        syncBank(item, acc.id, text, bDate, time, null);
        continue;
      }
      if (alreadyInLedger(balanceEntries, { amount, date: bDate, type: dir, accountId: acc.id, time })
        || (dir === "out" && paidFixedHit(fixedExpenses, { amount, isCard: false, accountId: acc.id, text }, bKey))) {
        skipped.push(item);
        syncBank(item, acc.id, text, bDate, time, null);
        continue;
      }

      /* 자동이체로 나간 고정지출이면 그 항목을 처리 완료로 표시한다 */
      const hitOut =
        dir === "out"
          ? matchFixed(
              { ...data, fixedExpenses },
              { amount, isCard: false, accountId: acc.id, text },
              bKey,
            )
          : null;

      const entryId = "b" + (Date.now() + registered.length);
      const entry = {
        id: entryId,
        type: dir,
        amount,
        date: bDate,
        memo: hitOut
          ? `${hitOut.fixed.name} 자동이체`
          : r.merchant || (dir === "in" ? "입금" : "출금"),
        accountId: acc.id,
        auto: true,
        ...(time ? { autoTime: time } : {}),
        ...(hitOut ? { linkedFixedId: hitOut.fixed.id, linkedFixedMonth: bKey } : {}),
      };
      balanceEntries = [...balanceEntries, entry];
      if (hitOut) markPaid(hitOut.fixed.id, entryId, bKey);
      registered.push(entry);
      syncBank(item, acc.id, text, bDate, time, entry);
      continue;
    }

    const date = r.date || todayISO();
    const eKey = keyOf(date);
    const time = timeOf(text);

    /*
      **할부 결제는 '할부(고정지출)'로 등록한다**(2026-09-11).

      문자에는 총액이 찍힌다. 지출로 넣으면 몇 달에 나눠 낼 돈이 이번 달 카드값에
      통째로 잡힌다. 그래서 사람이 기록 탭에서 할부로 등록하던 걸 그대로 대신한다 —
      월 금액 = 총액 ÷ 개월, 나머지 원 단위는 첫 달에 얹어 합이 총액과 맞게. 첫 회차는
      결제한 달이다(일시불이 결제한 달에 잡히는 것과 같게). 카드값에는 앱이 매달
      할부 몫으로 알아서 넣는다.

      개월 수를 문구에서 못 읽으면(예: '무이자할부'만 있고 '3개월'이 없으면) 나눌 수가
      없으니 알림함에 남긴다.
    */
    if (looksLikeInstallmentPurchase(text)) {
      const months = monthsOf(text);
      if (!months) {
        leftover.push(item);
        continue;
      }
      const dupInst = fixedExpenses.some((f) => f.auto && f.cardId === card.id && f.setupMonthKey === eKey
        && Number(f.purchaseAmount) === amount && (f.autoTime || null) === time);
      if (dupInst) {
        skipped.push(item);
        continue;
      }
      const monthly = Math.floor(amount / months);
      const first = amount - monthly * (months - 1);
      const inst = {
        id: "f" + (Date.now() + registered.length),
        name: `${r.merchant || "카드"} 할부`,
        baseAmount: monthly,
        totalMonths: months,
        startInstallment: 1,
        setupMonthKey: eKey,
        overrides: first !== monthly ? { [eKey]: first } : {},
        paymentMethod: "card",
        cardId: card.id,
        accountId: null,
        paidMonths: {},
        autoPayDay: null,
        auto: true,
        purchaseAmount: amount,
        ...(time ? { autoTime: time } : {}),
      };
      fixedExpenses = [...fixedExpenses, inst];
      registered.push(inst);
      continue;
    }

    /* 손으로 먼저 적어 둔 결제면 넣지 않고 확인 표시만 한다 */
    const confirmed = reconcileExpense(expenses, { amount, date, cardId: card.id });
    if (confirmed) {
      expenses = confirmed;
      skipped.push(item);
      continue;
    }

    /* 이미 자동으로 들어간 결제면 넘긴다 — 같은 결제가 두 곳에서 알려 온 것 */
    if (alreadyRecorded(expenses, { amount, date, cardId: card.id, time })
      || paidFixedHit(fixedExpenses, { amount, isCard: true, cardId: card.id, text }, eKey)) {
      skipped.push(item);
      continue;
    }

    /* 할부 회차와 같은 금액이면 자동으로 안 넣는다 — 위 설명 참고 */
    if (looksLikeInstallmentCharge(fixedExpenses, { amount, cardId: card.id }, eKey)) {
      leftover.push(item);
      continue;
    }

    /*
      카테고리는 비워 둔다. 문자에는 그 정보가 없고, 가맹점 이름으로 짐작해서
      넣으면 틀린 카테고리가 조용히 쌓인다. 미분류로 두면 내역에서 눈에 띄어
      나중에 고치게 된다.
    */
    /*
      정기결제(카드 고정지출)면 '카드반영'을 누른 것과 같게 만든다.
      isCardAdjustment를 붙여야 예산에서 두 번 세지 않는다 — fixedSumAll이
      이미 매달 이 금액을 미리 잡고 있기 때문이다.
    */
    const hitCard = matchFixed(
      { ...data, fixedExpenses },
      { amount, isCard: true, cardId: card.id, text },
      eKey,
    );

    const expenseId = "e" + (Date.now() + registered.length);
    const expense = {
      id: expenseId,
      amount,
      categoryId: null,
      date,
      memo: hitCard
        ? `${hitCard.fixed.name} · 정기결제 카드반영`
        : r.merchant || "",
      paymentMethod: "card",
      cardId: card.id,
      linkedBalanceId: null,
      auto: true,
      ...(time ? { autoTime: time } : {}),
      ...(hitCard ? { isCardAdjustment: true } : {}),
    };
    if (hitCard) markPaid(hitCard.fixed.id, expenseId, eKey);

    expenses = [...expenses, expense];
    cards = cards.map((c) =>
      c.id === card.id ? { ...c, bill: Number(c.bill || 0) + amount } : c,
    );
    registered.push(expense);
  }

  const changed = expenses !== data.expenses || cards !== data.cards
    || balanceEntries !== (data.balanceEntries || balanceEntries0) || fixedExpenses !== (data.fixedExpenses || fixedExpenses0)
    || accounts !== (data.accounts || accounts0);
  if (!changed) {
    return { next: data, registered, leftover, dropped, undone, skipped, synced };
  }
  return {
    next: { ...data, expenses, cards, balanceEntries, fixedExpenses, ...(accounts !== accounts0 ? { accounts } : {}) },
    registered,
    leftover,
    dropped,
    undone,
    skipped,
    synced,
  };
}
