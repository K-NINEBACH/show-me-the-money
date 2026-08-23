// Pure data layer: default shape, migration from older backups, and the
// money/date/fixed-expense math the screens all share. No React here.
import { PALETTE } from "./constants";
import { THEMES } from "./theme";

export const defaultData = () => ({
  theme: "dark",
  onboarded: false,
  lastSeenMonth: null,
  spendingGoal: 0,
  accounts: [{ id: "acc1", name: "통장", initialBalance: 0 }],
  cards: [{ id: "card1", name: "카드", bill: 0 }],
  categories: [
    { id: "c1", name: "식비", color: PALETTE[0] },
    { id: "c2", name: "교통", color: PALETTE[3] },
    { id: "c3", name: "쇼핑", color: PALETTE[4] },
  ],
  expenses: [],
  fixedExpenses: [],
  balanceEntries: [],
});

export function migrate(raw) {
  const d = { ...defaultData(), ...raw };
  d.onboarded = raw.onboarded !== false;
  d.lastSeenMonth = raw.lastSeenMonth || monthKey(new Date());
  if (raw.theme === "light") d.theme = "beige";
  if (!THEMES[d.theme]) d.theme = "dark";
  if (Array.isArray(raw.cards) && raw.cards.length) {
    d.cards = raw.cards.map((c) => ({ bill: 0, ...c }));
  } else {
    let legacyBill = 0;
    if (raw.cardBills && typeof raw.cardBills === "object") {
      const vals = Object.values(raw.cardBills).map(Number).filter((n) => !Number.isNaN(n));
      legacyBill = (raw.cardBill || 0) + vals.reduce((a, b) => a + b, 0);
    } else {
      legacyBill = Number(raw.cardBill) || 0;
    }
    d.cards = [{ id: "card1", name: "카드", bill: legacyBill }];
  }
  if (Array.isArray(raw.accounts) && raw.accounts.length) {
    d.accounts = raw.accounts.map((a) => ({ initialBalance: 0, ...a }));
  } else {
    d.accounts = [{ id: "acc1", name: "통장", initialBalance: raw.account?.initialBalance || 0 }];
  }
  if (Array.isArray(raw.fixedExpenses)) {
    d.fixedExpenses = raw.fixedExpenses.map((f) => {
      const base = f.totalMonths !== undefined
        ? { overrides: {}, ...f }
        : { id: f.id, name: f.name, baseAmount: f.amount, totalMonths: 0, startInstallment: 1, setupMonthKey: monthKey(new Date()), overrides: {} };
      return { paymentMethod: "cash", cardId: null, paidMonths: {}, ...base };
    });
  }
  // cards/accounts/fixedExpenses 위에서 다 Array.isArray로 확인하는데 이 셋만 그냥
  // truthy 체크였음 — JSON 백업 붙여넣기(가져오기)로 들어오는 값이라 형식이 깨져 있어도
  // (예: categories가 배열이 아닌 문자열) 여기서 막아야 나중에 .map/.filter 하다가
  // 화면이 통째로 죽는 걸 막을 수 있음.
  d.categories = Array.isArray(raw.categories) && raw.categories.length ? raw.categories : defaultData().categories;
  d.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  d.balanceEntries = (Array.isArray(raw.balanceEntries) ? raw.balanceEntries : []).map((b) => ({ accountId: d.accounts[0]?.id || "acc1", ...b }));
  d.spendingGoal = Number(raw.spendingGoal ?? raw.salary) || 0;
  // Old backups may still carry pinLock/trash from a previous version of the app — drop them silently.
  delete d.pinLock;
  delete d.trash;
  return d;
}

export function autoProcessFixed(d) {
  const now = new Date();
  const curKey = monthKey(now);
  const today = now.getDate();
  let changed = false;
  const newEntries = [];
  const fixedExpenses = (d.fixedExpenses || []).map((f, idx) => {
    if ((f.paymentMethod || "cash") !== "cash") return f;
    if (!f.autoPayDay) return f;
    if (f.paidMonths && f.paidMonths[curKey]) return f;
    // 31일로 설정해둔 자동이체는 30일(또는 28/29일)짜리 달엔 today가 31에 절대 못
    // 닿아서 그 달엔 영원히 자동처리가 안 되던 버그 — payDateDay와 똑같이 그 달의
    // 마지막 날로 맞춰서 비교해야 함.
    const payDateDay = Math.min(f.autoPayDay, daysInMonthKey(curKey));
    if (today < payDateDay) return f;
    const info = fixedInfo(f, curKey);
    if (!info.active) return f;
    changed = true;
    // f.accountId가 그 사이에 삭제된 통장을 가리킬 수 있음 — 그러면 자동이체 기록이
    // 존재하지 않는 통장에 붙어서 어느 통장 잔액에도 안 잡히는 유령 데이터가 됨.
    const aid = f.accountId && d.accounts.some((a) => a.id === f.accountId) ? f.accountId : d.accounts[0]?.id;
    // 같은 날 자동이체 대상이 여러 개면 이 map 루프 안에서 한꺼번에 처리되는데, 그럼
    // Date.now()가 전부 같은 밀리초라 랜덤 접미사만으론 드물게 id가 겹칠 수 있었음 —
    // idx를 타임스탬프에 직접 더해서 이 루프 안에서는 항상 서로 다른 값이 되게 함
    // (createdTime()이 id의 숫자를 그대로 이어붙여 정렬 기준으로 쓰기 때문에, 구분자로
    // 붙이면 자릿수가 늘어나 Number.MAX_SAFE_INTEGER를 넘어 정렬이 깨질 수 있어서
    // 구분자 없이 같은 자리수를 유지하는 이 방식으로 함).
    const entryId = "b" + (Date.now() + idx) + Math.floor(Math.random() * 1000);
    newEntries.push({ id: entryId, type: "out", amount: info.amount, date: dateStrFor(curKey, payDateDay), memo: `${f.name} 자동이체`, accountId: aid, linkedFixedId: f.id, linkedFixedMonth: curKey });
    return { ...f, paidMonths: { ...(f.paidMonths || {}), [curKey]: entryId } };
  });
  if (!changed) return d;
  return { ...d, fixedExpenses, balanceEntries: [...(d.balanceEntries || []), ...newEntries] };
}


