import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };

// 오늘 = 2026-09-17 (이 시험은 그날 기준으로 쓴 것 — 다른 날 돌리면 '이번 달'이 달라진다)
const today = new Date();
const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const dd = `${mk}-${String(today.getDate()).padStart(2, "0")}`;
const md = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;

const base = (bill, uses = []) => ({
  accounts: [{ id: "a1", name: "국민은행" }],
  cards: [{ id: "c1", name: "현대카드(코스트코)", bill }],
  categories: [], balanceEntries: [], fixedExpenses: [],
  expenses: uses.map((a, i) => ({ id: "e" + i, amount: a, categoryId: null, date: dd, memo: "가맹점", paymentMethod: "card", cardId: "c1" })),
});
const paidSms = (won) => ({ text: `[현대 코스트코] 김*혁님 ${md} ${won.toLocaleString("en-US")}원이 입금되었습니다`, at: Date.now(), pkg: "com.samsung.android.messaging" });
const run = (data, items) => autoRecordPayments(data, items, []);

console.log("[1] 일부만 낸 결제 — 낸 만큼만 뺀다");
// 카드값 1,436,686(이번 달 사용분 300,000 포함)에서 566,020을 미리 냄
let r = run(base(1436686, [200000, 100000]), [paidSms(566020)]);
check("남은 카드값", r.next.cards[0].bill, 1436686 - 566020);
check("일부 결제로 봄", r.settled[0].partial, true);

console.log("\n[2] 청구된 몫을 전액 낸 결제 — 이번 달 사용분으로 다시 잡는다");
// 청구돼 있던 몫 = 1,436,686 − 300,000 = 1,136,686 을 그대로 냄
r = run(base(1436686, [200000, 100000]), [paidSms(1136686)]);
check("남은 카드값 = 이번 달 사용분", r.next.cards[0].bill, 300000);
check("전액 결제로 봄", r.settled[0].partial, false);

console.log("\n[3] 같은 결제가 문자와 통장 알림 두 길로 와도 한 번만");
const bankOut = { text: `출금 566,020원 김*혁님 ${md} 19:15 616702-**-***238 코스트코현대 오픈뱅킹출금 566,020 잔액720,155`, at: Date.now(), pkg: "com.kbstar.kbbank" };
r = run(base(1436686, [300000]), [paidSms(566020), bankOut]);
check("두 번 빼지 않음", r.next.cards[0].bill, 1436686 - 566020);
check("두 번째는 넘김", r.dupPaid.length, 1);

console.log("\n[4] 통장 출금 알림만 와도 '코스트코현대'로 알아본다");
r = run(base(1436686, [300000]), [bankOut]);
check("카드값에서 뺌", r.next.cards[0].bill, 1436686 - 566020);
check("통장 출금도 그대로 기록(잔액 맞춤 기록은 거래가 아니라 뺀다)", r.next.balanceEntries.filter((b) => !b.isAdjustment).length, 1);

console.log("\n[5] 한 달 일찍 내는 카드(롯데)는 예전대로 전액 결제");
const lotte = {
  accounts: [{ id: "a1", name: "국민은행" }],
  cards: [{ id: "c2", name: "롯데카드", bill: 3993, earlyPay: true }],
  categories: [], balanceEntries: [], expenses: [],
  fixedExpenses: [{ id: "so", name: "쏘렌토 할부", baseAmount: 849720, totalMonths: 60, startInstallment: 29, setupMonthKey: mk, overrides: {}, paymentMethod: "card", cardId: "c2", paidMonths: {} }],
};
r = run(lotte, [{ text: `[롯데카드] 김*혁님 ${md} 850,367원이 입금되었습니다`, at: Date.now(), pkg: "com.lcacApp" }]);
check("카드값 0", r.next.cards[0].bill, 0);
check("이번 달 할부는 낸 것으로", r.next.cards[0].installPaid[mk], 850367);

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
