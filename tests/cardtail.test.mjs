import { autoRecordPayments, cardTailOf, cardTailMatches, sameBankWithoutTail } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 같은 카드사 카드 여러 장(2026-11-21). 값은 모두 가짜.
const now = new Date(); const iso = new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const md = iso.slice(5).replace("-", "/");
const SH = (tail, amt) => `[Web발신]\n신한카드(${tail})승인 홍*동 ${amt}원(일시불)${md} 12:10 스타벅스 누적100,000원`;
const KB = (tail, amt) => `[Web발신]\nKB국민카드${tail}승인\n홍*동님\n${amt}원 일시불\n${md} 13:20\nGS25`;
const base = (cards) => ({ accounts: [{ id: "a1", name: "국민은행", initialBalance: 0 }], cards, categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const cardOf = (r) => r.next.expenses[0]?.cardId ?? "없음";

check("신한 끝번호 읽기", cardTailOf(SH("1234", "5,000")), "1234");
check("KB 가린 끝번호 읽기", cardTailOf(KB("1*2*", "5,000")), "1*2*");
check("삼성 붙은 번호", cardTailOf(`[Web발신]\n삼성5678승인 홍*동\n12,000원 일시불`), "5678");
check("금액·시각은 끝번호 아님", cardTailOf(`[Web발신]\n현대카드 승인\n홍*동\n8,800원 일시불\n${md} 11:02`), "null");
check("가린 자리는 건너뛰고 맞춤", cardTailMatches("1324", "1*2*"), true);
check("다르면 안 맞음", cardTailMatches("9324", "1*2*"), false);

const twoSH = [{ id: "c1", name: "신한 신용카드", bill: 0, cardTail: "1234" }, { id: "c2", name: "신한 체크카드", bill: 0, cardTail: "5678" }];
let r = autoRecordPayments(base(twoSH), [{ text: SH("5678", "5,000"), pkg: "sms" }]);
check("신한 둘: 5678 → 체크", cardOf(r), "c2");
r = autoRecordPayments(base(twoSH), [{ text: SH("1234", "6,000"), pkg: "sms" }]);
check("신한 둘: 1234 → 신용", cardOf(r), "c1");
r = autoRecordPayments(base([{ id: "c1", name: "신한 신용카드", bill: 0 }, { id: "c2", name: "신한 체크카드", bill: 0 }]), [{ text: SH("5678", "5,000"), pkg: "sms" }]);
check("끝자리 다 모르면 안 붙임(알림함)", cardOf(r), "없음");
r = autoRecordPayments(base([{ id: "c1", name: "신한 신용카드", bill: 0, cardTail: "1234" }, { id: "c2", name: "신한 체크카드", bill: 0 }]), [{ text: SH("5678", "5,000"), pkg: "sms" }]);
check("하나만 적었고 안 맞으면 나머지 한 장", cardOf(r), "c2");
const twoKB = [{ id: "k1", name: "KB국민 노리", bill: 0, cardTail: "1324" }, { id: "k2", name: "KB국민 체크", bill: 0, cardTail: "9999" }];
r = autoRecordPayments(base(twoKB), [{ text: KB("1*2*", "7,000"), pkg: "sms" }]);
check("KB 가린 번호로 노리", cardOf(r), "k1");
r = autoRecordPayments(base([{ id: "c1", name: "현대카드", bill: 0 }, { id: "c2", name: "신한카드", bill: 0 }]), [{ text: SH("1234", "5,000"), pkg: "sms" }]);
check("카드사 다르면 예전처럼", cardOf(r), "c2");
check("카드 경고", sameBankWithoutTail([{ name: "신한 신용카드" }, { name: "신한 체크카드", cardTail: "5678" }], "cardTail")[0]?.names.join(), "신한 신용카드");
// 새로 넣은 은행: 새마을금고 문자가 그 통장으로
r = autoRecordPayments({ accounts: [{ id: "m1", name: "새마을금고", initialBalance: 100000 }, { id: "a1", name: "국민은행", initialBalance: 0 }], cards: [], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] },
  [{ text: `[Web발신]\n[MG새마을금고] 출금 30,000원 ${md} 14:00 잔액70,000`, pkg: "sms" }]);
check("새마을금고 출금 → 새마을금고 통장", r.next.balanceEntries[0]?.accountId ?? "없음", "m1");
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
