import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };

// 오늘이 며칠이든 같은 결과가 나오게, 알림의 날짜를 글로 박아 쓴다(자동 기록은 문구의 날짜를 쓴다)
const today = new Date();
const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const nk = today.getMonth() === 11 ? `${today.getFullYear() + 1}-01` : `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, "0")}`;
const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
const md = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(Math.max(20, Math.min(last, today.getDate()))).padStart(2, "0")}`;

const base = (paidThis) => ({
  accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000 }],
  cards: [{ id: "c1", name: "현대카드", bill: 0 }], categories: [], expenses: [],
  balanceEntries: paidThis ? [{ id: "b0", type: "out", amount: 100000, date: `${mk}-05`, memo: "가족모임 자동이체", accountId: "a1", linkedFixedId: "f1", linkedFixedMonth: mk }] : [],
  fixedExpenses: [{ id: "f1", name: "가족모임", baseAmount: 100000, totalMonths: 0, startInstallment: 1, setupMonthKey: mk, overrides: {},
    paymentMethod: "cash", accountId: "a1", paidMonths: paidThis ? { [mk]: "b0" } : {} }],
});
const alert = (day) => ({ text: `출금 100,000원 김*혁님 ${day} 19:15 616702-**-***238 가족모임 잔액900,000`, at: Date.now(), pkg: "com.kbstar.kbbank" });

console.log("[1] 이번 달 것을 이미 냈는데 월말에 또 나가면 → 다음 달 몫");
let r = autoRecordPayments(base(true), [alert(md)], []);
check("다음 달로 처리 표시", !!r.next.fixedExpenses[0].paidMonths[nk], true);
check("이번 달 표시는 그대로", r.next.fixedExpenses[0].paidMonths[mk], "b0");
const e = r.next.balanceEntries.find((b) => b.linkedFixedMonth === nk);
check("출금 기록에 '몫 미리' 표시", /몫 미리/.test(e?.memo || ""), true);

console.log("\n[2] 이번 달 것을 아직 안 냈으면 → 이번 달 몫(예전 그대로)");
r = autoRecordPayments(base(false), [alert(md)], []);
check("이번 달로 처리", !!r.next.fixedExpenses[0].paidMonths[mk], true);
check("다음 달은 그대로", !r.next.fixedExpenses[0].paidMonths[nk], true);

console.log("\n[3] 달 초(19일 이전)에 또 나간 건 다음 달 몫으로 안 본다");
r = autoRecordPayments(base(true), [alert(`${String(today.getMonth() + 1).padStart(2, "0")}/05`)], []);
check("다음 달로 안 적음", !r.next.fixedExpenses[0].paidMonths[nk], true);

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
