import { autoRecordPayments } from "../src/lib/auto-record.js";
// 무작위 알림을 쏟아 부어도 숫자가 깨지지 않나(음수 카드값·NaN·같은 알림 두 번 반영). 값은 모두 가짜.
let seed = 7; const R = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(R() * a.length)];
let fail = 0; const check = (n, ok, d = "") => { if (!ok) { fail++; console.log(`  FAIL  ${n} ${d}`); } };
const SMS = "com.samsung.android.messaging", KB = "com.kbstar.kbbank";
const md = "09/25";
const mk = () => {
  const won = pick([1000, 4600, 12900, 27460, 58220, 86491, 150000, 566020, 1234000]).toLocaleString("en-US");
  const t = `${String(Math.floor(R() * 12) + 8).padStart(2, "0")}:${String(Math.floor(R() * 60)).padStart(2, "0")}`;
  return pick([
    { text: `현대 코스트코 승인 홍*동 ${won}원 일시불 ${md} ${t} 가맹점${Math.floor(R() * 5)} 누적1,000,000원`, pkg: SMS },
    { text: `현대 코스트코 승인 홍*동 ${won}원 03개월 ${md} ${t} 면세점 누적1,000,000원`, pkg: SMS },
    { text: `[현대카드] 해외승인 홍*동님 ${md} ${t} USD ${Math.floor(R() * 90) + 1}.00 GoogleInc.`, pkg: SMS },
    { text: `[현대 코스트코] 홍*동님 ${md} ${won}원이 입금되었습니다`, pkg: SMS },
    { text: `출금 ${won}원 홍*동님 ${md} ${t} 111111-**-***${pick(["222", "333"])} 이체출금 ${won} 잔액${Math.floor(R() * 5000000)}`, pkg: KB },
    { text: `입금 ${won}원 홍*동님 ${md} ${t} 111111-**-***${pick(["222", "333"])} 급여 ${won} 잔액${Math.floor(R() * 5000000)}`, pkg: KB },
    { text: `[현대카드] 취소 ${won}원 ${md} ${t} 가맹점${Math.floor(R() * 5)}`, pkg: SMS },
    { text: `(광고) 결제 시 3,000원 할인`, pkg: SMS },
    { text: `${md} 결제금액 ${won}원(09/01기준) 국민은행`, pkg: SMS },
    { text: `알 수 없는 문구 ${won}원`, pkg: "com.example.app" },
  ]);
};
for (let round = 0; round < 60; round++) {
  let d = { accounts: [{ id: "a1", name: "국민은행", initialBalance: 1000000 }, { id: "a2", name: "기업은행", initialBalance: 0 }],
    cards: [{ id: "c1", name: "현대카드(코스트코)", bill: Math.floor(R() * 2000000), payDay: 12, installPaid: {} }, { id: "c2", name: "롯데카드", bill: 0, earlyPay: true, payDay: 14 }],
    categories: [], expenses: [], balanceEntries: [], fixedExpenses: [] };
  const items = Array.from({ length: 1 + Math.floor(R() * 8) }, () => ({ ...mk(), at: Date.now() + Math.floor(R() * 1000) }));
  let r;
  try { r = autoRecordPayments(d, items, []); } catch (e) { check(`라운드 ${round} 예외`, false, e.message); continue; }
  const s = JSON.stringify(r.next);
  check(`라운드 ${round}: NaN·undefined 없음`, !/NaN|undefined|Infinity/.test(s));
  check(`라운드 ${round}: 카드값 음수 아님`, r.next.cards.every((c) => Number(c.bill) >= 0), JSON.stringify(r.next.cards.map((c) => c.bill)));
  check(`라운드 ${round}: 모든 금액이 양수`, [...r.next.expenses, ...r.next.balanceEntries].every((x) => Number(x.amount) > 0), "");
  // 같은 알림을 한 번 더 받아도(껍데기가 다시 훑어 줄 때) 이미 처리한 알림으로 같은 결과가 또 쌓이면 안 된다
  const again = autoRecordPayments(r.next, items, []);
  const grew = again.next.expenses.length - r.next.expenses.length;
  check(`라운드 ${round}: 같은 알림 재처리에 지출이 안 늘어남`, grew <= 0 || items.some((i) => /취소/.test(i.text)), `+${grew}`);
}
console.log(fail ? `\n${fail}건 실패` : "\n전부 통과"); process.exit(fail ? 1 : 0);
