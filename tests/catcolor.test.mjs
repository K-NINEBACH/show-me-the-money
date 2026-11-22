import { usedColors, nextFreeColor, dedupeCategoryColors, migrate, autoCategorize } from "../src/lib/data.js";
import { PALETTE } from "../src/lib/constants.js";
let fail = 0;
const check = (n, got, want) => { const ok = String(got) === String(want); if (!ok) fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (기대 ${want} / 실제 ${got})`}`); };
// 카테고리 색은 겹치지 않게(2026-11-23). 이름은 모두 가짜.
const cats = [{ id: "a", name: "식비", color: PALETTE[0] }, { id: "b", name: "교통", color: PALETTE[3] }];

check("다른 카테고리가 쓰는 색", [...usedColors(cats)].join(","), [PALETTE[0], PALETTE[3]].map((c) => c.toLowerCase()).join(","));
check("자기 색은 막지 않음(색 바꾸기)", usedColors(cats, "a").has(PALETTE[0].toLowerCase()), false);
check("빈 첫 색", nextFreeColor(cats), PALETTE[1]);
check("대소문자 달라도 같은 색", nextFreeColor([{ id: "x", color: PALETTE[0].toLowerCase() }]), PALETTE[1]);

// 16색을 다 써도 겹치지 않는 새 색
const full = PALETTE.map((c, i) => ({ id: "p" + i, color: c }));
const extra = nextFreeColor(full);
check("16색 다 쓰면 새 색(팔레트 밖)", PALETTE.includes(extra), false);
check("새 색 형식", /^#[0-9A-F]{6}$/.test(extra), true);
const more = [...full, { id: "e1", color: extra }];
check("그다음 새 색도 안 겹침", usedColors(more).has(nextFreeColor(more).toLowerCase()), false);

// 이미 겹쳐 저장된 것: 먼저 있던 쪽이 색을 지키고 뒤만 바뀜
const dup = [
  { id: "c1", name: "식비", color: PALETTE[0] },
  { id: "c2", name: "교통", color: PALETTE[3] },
  { id: "c3", name: "쇼핑", color: PALETTE[4] },
  { id: "c4", name: "보험", color: PALETTE[3] },   // 예전 설정 추가(개수 % 8)로 교통과 겹침
  { id: "c5", name: "카페", color: PALETTE[1] },
];
const fixed = dedupeCategoryColors(dup);
check("먼저 있던 교통은 그대로", fixed[1].color, PALETTE[3]);
check("뒤의 보험만 바뀜", fixed[3].color !== PALETTE[3], true);
check("바뀐 색이 뒤의 카페 색과도 안 겹침", fixed[3].color !== PALETTE[1], true);
check("전부 다른 색", new Set(fixed.map((c) => c.color.toLowerCase())).size, 5);
check("다른 칸은 그대로", fixed[3].name + fixed[3].id, "보험c4");
check("안 겹치면 같은 배열(저장 안 흔듦)", dedupeCategoryColors(cats) === cats, true);
check("색 없는 카테고리도 채움", !!dedupeCategoryColors([{ id: "z", name: "x" }])[0].color, true);

// migrate가 겹친 색을 풀어 준다
const m = migrate({ onboarded: true, categories: dup, expenses: [], cards: [], accounts: [], fixedExpenses: [], balanceEntries: [] });
check("migrate 뒤 전부 다른 색", new Set(m.categories.map((c) => c.color.toLowerCase())).size, 5);

// 자동으로 만드는 '정기결제' 카테고리도 빈 색
const ac = autoCategorize({ categories: cats, expenses: [{ id: "e", date: "2026-11-01", amount: 9900, memo: "정기결제", isCardAdjustment: true }] });
const sub = ac.categories.find((c) => c.name === "정기결제");
check("정기결제 카테고리 색이 안 겹침", [PALETTE[0], PALETTE[3]].includes(sub.color), false);

if (fail) { console.log(`실패 ${fail}`); process.exit(1); }
