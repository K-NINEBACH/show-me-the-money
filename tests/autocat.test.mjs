// 카테고리 알아서 붙이기(data.js autoCategorize, 2026-11-09)
// 구글 페이먼트코리아는 이름+금액으로만 따라가고, 9,900(유튜브)·30,000(클로드)은 늘 정기결제
import { autoCategorize } from "../src/lib/data.js";

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

const d = { categories: [{ id: "k1", name: "쇼핑" }], expenses: [
  { id: "a", memo: "구글 페이먼트코리아", amount: 9900, date: "2026-11-01" },
  { id: "b", memo: "구글페이먼트코리아", amount: 30000, date: "2026-11-02", categoryId: "k1", catTried: true },
  { id: "c", memo: "구글 페이먼트코리아", amount: 4400, date: "2026-11-03" },
  { id: "d", memo: "구글 페이먼트코리아", amount: 1200, date: "2026-10-03", categoryId: "k1" },
  { id: "e", memo: "구글 페이먼트코리아", amount: 1200, date: "2026-11-04" },
  { id: "f", memo: "스타벅스", amount: 5000, date: "2026-10-01", categoryId: "k1" },
  { id: "g", memo: "스타벅스", amount: 7000, date: "2026-11-05" },
  { id: "h", memo: "유튜브 · 정기결제 카드반영", amount: 14900, date: "2026-11-06", isCardAdjustment: true },
  { id: "i", memo: "스타벅스", amount: 6000, date: "2026-11-07", catTried: true },
] };
const r = autoCategorize(d);
const name = Object.fromEntries(r.categories.map((c) => [c.id, c.name]));
const cat = (id) => name[r.expenses.find((e) => e.id === id).categoryId] || "미분류";

ok(cat("a") === "정기결제", "구글 9,900 → 정기결제");
ok(cat("b") === "정기결제", "구글 30,000 → 정기결제(다른 카테고리였어도)");
ok(cat("c") === "미분류", "구글 다른 금액 → 미분류");
ok(cat("e") === "쇼핑", "구글 같은 이름+같은 금액 → 예전 카테고리");
ok(cat("g") === "쇼핑", "일반 가맹점은 이름만 같아도 따라감");
ok(cat("h") === "정기결제", "정기결제 카드반영 → 정기결제");
ok(cat("i") === "미분류", "사람이 미분류로 둔 것(catTried)은 안 덮음");
ok(r.categories.filter((c) => c.name === "정기결제").length === 1, "정기결제 카테고리는 하나만 생김");
ok(autoCategorize(r) === r, "다시 돌려도 바뀌는 게 없음(같은 객체)");

process.exit(fail ? 1 : 0);
