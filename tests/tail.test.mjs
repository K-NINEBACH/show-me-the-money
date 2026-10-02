import { autoRecordPayments, ledgerBalance, acctTailOf } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 같은 은행 통장이 둘(끝자리 222 · 333)일 때 — 내 통장끼리 옮기면 입금·출금 알림이 같은 분에 온다. 값은 모두 가짜.
const PKG = "com.kbstar.kbbank";
const IN = "입금 1,234,000원 홍*동님 09/30 17:54 111111-**-***222 홍길동 스마트폰입금 1,234,000 잔액2,234,000";
const OUT = "출금 1,234,000원 홍*동님 09/30 17:54 222222-**-***333 홍길동 스마트폰출금 1,234,000 잔액0";
const base = (acc) => ({ accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000, ...acc }, { id: "a2", name: "기업은행", initialBalance: 0 }],
  cards: [], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const at = new Date("2026-09-30T17:55:00").getTime();
check("끝자리 읽기", acctTailOf(OUT), "333");
check("전화번호는 끝자리 아님", acctTailOf("[Web발신] 010-1234-5678 출금"), "null");
// 1) 끝자리 모름 → 입금이 먼저 오면 잔액이 이어져 222를 배우고, 333 출금은 넘긴다
let r = autoRecordPayments(base({}), [{ text: IN, pkg: PKG, at }, { text: OUT, pkg: PKG, at }]);
check("222 배움", r.next.accounts[0].acctTail, "222");
check("333 출금 넘김", r.otherAcct.length, 1);
check("잔액 2,234,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 2234000);
// 2) 출금이 먼저 와도(끝자리 모름) 잔액이 안 이어지니 333을 배우지 않는다 — 그다음 222 입금으로 배움
r = autoRecordPayments(base({}), [{ text: OUT, pkg: PKG, at }, { text: IN, pkg: PKG, at }]);
check("출금 먼저: 333 안 배움", r.next.accounts[0].acctTail, "222");
// 3) 끝자리를 아는 통장
r = autoRecordPayments(base({ acctTail: "222" }), [{ text: OUT, pkg: PKG, at }, { text: IN, pkg: PKG, at }]);
check("아는 끝자리: 잔액 2,234,000", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 2234000);
check("아는 끝자리: 기록 1건", r.registered.length, 1);
// 4) 끝자리 없는 알림은 예전처럼
r = autoRecordPayments(base({ acctTail: "222" }), [{ text: "출금 30,000원 · 홍*동님 09/30 22:54 · 카카오페이 FBS출금 30,000 잔액970,000", pkg: PKG, at }]);
check("끝자리 없는 알림은 그대로 기록", r.registered.length, 1);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
