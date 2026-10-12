import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 할부로 자동 등록된 결제(2026-10 면세점 294,148원 3개월)를 취소하면 그 할부 항목이 사라진다
const HY = "com.hyundaicard.appcard";
const data = () => ({ accounts: [], cards: [{ id: "c1", name: "현대카드(코스트코)", bill: 100000 }], categories: [], expenses: [], balanceEntries: [],
  fixedExpenses: [{ id: "f1", name: "면세점한국 할부", baseAmount: 98050, totalMonths: 3, startInstallment: 1, setupMonthKey: "2026-09", overrides: {}, paymentMethod: "card", cardId: "c1", paidMonths: {}, auto: true, purchaseAmount: 294148 }] });
console.log("[1] 카드 취소 알림 → 할부 항목 삭제");
let r = autoRecordPayments(data(), [{ text: "[현대카드] 취소 294,148원 현대면세점한국", pkg: HY, at: Date.now() }], []);
check("할부 항목이 지워짐", r.next.fixedExpenses.length, 0);
check("카드값은 그대로", r.next.cards[0].bill, 100000);
console.log("[2] 금액이 다르면 건드리지 않는다");
r = autoRecordPayments(data(), [{ text: "[현대카드] 취소 12,000원 어떤가게", pkg: HY, at: Date.now() }], []);
check("할부 항목 그대로", r.next.fixedExpenses.length, 1);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
