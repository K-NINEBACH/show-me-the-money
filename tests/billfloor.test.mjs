// 안 낸 카드값의 바닥 — 이번 달 그 카드 기록 합(2026-10-26, data.js effectiveBill)
import { effectiveBill } from "../src/lib/data.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
const at = (day) => new Date(2026, 8, day, 12).getTime();   // 2026-09-dd (시험은 9/25로 고정)

console.log("[1] 카드값 칸이 기록 합보다 적으면(새어 나감) 기록 합으로 센다 — 10월 휴대폰요금처럼");
check("1,330,642", effectiveBill({ bill: 1240342, payDay: 12 }, 1330642, "2026-09"), 1330642);

console.log("\n[2] 카드값이 더 크면 그대로(지난달 안 낸 것·알림 없는 결제까지 맞춘 값)");
check("1,500,000", effectiveBill({ bill: 1500000, payDay: 12 }, 1330642, "2026-09"), 1500000);

console.log("\n[3] 결제일에 낸 지난달 몫 확인(paidLog 9/12)은 예외가 아니다 — 바닥 그대로");
check("기록 합", effectiveBill({ bill: 0, payDay: 12, paidLog: [{ at: at(12), amount: 900000 }] }, 300000, "2026-09"), 300000);

console.log("\n[4] 결제일 이틀 뒤부터 낸 것(이번 달 쓴 것을 미리 일부 냄)이면 바닥을 안 깐다");
check("카드값 그대로", effectiveBill({ bill: 100000, payDay: 12, paidLog: [{ at: at(20), amount: 200000 }] }, 300000, "2026-09"), 100000);

console.log("\n[5] 홈 '결제하기'로 이번 달 다 냈으면 바닥을 안 깐다");
check("0", effectiveBill({ bill: 0, payDay: 12, paidAllMs: at(5) }, 300000, "2026-09"), 0);

console.log("\n[6] 지난달에 '결제하기'를 눌렀어도 이번 달엔 다시 바닥을 깐다");
check("기록 합", effectiveBill({ bill: 0, payDay: 12, paidAllMs: new Date(2026, 7, 28).getTime() }, 300000, "2026-09"), 300000);

console.log(fail === 0 ? "\n전부 통과" : `\n${fail}건 실패`);
process.exit(fail ? 1 : 0);
