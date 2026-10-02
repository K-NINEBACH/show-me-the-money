import { autoRecordPayments } from "../src/lib/auto-record.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const Y = new Date().getFullYear();
const cur = new Date(); const K = `${Y}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
const mm = K.slice(5);
const SAMSUNG = "com.samsung.android.messaging";
const base = () => ({
  accounts: [{ id: "a1", name: "국민은행", initialBalance: 0 }, { id: "a2", name: "기업은행", initialBalance: 0 }],
  cards: [{ id: "c1", name: "현대카드(코스트코)", bill: 1500000 }, { id: "c2", name: "롯데카드", bill: 0 }],
  categories: [{ id: "t", name: "교통" }],
  expenses: [
    { id: "e1", amount: 63300, date: `${K}-01`, memo: "쿠팡", paymentMethod: "card", cardId: "c1", auto: true },
    { id: "e2", amount: 30000, date: `${K}-02`, memo: "구글", paymentMethod: "card", cardId: "c1", auto: true },
    { id: "e0", amount: 700000, date: `${Y}-01-15`, memo: "예전 것", paymentMethod: "card", cardId: "c1" }],
  balanceEntries: [], fixedExpenses: [] });
const run = (d, text, pkg = SAMSUNG) => autoRecordPayments(d, [{ text, pkg }]);

console.log("[1] 승인 문자 — 그대로 자동 기록");
{ const r = run(base(), `현대카드 현대 코스트코 승인 김*혁 63,300원 일시불 ${mm}/03 10:44 쿠팡 누적2,234,775원`);
  check("기록", r.registered.length, 1);
  check("현대카드", r.next.expenses.slice(-1)[0].cardId, "c1"); }

console.log("\n[2] 카드값 결제 확인 '입금되었습니다' — 통장 입금 아님, 카드값을 이번 달 사용분으로");
{ const r = run(base(), `코스트코 리워드 현대카드 [현대 코스트코] 김*혁님 ${mm}/02 841,510원이 입금되었습니다`);
  check("통장 입금으로 안 넣음", r.next.balanceEntries.length, 0);
  check("알림함에 안 남음", r.leftover.length, 0);
  check("결제 확인 1건", r.settled.length, 1);
  check("일부 결제(2026-09-17 규칙) — 낸 만큼만 빼서 658,490", r.next.cards[0].bill, 658490);
  check("paidAtMs 적힘", !!r.next.cards[0].paidAtMs, true);
  check("롯데카드는 그대로", r.next.cards[1].bill, 0);
  const r2 = autoRecordPayments(r.next, [{ text: `[현대 코스트코] 김*혁님 ${mm}/02 606,314원이 입금되었습니다`, pkg: SAMSUNG }]);
  check("나눠 낸 두 번째는 또 그만큼 빠짐 52,176", r2.next.cards[0].bill, 52176); }

console.log("\n[3] 은행 입금 알림은 예전처럼 통장으로");
{ const r = run(base(), `[KB]${mm}/02 12:00 123456**789 입금 50,000 잔액1,050,000원`, "sms");
  check("국민은행 입금", r.next.balanceEntries.find((b) => !b.isAdjustment)?.accountId, "a1");
  check("결제 확인 아님", r.settled.length, 0); }

console.log("\n[4] 대중교통 한 달 합계");
{ const prevMo = cur.getMonth() === 0 ? 12 : cur.getMonth();
  const pY = cur.getMonth() === 0 ? Y - 1 : Y;
  const pK = `${pY}-${String(prevMo).padStart(2, "0")}`;
  const r = run(base(), `[현대카드] 김*혁님 ${String(prevMo).padStart(2, "0")}월 버스+지하철 이용금액은 총 48,600원입니다`);
  const t = r.next.expenses.find((e) => e.linkedTransitMonth === pK);
  check("그 달 대중교통 기록", t?.amount, 48600);
  check("그 달 말일", t?.date, `${pK}-${String(new Date(pY, prevMo, 0).getDate()).padStart(2, "0")}`);
  check("교통 카테고리", t?.categoryId, "t");
  check("현대카드 카드값 +48,600", r.next.cards[0].bill, 1548600);
  check("알림함에 안 남음", r.leftover.length, 0);
  const d2 = base(); d2.expenses.push({ id: "tq", amount: 40000, date: `${pK}-20`, memo: "대중교통", paymentMethod: "card", cardId: "c1", linkedTransitMonth: pK });
  const r2 = run(d2, `[현대카드] 김*혁님 ${String(prevMo).padStart(2, "0")}월 버스+지하철 이용금액은 총 48,600원입니다`);
  check("손으로 넣어 둔 누적을 바꿈(새로 안 만듦)", r2.next.expenses.filter((e) => e.linkedTransitMonth === pK).map((e) => e.amount).join(), "48600");
  check("카드값은 차액 8,600만", r2.next.cards[0].bill, 1508600); }

console.log("\n[5] 명세서·결제금액 안내 — 조용히 넘김");
{ const r = run(base(), `[현대 코스트코] 김*혁님 ${mm}/12 결제금액 1,452,107원(${mm}/01기준) 국민은행 앱에서 명세서 보기`);
  check("넘김", r.ignored.length, 1);
  check("알림함에 안 남음", r.leftover.length, 0);
  check("아무것도 안 바뀜", r.next.balanceEntries.length + r.next.expenses.length, 3); }

console.log("\n[6] 몇 달 전 결제의 취소 — 알림함(자동으로 안 건드림)");
{ const r = run(base(), `[현대카드] 김*혁님 03/12 삼성화재다이렉트자동차앱카드 사용 641,340원 취소처리되었습니다`);
  check("알림함", r.leftover.length, 1);
  check("카드값 그대로", r.next.cards[0].bill, 1500000); }

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
