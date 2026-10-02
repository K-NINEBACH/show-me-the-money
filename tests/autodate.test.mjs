import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };

const iso = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const yesterday = Date.now() - 24 * 3600 * 1000;
const base = () => ({
  accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000 }],
  cards: [{ id: "c1", name: "현대카드(코스트코)", bill: 0 }],
  categories: [], expenses: [], balanceEntries: [], fixedExpenses: [],
});

console.log("[1] 날짜가 없는 자동납부 문자 — 알림이 온 날(어제)로 적는다");
let r = autoRecordPayments(base(), [{ text: "[현대카드] 자동납부 승인 홍*동님 SKT 09월-**86-2827 58,220원", at: yesterday, pkg: "com.samsung.android.messaging" }], []);
check("기록됨", r.next.expenses.length, 1);
check("어제 날짜", r.next.expenses[0]?.date, iso(yesterday));

console.log("\n[2] 문구에 날짜가 있으면 그 날짜가 이긴다");
r = autoRecordPayments(base(), [{ text: "현대 코스트코 승인 홍*동 1,500원 일시불 09/21 15:01 카카오모빌리티 누적1,705,556원", at: Date.now(), pkg: "com.samsung.android.messaging" }], []);
check("문구의 09/21", String(r.next.expenses[0]?.date).slice(5), "09-21");

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
