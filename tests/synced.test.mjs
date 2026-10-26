import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };

const day = 86400000;
const iso = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const md = (ms) => iso(ms).slice(5).replace("-", "/");
const base = (syncedAgoDays) => ({
  accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000 }],
  cards: [{ id: "c1", name: "현대카드(코스트코)", bill: 1000000, ...(syncedAgoDays == null ? {} : { syncedAtMs: Date.now() - syncedAgoDays * day }) }],
  categories: [], expenses: [], balanceEntries: [], fixedExpenses: [],
});
const run = (d, items) => autoRecordPayments(d, items, []);

console.log("[1] 맞춘 날보다 앞선 결제가 뒤늦게 오면 — 기록만, 카드값 그대로");
let r = run(base(2), [{ text: `현대 코스트코 승인 홍*동 58,220원 일시불 ${md(Date.now() - 7 * day)} 13:50 SKT 누적1,700,000원`, at: Date.now(), pkg: "com.samsung.android.messaging" }]);
check("기록은 남음", r.next.expenses.length, 1);
check("카드값 그대로", r.next.cards[0].bill, 1000000);
check("알림 문구용 표시", r.alreadyBilled.length, 1);

console.log("\n[2] 결제 날짜가 없는 자동납부 + 최근에 맞춤 — 기록만");
r = run(base(2), [{ text: "[현대카드] 자동납부 승인 홍*동님 SKT 09월-**86-2827 58,220원", at: Date.now(), pkg: "com.samsung.android.messaging" }]);
check("카드값 그대로", r.next.cards[0].bill, 1000000);

console.log("\n[3] 맞춘 뒤에 새로 쓴 것은 예전처럼 카드값에 더한다");
r = run(base(2), [{ text: `현대 코스트코 승인 홍*동 1,500원 일시불 ${md(Date.now())} 15:01 카카오모빌리티 누적1,705,556원`, at: Date.now(), pkg: "com.samsung.android.messaging" }]);
check("카드값 1,001,500", r.next.cards[0].bill, 1001500);

console.log("\n[4] 카드 앱과 맞춘 적이 없으면 예전 그대로");
r = run(base(null), [{ text: "[현대카드] 자동납부 승인 홍*동님 SKT 09월-**86-2827 58,220원", at: Date.now(), pkg: "com.samsung.android.messaging" }]);
check("카드값 1,058,220", r.next.cards[0].bill, 1058220);

console.log("\n[5] 맞춘 지 오래됐으면(8일) 날짜 없는 것도 더한다");
r = run(base(8), [{ text: "[현대카드] 자동납부 승인 홍*동님 SKT 09월-**86-2827 58,220원", at: Date.now(), pkg: "com.samsung.android.messaging" }]);
check("카드값 1,058,220", r.next.cards[0].bill, 1058220);

// 지난달 같은 자동납부 기록을 넣은 바탕(n일 전)
const withPrev = (syncedAgoDays, prevAgoDays) => {
  const d = base(syncedAgoDays);
  d.expenses = [{ id: "e1", amount: 58220, date: iso(Date.now() - prevAgoDays * day), memo: "SKT 08월-**86-2827", paymentMethod: "card", cardId: "c1", auto: true }];
  return d;
};
const skt = [{ text: "[현대카드] 자동납부 승인 홍*동님 SKT 09월-**86-2827 58,220원", at: Date.now(), pkg: "com.samsung.android.messaging" }];

console.log("\n[6] 날짜 없는 자동납부 — 지난달 나간 날로 짐작해 맞춘 날 뒤면 새 결제로 더한다(2026-10 SKT)");
r = run(withPrev(3, 32), skt);
check("카드값 1,058,220", r.next.cards[0].bill, 1058220);

console.log("\n[7] 날짜 없는 자동납부 — 짐작한 날이 맞춘 날보다 앞이면 기록만(2026-09 SKT가 늦게 온 경우)");
r = run(withPrev(2, 42), skt);
check("카드값 그대로", r.next.cards[0].bill, 1000000);
check("기록은 남음", r.next.expenses.length, 2);

console.log("\n[8] 고정지출(카드 정기결제)로 등록된 SKT — 자동이체일이 맞춘 날 뒤면 카드값에 더하고 처리 완료");
{
  const d = base(3);
  const mk = iso(Date.now()).slice(0, 7);
  d.fixedExpenses = [{ id: "f1", name: "SKT 통신요금", baseAmount: 58220, totalMonths: 0, startInstallment: 1, setupMonthKey: mk, overrides: {},
    paymentMethod: "card", cardId: "c1", paidMonths: {}, autoPayDay: Number(iso(Date.now()).slice(8, 10)) }];
  r = run(d, skt);
  check("카드값 1,058,220", r.next.cards[0].bill, 1058220);
  check("처리 완료 표시", !!r.next.fixedExpenses[0].paidMonths[mk], true);
}

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
