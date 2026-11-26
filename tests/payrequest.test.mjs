import { autoRecordPayments, ledgerBalance } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// '납부해 주세요' 안내 문자는 돈이 나간 게 아니다(2026-11-26, 카카오뱅크 — 안내와 실제 출금이 두 줄로 찍혔다). 값은 모두 가짜.
const base = () => ({ accounts: [{ id: "k", name: "카카오뱅크", initialBalance: 500000 }], cards: [], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const at = new Date("2026-11-20T12:06:00").getTime();
const REQS = [
  "[카카오뱅크] 홍*동님, 11월 대출이자 32,000원을 11/25까지 납부해주세요.",
  "[Web발신]\n[카카오뱅크] 신용카드 결제대금 120,000원 납부해 주세요. 결제일 11/25",
  "[카카오뱅크] 자동납부 예정 안내: 32,000원이 11/25 출금될 예정입니다. 잔액을 확인하고 납부해주시기 바랍니다.",
];
for (const t of REQS) {
  const r = autoRecordPayments(base(), [{ text: t, pkg: "com.kakao.talk", at }]);
  check("안내는 기록 안 함: " + t.slice(0, 24), r.registered.length + "/" + (r.next.balanceEntries || []).length, "0/0");
}
// 실제로 나간 알림은 그대로 기록된다
const r = autoRecordPayments(base(), [{ text: "[카카오뱅크] 출금 32,000원 대출이자 납부 11/25 09:00 잔액468,000", pkg: "com.kakao.talk", at }]);
check("실제 납부 출금은 기록", ledgerBalance(r.next.accounts, r.next.balanceEntries, "k"), 468000);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
