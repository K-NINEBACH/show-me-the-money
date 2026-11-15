// 자동이체일 처리(data.js autoProcessFixed) — '안 냄'으로 둔 달은 출금을 만들지 않는다(2026-11-16)
// 내역에서 지운 주택청약 자동이체가 앱을 열 때마다 다시 생겼다. 시험 날짜는 2026-09-25로 고정.
import { autoProcessFixed } from "../src/lib/data.js";

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

const base = { accounts: [{ id: "a1", name: "국민은행" }], balanceEntries: [] };
const f = { id: "f1", name: "주택청약", baseAmount: 100000, totalMonths: 0, startInstallment: 1, setupMonthKey: "2026-07", overrides: {}, paymentMethod: "cash", accountId: "a1", paidMonths: {}, autoPayDay: 15 };

const r1 = autoProcessFixed({ ...base, fixedExpenses: [f] });
ok(r1.balanceEntries.length === 1 && r1.balanceEntries[0].amount === 100000, "자동이체일이 지났으면 출금을 만든다");
ok(!!r1.fixedExpenses[0].paidMonths["2026-09"], "그 달을 처리 완료로 적는다");

const r2 = autoProcessFixed({ ...base, fixedExpenses: [{ ...f, skipMonths: { "2026-09": true } }] });
ok(r2.balanceEntries.length === 0, "'안 냄'으로 둔 달은 출금을 안 만든다");

const r3 = autoProcessFixed({ ...base, fixedExpenses: [{ ...f, skipMonths: { "2026-08": true } }] });
ok(r3.balanceEntries.length === 1, "다른 달을 건너뛴 건 이번 달에 상관없다");

process.exit(fail ? 1 : 0);
