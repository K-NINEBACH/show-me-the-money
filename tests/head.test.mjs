import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const now = new Date(); const iso = new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const md = iso.slice(5).replace("-", "/");
const base = () => ({ accounts: [{ id: "a1", name: "국민은행", initialBalance: 0 }], cards: [{ id: "c1", name: "현대카드", bill: 0 }], categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] });
const cardOf = (r) => r.next.expenses[0]?.cardId ?? "없음";
const SAMSUNG = "com.samsung.android.messaging";

console.log("[1] 카드가 현대카드 하나뿐인데 KB국민체크 문자 — 현대카드에 붙으면 안 된다");
{ const r = autoRecordPayments(base(), [{ text: `[Web발신]\n[KB국민체크]\n홍*동님\n${md} 12:10\n57,000원 승인\n롯데마트`, pkg: "sms" }]);
  check("안 붙음(알림함)", cardOf(r), "없음"); }

console.log("\n[2] 같은 문자가 문자 앱 알림으로(제목=전화번호)");
{ const r = autoRecordPayments(base(), [{ text: `1588-1688 [Web발신] [KB국민체크] 홍*동님 ${md} 12:10 57,000원 승인 롯데마트`, pkg: SAMSUNG }]);
  check("안 붙음", cardOf(r), "없음"); }

console.log("\n[3] 현대카드 문자는 그대로 현대카드로(가맹점이 롯데마트여도)");
{ const d = base(); d.cards = [{ id: "c9", name: "롯데카드", bill: 0 }, { id: "c1", name: "현대카드", bill: 0 }];
  const r = autoRecordPayments(d, [{ text: `[Web발신]\n현대카드 승인\n홍*동\n8,800원 일시불\n${md} 11:02\n롯데마트\n누적1,100,000원`, pkg: "sms" }]);
  check("현대카드", cardOf(r), "c1"); }

console.log("\n[4] 통장이 국민은행 하나뿐인데 기업은행 출금 문자");
{ const r = autoRecordPayments(base(), [{ text: `[Web발신]\n[IBK기업]\n${md} 07:16 출금 30,000원 잔액120,000`, pkg: "sms" }]);
  check("안 붙음", r.next.balanceEntries.length, 0); }

console.log("\n[5] 국민은행 출금 문자('[KB]'로 시작)는 국민은행으로");
{ const d = base(); d.accounts.push({ id: "a2", name: "기업은행", initialBalance: 0 });
  const r = autoRecordPayments(d, [{ text: `[Web발신]\n[KB]${md} 12:00\n123456**789\n출금\n30,000\n잔액1,000,000원`, pkg: "sms" }]);
  check("국민은행", r.next.balanceEntries.find((b) => !b.isAdjustment)?.accountId ?? "없음", "a1"); }

console.log("\n[6] 카드 이름을 별명으로 지은 사람 — 현대카드 문자는 여전히 그 하나뿐인 카드로");
{ const d = base(); d.cards = [{ id: "c7", name: "주카드", bill: 0 }];
  const r = autoRecordPayments(d, [{ text: `[Web발신]\n현대카드 승인\n홍*동\n8,800원 일시불\n${md} 11:02\n이마트24`, pkg: "sms" }]);
  check("주카드", cardOf(r), "c7"); }

console.log("\n[7] 간편결제 '결제 완료' 문자는 카드 결제로 넣지 않는다(포인트·머니일 수 있다)");
{ const r = autoRecordPayments(base(), [{ text: `[Web발신]\n[네이버페이] 결제 완료\n12,000원\n${md} 10:00\n스마트스토어`, pkg: "sms" }]);
  check("안 넣음", r.registered.length, 0); }

console.log("\n[8] 카드사 앱 알림(보낸 앱이 카드사)은 예전처럼");
{ const r = autoRecordPayments(base(), [{ text: `현대카드 승인 홍*동 8,800원 일시불 ${md} 11:02 이마트24`, pkg: "com.hyundaicard.appcard" }]);
  check("현대카드", cardOf(r), "c1"); }

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
