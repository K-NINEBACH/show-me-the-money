import { personalView, potSummary, isPotExpense, potIds } from "../src/lib/data.js";
import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 따로 보는 통장(데이트 통장, 2026-11-22). 값은 모두 가짜.
const d = {
  accounts: [{ id: "k", name: "케이뱅크", initialBalance: 1000000 }, { id: "p", name: "카카오뱅크 데이트", initialBalance: 300000, pot: true }],
  cards: [{ id: "c1", name: "신한카드", bill: 0 }, { id: "c2", name: "카카오뱅크 체크", bill: 0, pot: true }],
  categories: [], fixedExpenses: [
    { id: "f1", name: "데이트 통장 보내기", baseAmount: 200000, accountId: "k", paymentMethod: "cash", paidMonths: {} },
    { id: "f2", name: "데이트 구독", baseAmount: 10000, cardId: "c2", paymentMethod: "card", paidMonths: {} },
  ],
  expenses: [
    { id: "e1", date: "2026-11-10", amount: 20000, paymentMethod: "card", cardId: "c1" },
    { id: "e2", date: "2026-11-11", amount: 50000, paymentMethod: "card", cardId: "c2" },
    { id: "e3", date: "2026-11-12", amount: 7000, paymentMethod: "cash", linkedBalanceId: "b2" },
  ],
  balanceEntries: [
    { id: "b1", type: "out", amount: 200000, date: "2026-11-05", accountId: "k" },
    { id: "b1b", type: "in", amount: 200000, date: "2026-11-05", accountId: "p" },
    { id: "b2", type: "out", amount: 7000, date: "2026-11-12", accountId: "p" },
  ],
};
const v = personalView(d);
check("내 통장만", v.accounts.map((a) => a.id).join(","), "k");
check("내 카드만", v.cards.map((c) => c.id).join(","), "c1");
check("내 지출만", v.expenses.map((e) => e.id).join(","), "e1");
check("내 입출금만", v.balanceEntries.map((b) => b.id).join(","), "b1");
check("내 고정지출만", v.fixedExpenses.map((f) => f.id).join(","), "f1");
const s = potSummary(d, "2026-11");
check("데이트 잔액 = 300,000 + 200,000 − 7,000", s.balance, 493000);
check("데이트 이번 달 쓴 돈 = 카드 50,000 + 현금 7,000", s.spent, 57000);
check("데이트 이번 달 들어온 돈 = 통장 입금 합(내 통장 입금은 안 셈)", s.inSum + "/" + s.inCount, "200000/1");
{
  const d2 = { ...d, balanceEntries: [...d.balanceEntries,
    { id: "adj", type: "in", amount: 5000, date: "2026-11-20", accountId: "p", isAdjustment: true },
    { id: "old", type: "in", amount: 9000, date: "2026-10-20", accountId: "p" },
    { id: "in2", type: "in", amount: 150000, date: "2026-11-21", accountId: "p" }] };
  check("잔액 맞춤·지난달 입금은 빼고 이번 달 입금만 합", potSummary(d2, "2026-11").inSum, 350000);
}
check("현금 지출이 데이트 통장 것인지", isPotExpense(d.expenses[2], d, potIds(d)), true);
// 따로 보기가 없으면 그대로
const plain = { ...d, accounts: d.accounts.map(({ pot, ...a }) => a), cards: d.cards.map(({ pot, ...c }) => c) };
check("따로 보기 없으면 같은 객체", personalView(plain) === plain, true);
check("따로 보기 없으면 요약 없음", potSummary(plain, "2026-11"), null);
// 첫 통장이 데이트 통장이고 통장 안 적힌 입출금 → 데이트 통장 것으로 빠짐(엉뚱하게 내 통장으로 안 넘어감)
const d2 = { ...d, accounts: [d.accounts[1], d.accounts[0]], balanceEntries: [{ id: "x", type: "in", amount: 1, date: "2026-11-01" }] };
check("통장 안 적힌 입출금은 원래 첫 통장(데이트)으로", personalView(d2).balanceEntries.length, 0);
// 카카오뱅크 체크카드 알림은 그대로 그 카드에 붙는다(기록은 그대로, 보기만 나눔)
const at = new Date("2026-11-20T19:00:00").getTime();
const r = autoRecordPayments(d, [{ text: "[카카오뱅크] 카카오뱅크 체크(1234) 승인 32,000원 11/20 19:00 고깃집", pkg: "", at }]);
const got = r.next.expenses.find((e) => Number(e.amount) === 32000);
check("데이트 카드 결제가 그 카드로", got && got.cardId, "c2");
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
