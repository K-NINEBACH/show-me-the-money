import { parsePaymentText, todayISO } from "./data";

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
  어느 카드에 달 것인가.

  문구에 카드 이름의 일부가 있으면 그 카드를 쓴다("현대카드" → 이름에 '현대'가
  든 카드). 못 찾으면 **자동 등록하지 않는다** — 카드가 여럿인데 엉뚱한 카드에
  달면 카드값이 둘 다 틀어지고, 그건 눈으로 알아채기 어렵다.
  카드가 하나뿐이면 그 카드로 본다.
*/
function findCard(cards, text) {
  if (!cards || cards.length === 0) return null;
  if (cards.length === 1) return cards[0];

  for (const c of cards) {
    const key = String(c.name || "").replace(/[^가-힣A-Za-z]/g, "").slice(0, 2);
    if (key && text.includes(key)) return c;
  }
  return null;
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
  어느 통장인가. 카드와 같은 방식이다 — 이름 앞 두 글자가 문구에 있으면
  그 통장. 통장이 하나뿐이면 그것으로 본다. 못 고르면 자동으로 안 넣는다.
*/
function findAccount(accounts, text) {
  if (!accounts || accounts.length === 0) return null;
  if (accounts.length === 1) return accounts[0];
  for (const a of accounts) {
    const key = String(a.name || "").replace(/[^가-힣A-Za-z]/g, "").slice(0, 2);
    if (key && text.includes(key)) return a;
  }
  return null;
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

  for (const item of items) {
    const text = String(item?.text || "");
    const r = parsePaymentText(text);
    const amount = Number(r.amount);
    if (!amount || amount <= 0) {
      leftover.push(item);
      continue;
    }

    const card = looksLikeCardApproval(text) ? findCard(cards, text) : null;

    /*
      카드로 못 붙이면 통장 입출금으로 시도한다. 순서가 중요하다 —
      카드 승인 문구에도 '결제'가 들어가서, 은행부터 보면 카드 결제가
      통장 출금으로 잘못 들어간다.
    */
    if (!card) {
      const dir = bankDirection(text);
      const acc = dir ? findAccount(data.accounts, text) : null;
      if (!dir || !acc) {
        leftover.push(item);
        continue;
      }
      const bDate = r.date || todayISO();
      if (alreadyInLedger(balanceEntries, { amount, date: bDate, type: dir, accountId: acc.id })) {
        leftover.push(item);
        continue;
      }
      const entry = {
        id: "b" + (Date.now() + registered.length),
        type: dir,
        amount,
        date: bDate,
        memo: r.merchant || (dir === "in" ? "입금" : "출금"),
        accountId: acc.id,
        auto: true,
      };
      balanceEntries = [...balanceEntries, entry];
      registered.push(entry);
      continue;
    }

    const date = r.date || todayISO();
    if (alreadyRecorded(expenses, { amount, date, cardId: card.id })) {
      leftover.push(item);
      continue;
    }

    /*
      카테고리는 비워 둔다. 문자에는 그 정보가 없고, 가맹점 이름으로 짐작해서
      넣으면 틀린 카테고리가 조용히 쌓인다. 미분류로 두면 내역에서 눈에 띄어
      나중에 고치게 된다.
    */
    const expense = {
      id: "e" + (Date.now() + registered.length),
      amount,
      categoryId: null,
      date,
      memo: r.merchant || "",
      paymentMethod: "card",
      cardId: card.id,
      linkedBalanceId: null,
      auto: true,
    };

    expenses = [...expenses, expense];
    cards = cards.map((c) =>
      c.id === card.id ? { ...c, bill: Number(c.bill || 0) + amount } : c,
    );
    registered.push(expense);
  }

  if (registered.length === 0) {
    return { next: data, registered, leftover };
  }
  return { next: { ...data, expenses, cards, balanceEntries }, registered, leftover };
}
