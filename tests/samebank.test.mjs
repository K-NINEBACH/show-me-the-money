import { autoRecordPayments, ledgerBalance, sameBankWithoutTail } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 같은 은행 통장 둘을 **둘 다 등록**한 경우(2026-11-21, 농협 두 개). 값은 모두 가짜.
const PKG = "nh.smart.nhallonepay.nonghyup";
const OUT_A = "출금 30,000원 홍*동님 11/20 12:00 302-****-1111-22 생활비 잔액470,000";
const IN_B = "입금 100,000원 홍*동님 11/20 12:05 352-****-3333-44 월급 잔액1,100,000";
const base = (a1 = {}, a2 = {}) => ({
  accounts: [{ id: "a1", name: "농협 생활비", initialBalance: 500000, ...a1 }, { id: "a2", name: "농협 월급", initialBalance: 1000000, ...a2 }],
  cards: [], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const at = new Date("2026-11-20T12:06:00").getTime();
// 1) 끝자리를 적어 두면 각자 통장으로
let r = autoRecordPayments(base({ acctTail: "22" }, { acctTail: "44" }), [{ text: OUT_A, pkg: PKG, at }, { text: IN_B, pkg: PKG, at }]);
check("끝자리 앎: 2건 기록", r.registered.length, 2);
check("생활비 470,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 470000);
check("월급 1,100,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a2"), 1100000);
// 2) 끝자리를 모르면 잔액이 이어지는 통장으로 배운다
r = autoRecordPayments(base(), [{ text: OUT_A, pkg: PKG, at }, { text: IN_B, pkg: PKG, at }]);
check("배움: 생활비 22", r.next.accounts[0].acctTail, "22");
check("배움: 월급 44", r.next.accounts[1].acctTail, "44");
check("배움: 생활비 470,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 470000);
check("배움: 월급 1,100,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a2"), 1100000);
// 3) 끝자리가 둘 다 안 맞으면(등록 안 한 셋째 통장) 아무 데도 안 붙인다
r = autoRecordPayments(base({ acctTail: "22" }, { acctTail: "44" }), [{ text: "출금 5,000원 홍*동님 11/20 13:00 301-****-5555-66 잔액10,000", pkg: PKG, at }]);
check("셋째 통장: 기록 0건", r.registered.length, 0);
// 4) 사람이 3자리(122)로 적어도 알림의 2자리(22)와 맞는다
r = autoRecordPayments(base({ acctTail: "122" }, { acctTail: "344" }), [{ text: OUT_A, pkg: PKG, at }]);
check("3자리로 적어도 생활비로", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 470000);
// 5) 설정 경고 — 같은 은행 둘 이상인데 끝자리 없는 통장(은행 상관없이)
const w = sameBankWithoutTail([{ name: "신한 월급" }, { name: "신한 적금", acctTail: "123" }, { name: "신한 비상금" }, { name: "국민은행" }]);
check("경고: 신한만", w.map((x) => x.bank).join(), "신한");
check("경고: 끝자리 없는 둘", w[0].names.join(), "신한 월급,신한 비상금");
check("다 적으면 경고 없음", sameBankWithoutTail([{ name: "농협 A", acctTail: "1" + "22" }, { name: "농협 B", acctTail: "344" }]).length, 0);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
