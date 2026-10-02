import { autoRecordPayments, ledgerBalance, acctTailOf } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const PKG = "com.kbstar.kbbank";
const IN = "입금 3,831,930원 김*혁님 09/30 17:54 616702-**-***238 김진혁 스마트폰입금 3,831,930 잔액4,660,458";
const OUT = "출금 3,831,930원 김*혁님 09/30 17:54 529401-**-***231 김진혁 스마트폰출금 3,831,930 잔액0";
const base = (acc) => ({ accounts: [{ id: "a1", name: "국민은행", initialBalance: 828528, ...acc }, { id: "a2", name: "기업은행", initialBalance: 0 }],
  cards: [], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const at = new Date("2026-09-30T17:55:00").getTime();
check("끝자리 읽기", acctTailOf(OUT), "231");
check("전화번호는 끝자리 아님", acctTailOf("[Web발신] 010-1234-5678 출금"), "null");
// 1) 끝자리 모름 → 입금이 먼저 오면 잔액이 이어져 238을 배우고, 231 출금은 넘긴다
let r = autoRecordPayments(base({}), [{ text: IN, pkg: PKG, at }, { text: OUT, pkg: PKG, at }]);
check("238 배움", r.next.accounts[0].acctTail, "238");
check("231 출금 넘김", r.otherAcct.length, 1);
check("잔액 4,660,458", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 4660458);
// 2) 출금이 먼저 와도(끝자리 모름) 잔액이 안 이어지니 231을 배우지 않는다 — 그다음 238 입금으로 배움
r = autoRecordPayments(base({}), [{ text: OUT, pkg: PKG, at }, { text: IN, pkg: PKG, at }]);
check("출금 먼저: 231 안 배움", r.next.accounts[0].acctTail, "238");
// 3) 끝자리를 아는 통장
r = autoRecordPayments(base({ acctTail: "238" }), [{ text: OUT, pkg: PKG, at }, { text: IN, pkg: PKG, at }]);
check("아는 끝자리: 잔액 4,660,458", ledgerBalance(r.next.accounts, r.next.balanceEntries, "a1"), 4660458);
check("아는 끝자리: 기록 1건", r.registered.length, 1);
// 4) 끝자리 없는 알림은 예전처럼
r = autoRecordPayments(base({ acctTail: "238" }), [{ text: "출금 30,000원 · 김*혁님 09/30 22:54 · 카카오페이 FBS출금 30,000 잔액4,630,458", pkg: PKG, at }]);
check("끝자리 없는 알림은 그대로 기록", r.registered.length, 1);
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
