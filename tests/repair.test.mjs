import { repairMisdatedAuto, migrate } from "../src/lib/data.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const Y = new Date().getFullYear();
const created = new Date(`${Y}-09-10T07:40:00`).getTime();
const TEXT = "[출금] 851,362원 원리금-3200031 다음납입예정일-258-******-01-011 09/10 07:16";
const base = () => migrate({
  onboarded: true, accounts: [{ id: "a1", name: "국민은행", initialBalance: 0 }, { id: "a2", name: "기업은행", initialBalance: 0 }],
  cards: [{ id: "c1", name: "현대카드", bill: 0 }], categories: [], expenses: [],
  balanceEntries: [
    { id: "b" + created, accountId: "a2", type: "out", amount: 851362, date: `${Y}-01-01`, memo: "원리금-3200031", auto: true, autoTime: "07:16" },
    { id: "b" + (created + 5), accountId: "a2", type: "out", amount: 30000, date: `${Y}-09-10`, memo: "출금", auto: true, autoTime: "08:00" },
    { id: "b1757000000000", accountId: "a1", type: "out", amount: 100000, date: `${Y}-01-01`, memo: "손으로 적은 1월 기록" }],
  fixedExpenses: [
    { id: "k9", name: "K9 할부", baseAmount: 851362, totalMonths: 60, startInstallment: 6, setupMonthKey: `${Y}-09`, overrides: {}, paymentMethod: "cash", accountId: "a2", paidMonths: {} }] });

console.log("[1] 1월 1일로 들어간 기업은행 출금 — 원래 문구가 남아 있음");
{ const { data, count } = repairMisdatedAuto(base(), ["다른 알림 3,000원", TEXT]);
  const b = data.balanceEntries[0];
  check("1건 바로잡음", count, 1);
  check("날짜 9월 10일", b.date, `${Y}-09-10`);
  check("옛 날짜를 남김", b.dateRepaired, `${Y}-01-01`);
  check("K9 할부에 이음", b.linkedFixedId, "k9");
  check("K9 할부 9월 처리 완료", data.fixedExpenses[0].paidMonths[`${Y}-09`], b.id);
  check("메모 'K9 할부 자동이체'", b.memo, "K9 할부 자동이체");
  check("정상 기록은 그대로", data.balanceEntries[1].date, `${Y}-09-10`);
  check("손으로 적은 1월 기록은 안 건드림", data.balanceEntries[2].date, `${Y}-01-01`);
  const again = repairMisdatedAuto(data, [TEXT]);
  check("두 번 돌려도 그대로", again.count, 0); }

console.log("\n[2] 원래 문구가 없으면 만든 날로");
{ const { data } = repairMisdatedAuto(base(), []);
  check("만든 날 9월 10일", data.balanceEntries[0].date, `${Y}-09-10`); }

console.log("\n[3] 이미 손으로 출금처리 해 둔 달이면 잇지 않음(두 번 처리 방지)");
{ const d = base(); d.fixedExpenses[0].paidMonths = { [`${Y}-09`]: "bX" };
  const { data } = repairMisdatedAuto(d, [TEXT]);
  check("날짜만 고침", data.balanceEntries[0].date, `${Y}-09-10`);
  check("연결 안 함", data.balanceEntries[0].linkedFixedId, undefined); }

console.log("\n[4] 잘못 읽은 게 없으면 데이터 그대로(같은 객체)");
{ const d = base(); d.balanceEntries = d.balanceEntries.slice(1);
  const r = repairMisdatedAuto(d, [TEXT]);
  check("count 0", r.count, 0);
  check("같은 객체", r.data === d, true); }

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
