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

/** 이 말이 있으면 지출이 아니다 — 취소·환불·안내 문구 */
const NEGATIVE = /취소|환불|거절|실패|누적|한도|승인취소|출금취소/;

/** 이 말이 있어야 결제다 */
const POSITIVE = /승인|결제/;

/** 카드 결제로 보이나 */
function looksLikeCardApproval(text) {
  if (!POSITIVE.test(text)) return false;
  if (NEGATIVE.test(text)) return false;
  return true;
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
  { re: /ibk/, keys: ["기업", "IBK", "ibk"] },
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
function findByIssuerOrText(list, text, pkg) {
  const issuer = issuerOf(pkg);
  if (issuer) return pickByKeys(list, issuer.keys);
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
  if (!cards || cards.length === 0) return null;
  if (cards.length === 1) return cards[0];

  return findByIssuerOrText(cards, text, pkg);
}

/** 통장 입출금으로 보이나 */
const IN_WORDS = /입금|이체입금|받으심/;
const OUT_WORDS = /출금|이체출금|자동이체|납부/;

function bankDirection(text) {
  if (NEGATIVE.test(text)) return null;
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
  if (!accounts || accounts.length === 0) return null;
  if (accounts.length === 1) return accounts[0];
  return findByIssuerOrText(accounts, text, pkg);
}

/*
  이미 들어와 있는 입출금인가.

  **앱이 스스로 만든 것과 겹치는 걸 막는 자리다.** 카드값 결제·고정지출
  출금처리·대리결제 정산이 전부 여기 걸린다. 같은 날 같은 금액을 진짜로
  두 번 옮겼다면 두 번째는 알림함에 남으니 사람이 보고 넣으면 된다 —
  반대 방향(두 번 빠지는 것)은 되돌리기가 훨씬 어렵다.
*/
function alreadyInLedger(entries, { amount, date, type, accountId }) {
  return (entries || []).some(
    (b) =>
      Number(b.amount) === Number(amount) &&
      b.date === date &&
      b.type === type &&
      (accountId ? (b.accountId || null) === accountId : true),
  );
}

/*
  이미 들어와 있는 지출인가.

  같은 날·같은 금액·같은 카드면 같은 건으로 본다. 정기결제를 앱에서 '카드반영'
  으로 넣어 두었는데 카드사 승인 문자가 따로 오는 경우가 있고, 그때 둘 다
  들어가면 그 달 지출이 두 배로 잡힌다.

  놓칠 위험(같은 날 같은 금액을 진짜로 두 번 쓴 경우)도 있지만, 그때는 알림함에
  남아서 사람이 보고 넣으면 된다. 반대 방향의 실수는 되돌리기 어렵다.
*/
function alreadyRecorded(expenses, { amount, date, cardId }) {
  return expenses.some(
    (e) =>
      Number(e.amount) === Number(amount) &&
      e.date === date &&
      (e.cardId || null) === (cardId || null),
  );
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
 * @returns {{ next: object, registered: object[], leftover: object[] }}
 *   next      바뀐 데이터(넣은 게 없으면 원본 그대로)
 *   registered 자동으로 넣은 항목들
 *   leftover  자동으로 못 넣어 알림함에 남길 것들
 */
export function autoRecordPayments(data, items) {
  const registered = [];
  const leftover = [];

  let expenses = data.expenses;
  let cards = data.cards;
  let balanceEntries = data.balanceEntries || [];
  let fixedExpenses = data.fixedExpenses || [];

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

  for (const item of items) {
    const text = String(item?.text || "");
    const r = parsePaymentText(text);
    const amount = Number(r.amount);
    if (!amount || amount <= 0) {
      leftover.push(item);
      continue;
    }

    const pkg = item?.pkg;
    const card = looksLikeCardApproval(text) ? findCard(cards, text, pkg) : null;

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
      if (alreadyInLedger(balanceEntries, { amount, date: bDate, type: dir, accountId: acc.id })) {
        leftover.push(item);
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
        ...(hitOut ? { linkedFixedId: hitOut.fixed.id, linkedFixedMonth: bKey } : {}),
      };
      balanceEntries = [...balanceEntries, entry];
      if (hitOut) markPaid(hitOut.fixed.id, entryId, bKey);
      registered.push(entry);
      continue;
    }

    const date = r.date || todayISO();
    const eKey = keyOf(date);
    if (alreadyRecorded(expenses, { amount, date, cardId: card.id })) {
      leftover.push(item);
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
      ...(hitCard ? { isCardAdjustment: true } : {}),
    };
    if (hitCard) markPaid(hitCard.fixed.id, expenseId, eKey);

    expenses = [...expenses, expense];
    cards = cards.map((c) =>
      c.id === card.id ? { ...c, bill: Number(c.bill || 0) + amount } : c,
    );
    registered.push(expense);
  }

  if (registered.length === 0) {
    return { next: data, registered, leftover };
  }
  return {
    next: { ...data, expenses, cards, balanceEntries, fixedExpenses },
    registered,
    leftover,
  };
}
