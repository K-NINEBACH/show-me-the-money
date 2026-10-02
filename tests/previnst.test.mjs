import { autoRecordPayments } from "../src/lib/auto-record.js";
import { monthKeyOffset } from "../src/lib/data.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const today = new Date();
const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const pk = monthKeyOffset(mk, -1);
const md = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
const base = (bill, installPaid) => ({
  accounts: [{ id: "a1", name: "국민은행" }],
  cards: [{ id: "c1", name: "현대카드(코스트코)", bill, payDay: 12, ...(installPaid ? { installPaid } : {}) }],
  categories: [], balanceEntries: [], expenses: [],
  fixedExpenses: [{ id: "f1", name: "데스크탑 할부", baseAmount: 96418, totalMonths: 12, startInstallment: 4, setupMonthKey: pk,
    overrides: { [mk]: 95162 }, paymentMethod: "card", cardId: "c1", paidMonths: {} }],
});
const sms = (won) => ({ text: `[현대 코스트코] 김*혁님 ${md} ${won.toLocaleString("en-US")}원이 입금되었습니다`, at: Date.now(), pkg: "com.samsung.android.messaging" });
let r = autoRecordPayments(base(1300000), [sms(1300000)], []);
check("일시불만 냄 → 카드값 0", r.next.cards[0].bill, 0);
check("일시불만 냄 → 지난달 할부는 아직", r.next.cards[0].installPaid?.[pk], undefined);
check("일시불만 냄 → 전액(일부 아님)", r.settled[0].partial, false);
r = autoRecordPayments(base(0), [sms(96418)], []);
check("할부 몫만 냄 → 지난달 몫 낸 것으로", r.next.cards[0].installPaid?.[pk], 96418);
check("할부 몫만 냄 → 카드값 그대로", r.next.cards[0].bill, 0);
check("할부 몫만 냄 → 일부 결제로 안 봄", r.settled[0].partial, false);
r = autoRecordPayments(base(1300000), [sms(1396418)], []);
check("둘 다 냄 → 카드값 0", r.next.cards[0].bill, 0);
check("둘 다 냄 → 지난달 몫 낸 것으로", r.next.cards[0].installPaid?.[pk], 96418);
r = autoRecordPayments(base(1300000, { [pk]: 96418 }), [sms(500000)], []);
check("일부 결제는 예전처럼 낸 만큼", r.next.cards[0].bill, 800000);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