export function fmtWon(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }
export function createdTime(item) {
  const digits = String(item?.id || "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function parsePaymentText(text) {
  const amountMatch = text.match(/([\d,]{3,})\s*원/);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, "") : "";

  let type = "unknown";
  if (/입금|입금액|이체입금/.test(text)) type = "in";
  else if (/승인|출금|결제|이체출금/.test(text)) type = "out";

  const dateMatch = text.match(/(\d{1,2})[\/.\-](\d{1,2})/);
  let date = null;
  if (dateMatch) {
    const now = new Date();
    const mm = String(dateMatch[1]).padStart(2, "0");
    const dd = String(dateMatch[2]).padStart(2, "0");
    date = `${now.getFullYear()}-${mm}-${dd}`;
  }

  const noise = /^(승인|일시불|할부|원|입금|출금|결제|잔액|카드|Web발신|체크카드|신용카드|누적|사용|금액|매출|취소|이체)$/;
  const tokens = text.split(/[\s\[\]()]+/).filter(Boolean);
  const candidates = tokens.filter((t) => {
    if (noise.test(t)) return false;
    if (/누적/.test(t)) return false;
    if (/\*/.test(t)) return false;
    if (/^[\d,]+원?$/.test(t)) return false;
    if (/^\d{1,2}[:.]\d{2}(:\d{2})?$/.test(t)) return false;
    if (/^\d{1,2}[/.\-]\d{1,2}$/.test(t)) return false;
    if (/^\d+$/.test(t)) return false;
    if (/카드|은행|증권|Web발신/.test(t)) return false;
    return /[가-힣a-zA-Z]/.test(t);
  });
  let merchant = "";
  if (candidates.length) {
    if (dateMatch) {
      const dateIdx = text.indexOf(dateMatch[0]);
      const afterDate = candidates.filter((c) => text.indexOf(c) > dateIdx);
      merchant = afterDate.length ? afterDate[0] : candidates[candidates.length - 1];
    } else {
      merchant = candidates[candidates.length - 1];
    }
  }

  return { amount, type, date, merchant };
}
export function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
export function monthKey(ref = new Date()) { return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`; }
export function monthLabel(key) { const [y, m] = key.split("-").map(Number); return `${y}년 ${m}월`; }
export function daysInMonthKey(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); }
export function dateStrFor(key, day) { const [y, m] = key.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
export function monthKeyOffset(key, offset) { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + offset, 1); return monthKey(d); }
export function firstWeekday(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).getDay(); }
export function monthsBetweenKeys(aKey, bKey) { const [ay, am] = aKey.split("-").map(Number); const [by, bm] = bKey.split("-").map(Number); return (by - ay) * 12 + (bm - am); }

export function fixedInfo(f, curKey) {
  const amt = f.overrides && f.overrides[curKey] != null ? f.overrides[curKey] : f.baseAmount;
  if (!f.totalMonths || f.totalMonths <= 0) return { active: true, label: null, amount: amt, installment: null, isLast: false };
  const elapsed = monthsBetweenKeys(f.setupMonthKey, curKey);
  const cur = f.startInstallment + elapsed;
  if (cur > f.totalMonths || cur < 1) return { active: false, label: null, amount: 0, installment: cur, isLast: false };
  // 할부 마지막 회차 여부 — "이번 달이 마지막이라 다음 달부턴 안 나간다"는 걸 화면에서
  // 바로 알 수 있게(PROJECT.md PENDING "할부 종료 알림").
  return { active: true, label: `${cur}/${f.totalMonths}개월`, amount: amt, installment: cur, isLast: cur === f.totalMonths };
}

export const FIXED_SORTS = [
  { key: "amountDesc", label: "금액 높은순" },
  { key: "amountAsc", label: "금액 낮은순" },
  { key: "installment", label: "할부 우선" },
  { key: "card", label: "카드우선" },
  { key: "cash", label: "통장우선" },
];
export function sortFixedList(list, sortKey) {
  const arr = [...list];
  const byAmountDesc = (a, b) => Number(b.info.amount) - Number(a.info.amount);
  if (sortKey === "amountDesc") arr.sort(byAmountDesc);
  else if (sortKey === "amountAsc") arr.sort((a, b) => Number(a.info.amount) - Number(b.info.amount));
  else if (sortKey === "installment") arr.sort((a, b) => ((a.totalMonths > 0 ? 0 : 1) - (b.totalMonths > 0 ? 0 : 1)) || byAmountDesc(a, b));
  else if (sortKey === "card") arr.sort((a, b) => (((a.paymentMethod || "cash") === "card" ? 0 : 1) - ((b.paymentMethod || "cash") === "card" ? 0 : 1)) || byAmountDesc(a, b));
  else if (sortKey === "cash") arr.sort((a, b) => (((a.paymentMethod || "cash") === "cash" ? 0 : 1) - ((b.paymentMethod || "cash") === "cash" ? 0 : 1)) || byAmountDesc(a, b));
  return arr;
}
