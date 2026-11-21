// 고정지출 금액을 '이번 달부터 계속' 바꾸기(data.js changeFixedAmountFrom, 2026-11-21)와 자동이체 '말일'(31)
import { changeFixedAmountFrom, fixedInfo, autoProcessFixed, monthKey } from "../src/lib/data.js";

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

const f = { id: "f1", name: "보험", baseAmount: 50000, totalMonths: 0, startInstallment: 1, setupMonthKey: "2026-07", overrides: { "2026-08": 52000, "2026-09": 51000, "2026-11": 49000 } };
const g = changeFixedAmountFrom(f, "2026-09", 60000);
ok(fixedInfo(g, "2026-07").amount === 50000, "지난달 전(7월)은 예전 금액 그대로");
ok(fixedInfo(g, "2026-08").amount === 52000, "지난달에 따로 적은 금액(8월)도 그대로");
ok(fixedInfo(g, "2026-09").amount === 60000, "이번 달은 새 금액(이번 달만 적어 둔 51,000보다 새 금액이 이김)");
ok(fixedInfo(g, "2026-11").amount === 60000 && fixedInfo(g, "2027-03").amount === 60000, "그 뒤 달도 새 금액");
ok(g.id === f.id && g.setupMonthKey === "2026-07", "같은 항목을 고침(지우고 다시 만들지 않음)");

// 할부 회차는 그대로
const inst = { ...f, totalMonths: 12, startInstallment: 3, overrides: {} };
ok(fixedInfo(changeFixedAmountFrom(inst, "2026-09", 70000), "2026-09").label === fixedInfo(inst, "2026-09").label, "할부 회차는 안 바뀜");

// 말일: 31로 적으면 그 달 마지막 날에 처리 — 시험 날짜(9/25)는 말일 전이라 아직 안 만듦
const cur = monthKey(new Date());
const d = { accounts: [{ id: "a1", name: "통장" }], balanceEntries: [], fixedExpenses: [{ id: "f2", name: "월세", baseAmount: 300000, totalMonths: 0, startInstallment: 1, setupMonthKey: cur, overrides: {}, paymentMethod: "cash", accountId: "a1", paidMonths: {}, autoPayDay: 31 }] };
const r = autoProcessFixed(d);
ok(!(r.balanceEntries || []).length, "말일 자동이체는 말일 전엔 안 만듦");

process.exit(fail ? 1 : 0);
