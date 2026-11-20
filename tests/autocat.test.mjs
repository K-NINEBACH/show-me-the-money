// 카테고리 알아서 붙이기(data.js autoCategorize, 2026-11-09)
// 구글 페이먼트코리아는 이름+금액으로만 따라가고, 9,900(유튜브)·30,000(클로드)은 늘 정기결제 — 처음 쓰던 폰만
// 2026-11-21: 그 두 금액은 데이터의 googleSubs 칸 — 예전부터 쓰던 데이터(칸 없음)만 migrate가 채우고, 새로 깔면 비어 있다
import { autoCategorize, migrate, defaultData, LEGACY_GOOGLE_SUBS } from "../src/lib/data.js";

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

const d = { googleSubs: LEGACY_GOOGLE_SUBS, categories: [{ id: "k1", name: "쇼핑" }], expenses: [
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

// 예전부터 쓰던 폰: 저장 데이터에 googleSubs가 없으면 migrate가 예전 두 금액을 넣는다
const old = migrate({ onboarded: true, categories: [{ id: "k1", name: "쇼핑" }], expenses: [{ id: "a", memo: "구글 페이먼트코리아", amount: 9900, date: "2026-11-01" }] });
ok(old.googleSubs[9900] === "유튜브" && old.googleSubs[30000] === "클로드", "옛 데이터 → 유튜브·클로드 규칙 유지");
ok(old.categories.find((c) => c.id === old.expenses[0].categoryId)?.name === "정기결제", "옛 데이터의 구글 9,900 → 정기결제");

// 새로 깐 폰(여자친구 폰): defaultData → 저장 → 다시 열기(migrate)를 거쳐도 비어 있고, 구글 9,900은 미분류
const fresh = migrate(JSON.parse(JSON.stringify({ ...defaultData(), onboarded: true,
  expenses: [{ id: "a", memo: "구글 페이먼트코리아", amount: 9900, date: "2026-11-01" }] })));
ok(Object.keys(fresh.googleSubs).length === 0, "새로 깐 폰 → 구글 규칙 없음(저장 후 다시 열어도)");
ok(!fresh.expenses[0].categoryId, "새로 깐 폰의 구글 9,900 → 미분류");
ok(!fresh.categories.some((c) => c.name === "정기결제"), "새로 깐 폰엔 정기결제 카테고리를 억지로 안 만듦");

process.exit(fail ? 1 : 0);
