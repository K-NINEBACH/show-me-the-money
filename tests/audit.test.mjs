/*
  **같은 돈이 두 번 잡히는 길이 또 없나**(2026-09-22 사용자 요청). 카드값(bill)을 건드리는
  모든 경로를 한 번씩 밟아 본다. 특히 '카드 앱 숫자로 맞춘 뒤'에 뒤늦게 오는 알림들.
*/
import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };

const day = 86400000;
const iso = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const md = (ms) => iso(ms).slice(5).replace("-", "/");
const now = Date.now();
const mk = iso(now).slice(0, 7);
const prevMonth = Number(mk.slice(5, 7)) === 1 ? 12 : Number(mk.slice(5, 7)) - 1;

const card = (extra = {}) => ({ id: "c1", name: "현대카드(코스트코)", bill: 1000000, ...extra });
const data = (cards, more = {}) => ({
  accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000 }],
  cards, categories: [{ id: "t", name: "교통" }], expenses: [], balanceEntries: [], fixedExpenses: [], ...more,
});
const sms = (text, at = now) => ({ text, at, pkg: "com.samsung.android.messaging" });
const run = (d, items) => autoRecordPayments(d, items, []);

console.log("[1] 대중교통 한 달 합계가 카드 앱과 맞춘 뒤에 오면");
let r = run(data([card({ syncedAtMs: now - 2 * day })]), [sms(`[현대카드] ${prevMonth}월 버스+지하철 이용금액은 총 48,600원입니다`)]);
check("기록은 남음", r.next.expenses.length, 1);
check("카드값은 그대로(이미 그 숫자에 들어 있음)", r.next.cards[0].bill, 1000000);

console.log("\n[2] 맞춘 적이 없으면 대중교통 합계는 예전처럼 카드값에 더한다");
r = run(data([card()]), [sms(`[현대카드] ${prevMonth}월 버스+지하철 이용금액은 총 48,600원입니다`)]);
check("카드값 1,048,600", r.next.cards[0].bill, 1048600);

console.log("\n[3] 할부 결제 문자는 카드값에 안 더한다(할부는 고정지출로 센다)");
r = run(data([card()]), [sms(`현대 코스트코 승인 김*혁 1,200,000원 12개월 할부 ${md(now)} 12:00 하이마트 누적1,700,000원`)]);
check("카드값 그대로", r.next.cards[0].bill, 1000000);
check("할부 고정지출로", (r.next.fixedExpenses || []).length, 1);

console.log("\n[4] 같은 결제가 문자와 카드 앱 푸시로 두 번 와도 한 번만");
const one = `현대 코스트코 승인 김*혁 30,000원 일시불 ${md(now)} 12:00 가맹점 누적1,700,000원`;
r = run(data([card()]), [sms(one), { text: one, at: now, pkg: "com.hyundaicard.appcard" }]);
check("한 건만 기록", r.next.expenses.length, 1);
check("카드값 1,030,000", r.next.cards[0].bill, 1030000);

console.log("\n[5] 카드값 결제 확인 뒤 같은 금액 출금 알림이 와도 두 번 안 뺀다");
r = run(data([card({ bill: 500000 })], { expenses: [] }), [
  sms(`[현대 코스트코] 김*혁님 ${md(now)} 500,000원이 입금되었습니다`),
  { text: `출금 500,000원 김*혁님 ${md(now)} 19:15 616702-**-***238 코스트코현대 오픈뱅킹출금 500,000`, at: now, pkg: "com.kbstar.kbbank" },
]);
check("카드값 0(한 번만 반영)", r.next.cards[0].bill, 0);

console.log("\n[6] 결제 취소가 오면 그만큼 되돌린다(두 번 빼지 않게 이번 달·자동만)");
r = run(data([card()]), [sms(`현대 코스트코 승인 김*혁 20,000원 일시불 ${md(now)} 12:00 가맹점 누적1,700,000원`)]);
const after = autoRecordPayments(r.next, [sms(`현대 코스트코 승인취소 김*혁 20,000원 ${md(now)} 12:30 가맹점`)], []);
check("기록이 빠짐", after.next.expenses.length, 0);
check("카드값 되돌아옴", after.next.cards[0].bill, 1000000);

console.log("\n[7] 지난달 날짜의 결제 확인 문자는 카드값을 되돌리지 않는다");
const lastMonthDay = `${String(prevMonth).padStart(2, "0")}/28`;
r = run(data([card({ bill: 700000 })]), [sms(`[현대 코스트코] 김*혁님 ${lastMonthDay} 700,000원이 입금되었습니다`)]);
check("카드값 그대로", r.next.cards[0].bill, 700000);

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
