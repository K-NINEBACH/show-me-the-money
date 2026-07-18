import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { Plus, Trash2, Settings, Home as HomeIcon, BookOpen, X, Check, CreditCard, HandCoins, Wallet, ArrowDownCircle, ArrowUpCircle, Pencil, Repeat } from "lucide-react";

// NOTE: storage key kept stable across revisions on purpose so existing user data
// (expenses, categories, balance entries) survives future updates via migrate().
const STORAGE_KEY = "passbook-data-v4";
const PALETTE = ["#C79A46", "#5B8A62", "#B6473F", "#3E6E8E", "#8A5FA0", "#C97C3D", "#4E7A6B", "#A85C7A"];
const QUICK_AMOUNTS = [
  { n: 1000, label: "천원" },
  { n: 10000, label: "만원" },
  { n: 50000, label: "오만원" },
  { n: 100000, label: "십만원" },
  { n: 500000, label: "오십만원" },
  { n: 1000000, label: "백만원" },
];

const defaultData = () => ({
  theme: "dark",
  spendingGoal: 0,
  accounts: [{ id: "acc1", name: "통장", initialBalance: 0 }],
  cards: [{ id: "card1", name: "카드", bill: 0 }],
  pinLock: { enabled: false, pin: "" },
  categories: [
    { id: "c1", name: "식비", color: PALETTE[0], budget: 0 },
    { id: "c2", name: "교통", color: PALETTE[3], budget: 0 },
    { id: "c3", name: "쇼핑", color: PALETTE[4], budget: 0 },
  ],
  expenses: [],
  fixedExpenses: [],
  balanceEntries: [],
  trash: [],
});

function migrate(raw) {
  const d = { ...defaultData(), ...raw };
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
      return { paymentMethod: "cash", cardId: null, ...base };
    });
  }
  d.categories = raw.categories && raw.categories.length ? raw.categories.map((c) => ({ budget: 0, ...c })) : defaultData().categories;
  d.expenses = raw.expenses || [];
  d.balanceEntries = (raw.balanceEntries || []).map((b) => ({ accountId: d.accounts[0]?.id || "acc1", ...b }));
  d.spendingGoal = Number(raw.spendingGoal ?? raw.salary) || 0;
  d.pinLock = raw.pinLock && typeof raw.pinLock === "object" ? { enabled: false, pin: "", ...raw.pinLock } : { enabled: false, pin: "" };
  d.trash = Array.isArray(raw.trash) ? raw.trash : [];
  return d;
}

function trashLabel(t, catMap) {
  if (t.type === "expense") return (catMap[t.expense.categoryId]?.name || "미분류") + (t.expense.isReceivable ? " · 대리결제" : "");
  if (t.type === "balance") return t.payload.type === "in" ? "입금" : "출금";
  if (t.type === "fixed") return "표기내역 · " + t.payload.name;
  return "삭제된 항목";
}
function trashAmount(t) {
  if (t.type === "expense") return Number(t.expense.amount);
  if (t.type === "balance") return Number(t.payload.amount);
  if (t.type === "fixed") return Number(t.payload.baseAmount);
  return 0;
}


function fmtWon(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }
function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function monthKey(ref = new Date()) { return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`; }
function monthLabel(key) { const [y, m] = key.split("-").map(Number); return `${y}년 ${m}월`; }
function daysInMonthKey(key) { const [y, m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function dateStrFor(key, day) { const [y, m] = key.split("-").map(Number); return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function monthKeyOffset(key, offset) { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + offset, 1); return monthKey(d); }
function monthsBetweenKeys(aKey, bKey) { const [ay, am] = aKey.split("-").map(Number); const [by, bm] = bKey.split("-").map(Number); return (by - ay) * 12 + (bm - am); }

function fixedInfo(f, curKey) {
  const amt = f.overrides && f.overrides[curKey] != null ? f.overrides[curKey] : f.baseAmount;
  if (!f.totalMonths || f.totalMonths <= 0) return { active: true, label: null, amount: amt, installment: null };
  const elapsed = monthsBetweenKeys(f.setupMonthKey, curKey);
  const cur = f.startInstallment + elapsed;
  if (cur > f.totalMonths || cur < 1) return { active: false, label: null, amount: 0, installment: cur };
  return { active: true, label: `${cur}/${f.totalMonths}개월`, amount: amt, installment: cur };
}

const FIXED_SORTS = [
  { key: "default", label: "입력순" },
  { key: "amountDesc", label: "금액 높은순" },
  { key: "amountAsc", label: "금액 낮은순" },
  { key: "installment", label: "할부 우선" },
  { key: "card", label: "카드우선" },
  { key: "cash", label: "통장우선" },
];
function sortFixedList(list, sortKey) {
  const arr = [...list];
  const byAmountDesc = (a, b) => Number(b.info.amount) - Number(a.info.amount);
  if (sortKey === "amountDesc") arr.sort(byAmountDesc);
  else if (sortKey === "amountAsc") arr.sort((a, b) => Number(a.info.amount) - Number(b.info.amount));
  else if (sortKey === "installment") arr.sort((a, b) => ((a.totalMonths > 0 ? 0 : 1) - (b.totalMonths > 0 ? 0 : 1)) || byAmountDesc(a, b));
  else if (sortKey === "card") arr.sort((a, b) => (((a.paymentMethod || "cash") === "card" ? 0 : 1) - ((b.paymentMethod || "cash") === "card" ? 0 : 1)) || byAmountDesc(a, b));
  else if (sortKey === "cash") arr.sort((a, b) => (((a.paymentMethod || "cash") === "cash" ? 0 : 1) - ((b.paymentMethod || "cash") === "cash" ? 0 : 1)) || byAmountDesc(a, b));
  return arr;
}
function FixedSortTabs({ sortKey, setSortKey }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      {FIXED_SORTS.map((s) => (
        <button key={s.key} onClick={() => setSortKey(s.key)}
          style={{ border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer",
            background: sortKey === s.key ? T.gold : "transparent", color: sortKey === s.key ? "#23190C" : T.muted }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Theme ---------- */
const THEMES = {
  dark: {
    id: "dark", label: "검정", swatch: "#2A2F45", mode: "dark",
    bg: "#161B2E", bg2: "#1E2440", navBg: "rgba(22,27,46,0.95)",
    paper: "#F1E7D0", paperLine: "#D9C9A3", ink: "#2A2419", cream: "#EDE3CB",
    gold: "#C79A46", goldSoft: "#8A6E3A", good: "#5B8A62", warn: "#C97C3D",
    danger: "#B6473F", muted: "#9A9080", border: "#3A3F5C",
  },
  beige: {
    id: "beige", label: "베이지", swatch: "#C9B183", mode: "light",
    bg: "#EAE2D0", bg2: "#F4EEE0", navBg: "rgba(234,226,208,0.95)",
    paper: "#F7F0DD", paperLine: "#D6C6A0", ink: "#241F17", cream: "#241F17",
    gold: "#9C6F28", goldSoft: "#6E552A", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5C5546", border: "#D2C4A6",
  },
  white: {
    id: "white", label: "흰색", swatch: "#F5F5F1", mode: "light",
    bg: "#FAFAF8", bg2: "#FFFFFF", navBg: "rgba(250,250,248,0.95)",
    paper: "#FBFBF8", paperLine: "#E6E4DC", ink: "#242320", cream: "#242320",
    gold: "#6B6B63", goldSoft: "#4A4A44", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6E6A5F", border: "#E8E6DE",
  },
  gray: {
    id: "gray", label: "회색", swatch: "#84847C", mode: "light",
    bg: "#CFCFC8", bg2: "#DADAD3", paper: "#DEDED7", navBg: "rgba(207,207,200,0.95)",
    paperLine: "#B7B7AC", ink: "#1D1C18", cream: "#1D1C18",
    gold: "#4C4C45", goldSoft: "#35352F", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#46453F", border: "#B7B7AC",
  },
  teal: {
    id: "teal", label: "청록", swatch: "#2E7D6E", mode: "light",
    bg: "#DCEEEA", bg2: "#E9F5F2", navBg: "rgba(220,238,234,0.95)",
    paper: "#E6F2EE", paperLine: "#A9D6CB", ink: "#122824", cream: "#122824",
    gold: "#2E7D6E", goldSoft: "#1F5A4E", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3E5F58", border: "#A9D6CB",
  },
  brown: {
    id: "brown", label: "갈색", swatch: "#7A4E28", mode: "light",
    bg: "#EDE3D6", bg2: "#F5EEE3", navBg: "rgba(237,227,214,0.95)",
    paper: "#F2E9DA", paperLine: "#D8C1A1", ink: "#2A1E14", cream: "#2A1E14",
    gold: "#7A4E28", goldSoft: "#54371C", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5E4C3B", border: "#D8C1A1",
  },
  indigo: {
    id: "indigo", label: "남색", swatch: "#3F4A9E", mode: "light",
    bg: "#E1E3F2", bg2: "#EBEDF8", navBg: "rgba(225,227,242,0.95)",
    paper: "#E8EAF6", paperLine: "#B8BEE3", ink: "#181B33", cream: "#181B33",
    gold: "#3F4A9E", goldSoft: "#2C356F", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#454B70", border: "#B8BEE3",
  },
  olive: {
    id: "olive", label: "카키", swatch: "#767A2E", mode: "light",
    bg: "#EAEAD4", bg2: "#F2F2E1", navBg: "rgba(234,234,212,0.95)",
    paper: "#EFEFD8", paperLine: "#D2D19E", ink: "#25260F", cream: "#25260F",
    gold: "#767A2E", goldSoft: "#54561F", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5C5D3E", border: "#D2D19E",
  },
  red: {
    id: "red", label: "빨강", swatch: "#B33B2E", mode: "light",
    bg: "#F5E4E1", bg2: "#FBEFEC", navBg: "rgba(245,228,225,0.95)",
    paper: "#FAEEE9", paperLine: "#E3BEB4", ink: "#2A1917", cream: "#2A1917",
    gold: "#B33B2E", goldSoft: "#7A281F", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6B4A44", border: "#E0BBB1",
  },
  orange: {
    id: "orange", label: "주황", swatch: "#C1701E", mode: "light",
    bg: "#F6E9DA", bg2: "#FBF1E4", navBg: "rgba(246,233,218,0.95)",
    paper: "#FAEEDC", paperLine: "#E6C89E", ink: "#2B2015", cream: "#2B2015",
    gold: "#C1701E", goldSoft: "#8A4F15", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6E5A45", border: "#E3C79C",
  },
  yellow: {
    id: "yellow", label: "노랑", swatch: "#A98A17", mode: "light",
    bg: "#F7F1D8", bg2: "#FCF8E4", navBg: "rgba(247,241,216,0.95)",
    paper: "#FAF4D6", paperLine: "#E6D98E", ink: "#2A2612", cream: "#2A2612",
    gold: "#A98A17", goldSoft: "#786010", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6E6740", border: "#E3D488",
  },
  green: {
    id: "green", label: "초록", swatch: "#3E7A3E", mode: "light",
    bg: "#E4EFDE", bg2: "#EEF6E9", navBg: "rgba(228,239,222,0.95)",
    paper: "#EBF3E1", paperLine: "#BEDCAE", ink: "#182A18", cream: "#182A18",
    gold: "#3E7A3E", goldSoft: "#2B562B", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#496249", border: "#BEDCAE",
  },
  blue: {
    id: "blue", label: "파랑", swatch: "#2E6DA4", mode: "light",
    bg: "#DFEAF3", bg2: "#EAF3FA", navBg: "rgba(223,234,243,0.95)",
    paper: "#E7F1F8", paperLine: "#AECFE6", ink: "#152531", cream: "#152531",
    gold: "#2E6DA4", goldSoft: "#204C74", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3F5A6B", border: "#AECFE6",
  },
  purple: {
    id: "purple", label: "보라", swatch: "#7B4FA0", mode: "light",
    bg: "#EBE1F0", bg2: "#F3ECF7", navBg: "rgba(235,225,240,0.95)",
    paper: "#F0E8F5", paperLine: "#D2B9E3", ink: "#231831", cream: "#231831",
    gold: "#7B4FA0", goldSoft: "#573773", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5B4A6B", border: "#D2B9E3",
  },
  pink: {
    id: "pink", label: "분홍", swatch: "#B34E82", mode: "light",
    bg: "#F6E3EC", bg2: "#FBEFF4", navBg: "rgba(246,227,236,0.95)",
    paper: "#FAEBF1", paperLine: "#E5B9CE", ink: "#2B151F", cream: "#2B151F",
    gold: "#B34E82", goldSoft: "#7C3559", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6B4557", border: "#E5B9CE",
  },
};
const THEME_ORDER = ["dark", "beige", "white", "gray", "red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "pink", "brown", "olive"];
const DARK = THEMES.dark;
const ThemeContext = createContext(DARK);
const useTheme = () => useContext(ThemeContext);

const F = {
  display: "'Noto Serif KR', serif",
  body: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};
function paperCard(T) {
  return { background: T.paper, borderRadius: 14, padding: "16px 14px", boxShadow: T.mode === "dark" ? "0 8px 24px rgba(0,0,0,0.25)" : "0 6px 20px rgba(80,60,20,0.12)", backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 27px, ${T.paperLine}66 28px)` };
}
function inputSty(T) { return { width: "100%", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.cream, fontSize: 15.5, outline: "none" }; }
function primaryBtn(T) { return { width: "100%", background: T.gold, color: "#23190C", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 15.5, cursor: "pointer" }; }

function MoneyInput({ value, onChange, placeholder, big, autoFocus }) {
  const T = useTheme();
  const display = value !== "" && value != null && !Number.isNaN(Number(value)) ? Number(value).toLocaleString("ko-KR") : "";
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    onChange(raw);
  };
  return (
    <div style={{ position: "relative" }}>
      <input type="text" inputMode="numeric" autoFocus={autoFocus} value={display} onChange={handleChange} placeholder={placeholder || "0"}
        style={{ ...inputSty(T), fontFamily: F.mono, paddingRight: 36, ...(big ? { fontSize: 21.5, fontWeight: 600 } : {}) }} />
      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: big ? 14 : 12.5, pointerEvents: "none" }}>원</span>
    </div>
  );
}

function QuickAmountButtons({ amount, setAmount }) {
  const T = useTheme();
  const add = (n) => setAmount(String((Number(amount) || 0) + n));
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {QUICK_AMOUNTS.map((o) => (
        <button key={o.n} type="button" onClick={() => add(o.n)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg2, color: T.gold, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          +{o.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = localStorage.getItem(STORAGE_KEY);
        if (res) setData(migrate(JSON.parse(res)));
        else setData(defaultData());
      } catch { setData(defaultData()); }
      finally { setLoaded(true); }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { showToast("저장에 실패했어요"); }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  const T = (data && THEMES[data.theme]) || THEMES.dark;

  if (!loaded || !data) {
    return (
      <ThemeContext.Provider value={DARK}>
        <div style={{ background: DARK.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: DARK.cream, fontFamily: F.body }}>불러오는 중…</div>
        </div>
      </ThemeContext.Provider>
    );
  }

  if (data.pinLock?.enabled && !unlocked) {
    return (
      <ThemeContext.Provider value={T}>
        <LockScreen data={data} onUnlock={() => setUnlocked(true)} />
      </ThemeContext.Provider>
    );
  }

  const today = new Date();
  const todayStr = todayISO();
  const curKey = monthKey(today);
  const cycleLen = daysInMonthKey(curKey);
  const dayIntoCycle = today.getDate();

  const cycleExpenses = data.expenses.filter((e) => e.date.slice(0, 7) === curKey && !e.isReceivable);
  const normalSpent = cycleExpenses.filter((e) => (e.paymentMethod || "cash") !== "card").reduce((s, e) => s + Number(e.amount), 0);
  const cardSpentThisCycle = cycleExpenses.filter((e) => (e.paymentMethod || "cash") === "card").reduce((s, e) => s + Number(e.amount), 0);

  const cards = data.cards && data.cards.length ? data.cards : [{ id: "card1", name: "카드", bill: 0 }];
  const fixedActiveAll = data.fixedExpenses.map((f) => ({ ...f, info: fixedInfo(f, curKey) })).filter((f) => f.info.active);
  const fixedActive = fixedActiveAll.filter((f) => (f.paymentMethod || "cash") !== "card");
  const fixedCardActive = fixedActiveAll.filter((f) => (f.paymentMethod || "cash") === "card");
  const fixedSum = fixedActive.reduce((s, f) => s + Number(f.info.amount), 0);
  const fixedSumAll = fixedActiveAll.reduce((s, f) => s + Number(f.info.amount), 0);
  const totalSpentThisMonth = normalSpent + cardSpentThisCycle + fixedSumAll;

  const cardTotals = cards.map((c) => {
    const fixedPortion = fixedCardActive.filter((f) => (f.cardId || cards[0]?.id) === c.id).reduce((s, f) => s + Number(f.info.amount), 0);
    return { ...c, fixedPortion, total: Number(c.bill || 0) + fixedPortion };
  });
  const cardBillTotal = cardTotals.reduce((s, c) => s + c.total, 0);

  const prevKey = monthKeyOffset(curKey, -1);
  const prevMonthExpenses = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === prevKey);
  const prevSpentDirect = prevMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const prevFixedSum = data.fixedExpenses.map((f) => fixedInfo(f, prevKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const prevTotalSpent = prevSpentDirect + prevFixedSum;

  const categorySpentThisMonth = {};
  cycleExpenses.forEach((e) => { categorySpentThisMonth[e.categoryId] = (categorySpentThisMonth[e.categoryId] || 0) + Number(e.amount); });

  const spent = normalSpent + fixedSum + cardBillTotal;
  const spendingGoal = data.spendingGoal || 0;
  const hasGoal = spendingGoal > 0;
  const remaining = spendingGoal - spent;
  const budgetRatio = hasGoal ? Math.min(spent / spendingGoal, 1.2) : (spent > 0 ? 1.2 : 0);
  const receivables = data.expenses.filter((e) => e.isReceivable && !e.settled);

  const accounts = data.accounts && data.accounts.length ? data.accounts : [{ id: "acc1", name: "통장", initialBalance: 0 }];
  const accountTotals = accounts.map((a) => {
    const aIn = (data.balanceEntries || []).filter((b) => (b.accountId || accounts[0]?.id) === a.id && b.type === "in").reduce((s, b) => s + Number(b.amount), 0);
    const aOut = (data.balanceEntries || []).filter((b) => (b.accountId || accounts[0]?.id) === a.id && b.type === "out").reduce((s, b) => s + Number(b.amount), 0);
    return { ...a, balance: Number(a.initialBalance || 0) + aIn - aOut };
  });
  const accountBalance = accountTotals.reduce((s, a) => s + a.balance, 0);

  const ctx = {
    data, persist, showToast, today, todayStr, curKey, prevKey, cycleLen, dayIntoCycle,
    cycleExpenses, normalSpent, fixedActive, fixedCardActive, fixedSum, fixedSumAll, cards, cardTotals, cardBillTotal, totalSpentThisMonth, prevTotalSpent, categorySpentThisMonth,
    spent, remaining, budgetRatio, receivables, accounts, accountTotals, accountBalance, spendingGoal, hasGoal,
  };

  const S = {
    appShell: { background: `radial-gradient(circle at 50% -10%, ${T.bg2}, ${T.bg} 60%)`, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body },
    screen: { flex: 1, overflowY: "auto", padding: "20px 16px 12px", paddingBottom: 90 },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.navBg, borderTop: `1px solid ${T.goldSoft}55`, backdropFilter: "blur(8px)", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" },
    toast: { position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.gold, color: "#23190C", padding: "8px 16px", borderRadius: 20, fontSize: 14.5, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },
  };

  return (
    <ThemeContext.Provider value={T}>
      <div style={S.appShell}>
        <GoogleFonts />
        <div style={S.screen}>
          {tab === "home" && <HomeView ctx={ctx} />}
          {tab === "add" && <AddView ctx={ctx} />}
          {tab === "ledger" && <LedgerView ctx={ctx} />}
          {tab === "settings" && <SettingsView ctx={ctx} />}
        </div>
        <nav style={S.nav}>
          <NavBtn icon={HomeIcon} label="홈" active={tab === "home"} onClick={() => setTab("home")} />
          <NavBtn icon={Plus} label="기록" active={tab === "add"} onClick={() => setTab("add")} />
          <NavBtn icon={BookOpen} label="내역" active={tab === "ledger"} onClick={() => setTab("ledger")} />
          <NavBtn icon={Settings} label="설정" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    </ThemeContext.Provider>
  );
}

function LockScreen({ data, onUnlock }) {
  const T = useTheme();
  const [entered, setEntered] = useState("");
  const [error, setError] = useState(false);

  const press = (d) => {
    if (entered.length >= 4) return;
    const next = entered + d;
    setEntered(next);
    if (next.length === 4) {
      if (next === data.pinLock.pin) {
        setTimeout(() => onUnlock(), 120);
      } else {
        setError(true);
        setTimeout(() => { setEntered(""); setError(false); }, 500);
      }
    }
  };
  const backspace = () => setEntered((s) => s.slice(0, -1));

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F.body }}>
      <GoogleFonts />
      <div style={{ color: T.gold, fontFamily: F.display, fontSize: 19.5, fontWeight: 700, marginBottom: 24 }}>내 돈 챙겨줘</div>
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: "50%",
            background: i < entered.length ? (error ? T.danger : T.gold) : "transparent",
            border: `2px solid ${error ? T.danger : T.goldSoft}`,
          }} />
        ))}
      </div>
      <div style={{ height: 16, color: T.danger, fontSize: 13.5, marginBottom: 10 }}>{error ? "PIN이 올바르지 않아요" : ""}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 68px)", gap: 16 }}>
        {keys.map((k, i) =>
          k === "" ? (
            <div key={i} />
          ) : (
            <button key={i} onClick={() => (k === "⌫" ? backspace() : press(k))}
              style={{ width: 68, height: 68, borderRadius: "50%", border: `1px solid ${T.border}`, background: T.bg2, color: T.cream, fontSize: 21.5, fontWeight: 600, cursor: "pointer" }}>
              {k}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function GoogleFonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
      * { box-sizing: border-box; }
      input, select { font-family: inherit; }
      ::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

function NavBtn({ icon: Icon, label, active, onClick }) {
  const T = useTheme();
  return (
    <button onClick={onClick} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0", cursor: "pointer", color: active ? T.gold : T.muted, transition: "color 0.2s" }}>
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span style={{ fontSize: 11.5, fontFamily: F.body, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

function SectionLabel({ children }) {
  const T = useTheme();
  return <div style={{ color: T.goldSoft, fontSize: 12.5, fontWeight: 700, marginBottom: 8, marginTop: 4, paddingLeft: 2 }}>{children}</div>;
}

function Field({ label, children }) {
  const T = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

/* ---------- Home ---------- */
function HomeView({ ctx }) {
  const T = useTheme();
  const { data, curKey, dayIntoCycle, cycleLen, remaining, budgetRatio,
    fixedSum, fixedSumAll, normalSpent, fixedActive, fixedCardActive, cardTotals, receivables, cycleExpenses, accountBalance, hasGoal } = ctx;
  const over = remaining < 0;
  const ringColor = budgetRatio < 0.7 ? T.good : budgetRatio < 1 ? T.warn : T.danger;
  const dashArray = 2 * Math.PI * 54;
  const dashOffset = dashArray * (1 - Math.min(budgetRatio, 1));
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const recent = [...cycleExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <div>
      <BalanceCard ctx={ctx} accountBalance={accountBalance} />

      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.border}, transparent)`, margin: "26px 0 0" }} />

      <div style={{ textAlign: "center", marginBottom: 6, marginTop: 20 }}>
        <div style={{ color: T.muted, fontSize: 13.5, letterSpacing: 1 }}>내 돈 챙겨줘</div>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 21.5, fontWeight: 700, marginTop: 2 }}>
          {monthLabel(curKey)} · {dayIntoCycle}일차
        </div>
      </div>

      <SectionLabel>이번 달 목표 (계획)</SectionLabel>
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}>
        <div style={{ position: "relative", width: 176, height: 176 }}>
          <svg width="176" height="176" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke={T.mode === "dark" ? "#2A2F4C" : "#DCCBA0"} strokeWidth="10" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: T.muted, fontSize: 11.5, marginBottom: 2 }}>{over ? "목표 초과" : "이번 달 사용 가능"}</div>
            <div style={{ color: over ? T.danger : T.cream, fontFamily: F.mono, fontWeight: 600, fontSize: 19.5, lineHeight: 1.15, textAlign: "center" }}>
              {over ? "-" : ""}{fmtWon(Math.abs(remaining))}
            </div>
            <div style={{ color: T.goldSoft, fontSize: 11.5, marginTop: 4 }}>
              {cycleLen - dayIntoCycle >= 0 ? `${cycleLen - dayIntoCycle}일 남음` : ""}
            </div>
          </div>
        </div>
      </div>
      {!hasGoal && (
        <div style={{ textAlign: "center", color: T.warn, fontSize: 12.5, marginTop: -4, marginBottom: 6 }}>
          설정에서 이번 달 목표 지출액을 정해주세요
        </div>
      )}
      <div style={{ textAlign: "center", color: T.muted, fontSize: 11, marginTop: -4, marginBottom: 14, padding: "0 24px" }}>
        목표 지출액 기준 계획상 금액이에요 · 카드값은 결제 전까지 통장 잔액에 반영 안 돼요
      </div>

      <SummaryCard ctx={ctx} />

      <SectionLabel>지출 현황</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <StatCard label="고정지출(대출/카드할부 등)" value={fmtWon(fixedSumAll)} />
        <StatCard label="현금지출" value={fmtWon(normalSpent)} />
      </div>

      <CardsBlock ctx={ctx} cardTotals={cardTotals} />

      {(fixedActive.length > 0 || fixedCardActive.length > 0 || receivables.length > 0 || data.categories.some((c) => c.budget > 0)) && (
        <>
          <SectionLabel>예산 관리</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <CategoryBudgetCard ctx={ctx} />
            {(fixedActive.length > 0 || fixedCardActive.length > 0) && (
              <FixedDetailCard ctx={ctx} fixedActive={fixedActive} fixedCardActive={fixedCardActive} />
            )}
            {receivables.length > 0 && <ReceivablesCard ctx={ctx} receivables={receivables} catMap={catMap} />}
          </div>
        </>
      )}

      <div style={paperCard(T)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontFamily: F.display, color: T.ink, fontSize: 16.5, fontWeight: 700 }}>최근 기록</div>
          <div style={{ fontSize: 12.5, color: T.goldSoft }}>이번 달 {cycleExpenses.length}건</div>
        </div>
        {recent.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 14.5, textAlign: "center", padding: "18px 0" }}>
            아직 이번 달 기록이 없어요.<br />지출이 생기면 &lsquo;기록&rsquo; 탭에서 남겨보세요.
          </div>
        ) : (
          recent.map((e) => <LedgerRow key={e.id} e={e} cat={catMap[e.categoryId]} />)
        )}
      </div>
    </div>
  );
}

function ReceivablesCard({ ctx, receivables, catMap }) {
  const T = useTheme();
  const [settlingId, setSettlingId] = useState(null);
  const [repaidInput, setRepaidInput] = useState("");
  const open = (r) => { setSettlingId(r.id); setRepaidInput(String(r.amount)); };
  const confirm = (r) => { settleReceivable(ctx, r, repaidInput); setSettlingId(null); setRepaidInput(""); };
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.good}55`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <HandCoins size={13} color={T.good} />
        <span style={{ color: T.good, fontSize: 12.5, fontWeight: 700 }}>대리결제(추후 정산)</span>
      </div>
      {receivables.map((r) => (
        <div key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, color: T.cream, padding: "3px 0" }}>
            <span>{r.memo || catMap[r.categoryId]?.name || "대리결제"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: F.mono, color: T.good }}>{fmtWon(r.amount)}</span>
              {settlingId !== r.id && (
                <button onClick={() => open(r)} style={{ background: T.good, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#fff", fontSize: 12, fontWeight: 700 }}>정산</button>
              )}
            </span>
          </div>
          {settlingId === r.id && (
            <div style={{ marginTop: 4, marginBottom: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>실제 상환받은 금액 (부족분→카드값, 초과분→통장)</div>
              <MoneyInput value={repaidInput} onChange={setRepaidInput} autoFocus />
              <QuickAmountButtons amount={repaidInput} setAmount={setRepaidInput} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setSettlingId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 13, cursor: "pointer" }}>취소</button>
                <button onClick={() => confirm(r)} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>정산 확정</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ ctx }) {
  const T = useTheme();
  const { curKey, totalSpentThisMonth, prevTotalSpent, remaining, hasGoal } = ctx;
  const hasPrev = prevTotalSpent > 0;
  const pct = hasPrev ? Math.round(((totalSpentThisMonth - prevTotalSpent) / prevTotalSpent) * 100) : null;
  const up = pct != null && pct > 0;
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 4 }}>{monthLabel(curKey)} 요약</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 16.5, fontWeight: 700 }}>총 지출 {fmtWon(totalSpentThisMonth)}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: pct == null ? T.muted : up ? T.danger : T.good }}>
          {pct == null ? "지난달 비교 데이터 없음" : `지난달 대비 ${up ? "+" : ""}${pct}%`}
        </div>
      </div>
      {hasGoal && (
        <div style={{ color: remaining >= 0 ? T.good : T.danger, fontSize: 13.5, marginTop: 4 }}>
          {remaining >= 0 ? `목표 대비 여유 ${fmtWon(remaining)}` : `목표 초과 ${fmtWon(Math.abs(remaining))}`}
        </div>
      )}
    </div>
  );
}


function FixedDetailCard({ ctx, fixedActive, fixedCardActive }) {
  const T = useTheme();
  const { data } = ctx;
  const [sortKey, setSortKey] = useState("default");
  const combined = [...fixedActive, ...fixedCardActive];
  const sorted = sortFixedList(combined, sortKey);
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 6 }}>이번달 고정지출 상세내역</div>
      <FixedSortTabs sortKey={sortKey} setSortKey={setSortKey} />
      {sorted.map((f) => {
        const isCard = (f.paymentMethod || "cash") === "card";
        return (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, color: T.cream, padding: "3px 0" }}>
            <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""}
              <span style={{ color: isCard ? T.gold : T.muted, fontSize: 11.5 }}>
                {" · "}{isCard ? (data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드") : (data.accounts.find((a) => a.id === f.accountId)?.name || "통장")}
              </span>
            </span>
            <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(f.info.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBudgetCard({ ctx }) {
  const T = useTheme();
  const { data, categorySpentThisMonth } = ctx;
  const budgeted = data.categories.filter((c) => c.budget > 0);
  if (budgeted.length === 0) return null;
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 8 }}>카테고리별 예산</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {budgeted.map((c) => {
          const spent = categorySpentThisMonth[c.id] || 0;
          const ratio = Math.min(spent / c.budget, 1);
          const over = spent > c.budget;
          return (
            <div key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: T.cream, marginBottom: 3 }}>
                <span>{c.name}</span>
                <span style={{ color: over ? T.danger : T.muted, fontFamily: F.mono, fontSize: 12.5 }}>{fmtWon(spent)} / {fmtWon(c.budget)}</span>
              </div>
              <div style={{ height: 6, background: T.mode === "dark" ? "#2A2F4C" : "#DCCBA0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${ratio * 100}%`, height: "100%", background: over ? T.danger : c.color, transition: "width 0.4s" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function settleReceivable(ctx, exp, repaidAmount) {
  const { data, persist, showToast } = ctx;
  const repaid = Number(repaidAmount);
  if (repaidAmount === "" || Number.isNaN(repaid) || repaid < 0) { showToast("상환받은 금액을 입력해주세요"); return; }
  const diff = repaid - exp.amount;
  let next = { ...data, expenses: data.expenses.map((e) => (e.id === exp.id ? { ...e, settled: true, repaidAmount: repaid, settledAt: todayISO() } : e)) };
  if (diff < 0) {
    const cid = exp.cardId || data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Number(c.bill || 0) + Math.abs(diff) } : c));
  } else if (diff > 0) {
    const aid = data.accounts[0]?.id;
    next.balanceEntries = [...(next.balanceEntries || []), { id: "b" + Date.now(), type: "in", amount: diff, date: todayISO(), memo: "대리결제 정산 차액", accountId: aid }];
  }
  persist(next);
  if (diff < 0) showToast(`부족분 ${fmtWon(Math.abs(diff))}이 카드값에 반영됐어요`);
  else if (diff > 0) showToast(`초과분 ${fmtWon(diff)}이 통장 잔액에 반영됐어요`);
  else showToast("정산 완료했어요");
}

function payCard(ctx, card) {
  const { data, persist, showToast } = ctx;
  const billOnly = Number(card.bill || 0);
  if (!billOnly || billOnly <= 0) return showToast("직접 등록한 카드 지출이 없어요");
  const nextCards = data.cards.map((c) => (c.id === card.id ? { ...c, bill: 0 } : c));
  persist({ ...data, cards: nextCards, balanceEntries: [...(data.balanceEntries || []), { id: "b" + Date.now(), type: "out", amount: billOnly, date: todayISO(), memo: `${card.name} 카드값 결제` }] });
  showToast(`${fmtWon(billOnly)} 결제 처리 · 통장에서 출금됐어요`);
}

function CardsBlock({ ctx, cardTotals }) {
  const T = useTheme();
  if (!cardTotals || cardTotals.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      {cardTotals.map((c) => (
        <div key={c.id} style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: T.muted, fontSize: 12.5 }}>{c.name}</div>
            <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 15.5, fontWeight: 700 }}>{fmtWon(c.total)}</div>
            {c.fixedPortion > 0 && <div style={{ color: T.goldSoft, fontSize: 11.5 }}>이번 달 할부 {fmtWon(c.fixedPortion)} 포함</div>}
          </div>
          <button onClick={() => payCard(ctx, c)} disabled={!c.bill}
            style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: c.bill ? T.gold : T.border, color: c.bill ? "#23190C" : T.muted, fontSize: 13, fontWeight: 700, cursor: c.bill ? "pointer" : "default" }}>
            결제하기
          </button>
        </div>
      ))}
    </div>
  );
}

function BalanceCard({ ctx, accountBalance }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const accountTotals = ctx.accountTotals || [];
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [accountId, setAccountId] = useState(data.accounts?.[0]?.id || "");
  const [expanded, setExpanded] = useState(false);

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!accountId) return showToast("통장을 먼저 선택해주세요");
    const entry = { id: "b" + Date.now(), type: mode, amount: n, date: todayISO(), memo: memo.trim(), accountId };
    persist({ ...data, balanceEntries: [...(data.balanceEntries || []), entry] });
    setAmount(""); setMemo(""); setMode(null);
    showToast(mode === "in" ? "입금을 기록했어요" : "출금을 기록했어요");
  };

  return (
    <div style={{ background: T.bg2, border: `1.5px solid ${T.good}77`, borderRadius: 14, padding: "14px 16px" }}>
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", padding: 0, cursor: accountTotals.length > 1 ? "pointer" : "default", width: "100%", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Wallet size={14} color={T.good} />
          <span style={{ color: T.good, fontSize: 12.5, fontWeight: 700 }}>통장 잔액 (총합){accountTotals.length > 1 ? (expanded ? " ▲" : " ▼") : ""}</span>
        </div>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 26, fontWeight: 700, marginBottom: 2 }}>{fmtWon(accountBalance)}</div>
        <div style={{ color: T.good, fontSize: 10.5, marginBottom: 10 }}>실제로 계좌에 있는 돈 · 입출금·현금결제만 실시간 반영</div>
      </button>
      {expanded && accountTotals.length > 1 && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {accountTotals.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: T.cream, padding: "3px 0", borderBottom: `1px dashed ${T.border}` }}>
              <span>{a.name}</span>
              <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(a.balance)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setMode(mode === "in" ? null : "in")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.good}`, background: mode === "in" ? T.good + "22" : "transparent", color: T.good, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          <ArrowDownCircle size={14} /> 입금
        </button>
        <button onClick={() => setMode(mode === "out" ? null : "out")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.danger}`, background: mode === "out" ? T.danger + "22" : "transparent", color: T.danger, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          <ArrowUpCircle size={14} /> 출금
        </button>
      </div>
      {mode && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {(data.accounts || []).length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.accounts.map((a) => (
                <button key={a.id} onClick={() => setAccountId(a.id)}
                  style={{ padding: "6px 10px", borderRadius: 16, border: accountId === a.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                    background: accountId === a.id ? T.gold + "22" : "transparent", color: accountId === a.id ? T.cream : T.muted, fontSize: 13, cursor: "pointer" }}>
                  {a.name}
                </button>
              ))}
            </div>
          )}
          <MoneyInput value={amount} onChange={setAmount} placeholder="금액" autoFocus />
          <QuickAmountButtons amount={amount} setAmount={setAmount} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="표기내역" style={{ ...inputSty(T), marginTop: 4 }} />
          <button onClick={submit} style={{ ...primaryBtn(T), background: mode === "in" ? T.good : T.danger, color: "#fff", marginTop: 4 }}>
            {mode === "in" ? "입금 기록" : "출금 기록"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  const T = useTheme();
  return (
    <div style={{ flex: 1, background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 10px" }}>
      <div style={{ color: T.muted, fontSize: 11.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function LedgerRow({ e, cat }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>
          {cat ? cat.name : "미분류"}
          <span style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 700, color: (e.paymentMethod || "cash") === "card" ? T.gold : T.good }}>
            {(e.paymentMethod || "cash") === "card" ? "카드" : "현금"}
          </span>
        </div>
        {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo}</div>}
      </div>
      <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{e.date.slice(5)}</div>
      <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5, minWidth: 74, textAlign: "right" }}>{fmtWon(e.amount)}</div>
    </div>
  );
}

/* ---------- Add ---------- */
function AddView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [payMethod, setPayMethod] = useState("card"); // card | cash | installment
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [isReceivable, setIsReceivable] = useState(false);
  const [cardId, setCardId] = useState(data.cards?.[0]?.id || "");
  const [accountId, setAccountId] = useState(data.accounts?.[0]?.id || "");
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PALETTE[0]);
  const [catBudgetEditing, setCatBudgetEditing] = useState(false);
  const [catBudgetInput, setCatBudgetInput] = useState("");

  const selectedCategory = data.categories.find((c) => c.id === categoryId);
  const saveCatBudget = () => {
    const n = Number(catBudgetInput);
    if (Number.isNaN(n) || n < 0) return showToast("올바른 금액을 입력해주세요");
    persist({ ...data, categories: data.categories.map((c) => (c.id === categoryId ? { ...c, budget: n } : c)) });
    setCatBudgetEditing(false); setCatBudgetInput("");
    showToast(n > 0 ? "카테고리 예산을 저장했어요" : "카테고리 예산을 해제했어요");
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const cat = { id: "c" + Date.now(), name: newCatName.trim(), color: newCatColor, budget: 0 };
    persist({ ...data, categories: [...data.categories, cat] });
    setCategoryId(cat.id); setNewCatName(""); setNewCatMode(false);
  };

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!categoryId) return showToast("카테고리를 선택해주세요");
    if (payMethod === "card" && !cardId) return showToast("설정에서 카드를 먼저 등록해주세요");
    if (payMethod === "cash" && !accountId) return showToast("설정에서 통장을 먼저 등록해주세요");
    const catName = data.categories.find((c) => c.id === categoryId)?.name || "지출";
    const linkedBalanceId = !isReceivable && payMethod === "cash" ? "b" + Date.now() : null;
    const expense = { id: "e" + Date.now(), amount: n, categoryId, date, memo: memo.trim(), isReceivable, settled: false, repaidAmount: null, paymentMethod: payMethod, cardId: payMethod === "card" ? cardId : null, linkedBalanceId };
    let next = { ...data, expenses: [...data.expenses, expense] };
    if (!isReceivable) {
      if (payMethod === "card") {
        next.cards = data.cards.map((c) => (c.id === cardId ? { ...c, bill: Number(c.bill || 0) + n } : c));
      } else {
        next.balanceEntries = [...(next.balanceEntries || []), { id: linkedBalanceId, type: "out", amount: n, date, memo: `${catName}${memo.trim() ? " · " + memo.trim() : ""}`, accountId }];
      }
    }
    persist(next);
    setAmount(""); setMemo(""); setIsReceivable(false);
    showToast(isReceivable ? "대리결제로 기록했어요" : payMethod === "card" ? "카드값에 반영했어요" : "통장에서 차감했어요");
  };

  return (
    <div>
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700, marginBottom: 16 }}>기록</div>

      <Field label="결제 수단">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPayMethod("card")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: payMethod === "card" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <CreditCard size={14} /> 카드
          </button>
          <button onClick={() => setPayMethod("cash")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: payMethod === "cash" ? T.good + "22" : "transparent", color: T.cream, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <Wallet size={14} /> 현금(통장)
          </button>
          <button onClick={() => setPayMethod("installment")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "installment" ? `2px solid ${T.warn}` : `1px solid ${T.border}`, background: payMethod === "installment" ? T.warn + "22" : "transparent", color: T.cream, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            <Repeat size={14} /> 할부(고정지출)
          </button>
        </div>
      </Field>

      {payMethod === "installment" ? (
        <InstallmentForm ctx={ctx} />
      ) : (
        <>
          <Field label="금액">
            <MoneyInput value={amount} onChange={setAmount} big />
            <QuickAmountButtons amount={amount} setAmount={setAmount} />
          </Field>

          {payMethod === "card" ? (
            (data.cards || []).length > 0 ? (
              <Field label="카드">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.cards.map((c) => (
                    <button key={c.id} onClick={() => setCardId(c.id)}
                      style={{ padding: "7px 12px", borderRadius: 20, border: cardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                        background: cardId === c.id ? T.gold + "22" : "transparent", color: cardId === c.id ? T.cream : T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <div style={{ color: T.warn, fontSize: 12.5, marginBottom: 16 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
            )
          ) : (
            (data.accounts || []).length > 1 && (
              <Field label="통장">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.accounts.map((a) => (
                    <button key={a.id} onClick={() => setAccountId(a.id)}
                      style={{ padding: "7px 12px", borderRadius: 20, border: accountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                        background: accountId === a.id ? T.good + "22" : "transparent", color: accountId === a.id ? T.cream : T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      {a.name}
                    </button>
                  ))}
                </div>
              </Field>
            )
          )}

          <Field label="카테고리">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryId(c.id)}
                  style={{ padding: "8px 14px", borderRadius: 20, border: categoryId === c.id ? `2px solid ${c.color}` : `1px solid ${T.border}`,
                    background: categoryId === c.id ? c.color + "22" : "transparent", color: categoryId === c.id ? T.cream : T.muted,
                    fontSize: 14.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />
                  {c.name}
                </button>
              ))}
              <button onClick={() => setNewCatMode(!newCatMode)}
                style={{ padding: "8px 12px", borderRadius: 20, border: `1px dashed ${T.gold}`, background: "transparent", color: T.gold, fontSize: 14.5, cursor: "pointer" }}>
                + 새 카테고리
              </button>
            </div>
            {selectedCategory && (
              <button onClick={() => { setCatBudgetEditing(!catBudgetEditing); setCatBudgetInput(String(selectedCategory.budget || "")); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10,
                  background: T.bg2, border: `1px solid ${T.gold}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                <span style={{ color: T.cream, fontSize: 13.5, fontWeight: 600 }}>
                  {selectedCategory.name} 예산: <span style={{ color: selectedCategory.budget > 0 ? T.gold : T.muted, fontFamily: F.mono, fontWeight: 700 }}>{selectedCategory.budget > 0 ? fmtWon(selectedCategory.budget) : "없음"}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.gold, fontSize: 12.5, fontWeight: 700 }}>
                  <Pencil size={16} /> 설정
                </span>
              </button>
            )}
            {catBudgetEditing && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <MoneyInput value={catBudgetInput} onChange={setCatBudgetInput} placeholder="이번 달 예산 (0=해제)" />
                  <button onClick={saveCatBudget} style={{ ...primaryBtn(T), width: 60 }}>확인</button>
                </div>
                <QuickAmountButtons amount={catBudgetInput} setAmount={setCatBudgetInput} />
              </div>
            )}
            {newCatMode && (
              <div style={{ marginTop: 10, background: T.bg2, borderRadius: 10, padding: 12 }}>
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="표기내역" style={{ ...inputSty(T), marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {PALETTE.map((col) => (
                    <button key={col} onClick={() => setNewCatColor(col)}
                      style={{ width: 24, height: 24, borderRadius: "50%", background: col, border: newCatColor === col ? `2px solid ${T.cream}` : "2px solid transparent", cursor: "pointer" }} />
                  ))}
                </div>
                <button onClick={addCategory} style={primaryBtn(T)}>카테고리 추가</button>
              </div>
            )}
          </Field>

          <Field label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputSty(T)} />
          </Field>

          <Field label="메모 (선택)">
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
          </Field>

          <button onClick={() => setIsReceivable(!isReceivable)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: isReceivable ? T.good + "22" : T.bg2,
              border: isReceivable ? `1px solid ${T.good}` : `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, cursor: "pointer" }}>
            <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isReceivable ? T.good : T.muted}`, background: isReceivable ? T.good : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isReceivable && <Check size={13} color="#fff" />}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: isReceivable ? T.good : T.cream, fontSize: 14.5, fontWeight: 700 }}>대리결제 (추후 정산)</div>
              <div style={{ color: T.muted, fontSize: 12.5 }}>예산에서 빠지고 홈 화면에서 바로 정산할 수 있어요.</div>
            </div>
          </button>

          <button onClick={submit} style={{ ...primaryBtn(T), padding: "14px 0", fontSize: 16.5 }}>
            <Check size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
            기록하기
          </button>
        </>
      )}
    </div>
  );
}

function InstallmentForm({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalMonths, setTotalMonths] = useState("");
  const [startInstallment, setStartInstallment] = useState("1");
  const [fixedPaymentMethod, setFixedPaymentMethod] = useState("cash");
  const [fixedCardId, setFixedCardId] = useState(data.cards?.[0]?.id || "");
  const [fixedAccountId, setFixedAccountId] = useState(data.accounts?.[0]?.id || "");
  const [overrideEditId, setOverrideEditId] = useState(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [sortKey, setSortKey] = useState("default");
  const [reassignEditId, setReassignEditId] = useState(null);

  const reassignFixed = (f, newId) => {
    const field = (f.paymentMethod || "cash") === "card" ? "cardId" : "accountId";
    const updated = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, [field]: newId } : x));
    persist({ ...data, fixedExpenses: updated });
    setReassignEditId(null);
    showToast("변경했어요");
  };

  const removeFixed = (id) => {
    const f = data.fixedExpenses.find((x) => x.id === id);
    if (!f) return;
    const trashItem = { id: "t" + Date.now(), type: "fixed", deletedAt: todayISO(), payload: f };
    persist({ ...data, fixedExpenses: data.fixedExpenses.filter((x) => x.id !== id), trash: [...(data.trash || []), trashItem] });
  };
  const addFixed = () => {
    const n = Number(fixedAmount);
    if (!fixedName.trim()) return showToast("표기내역을 입력해주세요");
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (fixedPaymentMethod === "card" && !fixedCardId) return showToast("카드를 먼저 등록/선택하세요");
    if (fixedPaymentMethod === "cash" && !fixedAccountId) return showToast("통장을 먼저 등록/선택하세요");
    let item;
    if (isInstallment) {
      const tm = Number(totalMonths); const si = Number(startInstallment);
      if (!tm || tm < 1) return showToast("총 개월수를 입력해주세요");
      if (!si || si < 1 || si > tm) return showToast("현재 회차를 올바르게 입력해주세요 (1~총개월수)");
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: tm, startInstallment: si, setupMonthKey: curKey, overrides: {}, paymentMethod: fixedPaymentMethod, cardId: fixedPaymentMethod === "card" ? fixedCardId : null, accountId: fixedPaymentMethod === "cash" ? fixedAccountId : null };
    } else {
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: 0, startInstallment: 1, setupMonthKey: curKey, overrides: {}, paymentMethod: fixedPaymentMethod, cardId: fixedPaymentMethod === "card" ? fixedCardId : null, accountId: fixedPaymentMethod === "cash" ? fixedAccountId : null };
    }
    persist({ ...data, fixedExpenses: [...(data.fixedExpenses || []), item] });
    setFixedName(""); setFixedAmount(""); setTotalMonths(""); setStartInstallment("1"); setIsInstallment(false);
    showToast("표기내역을 추가했어요");
  };
  const saveOverride = (f) => {
    const n = Number(overrideInput);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    const updated = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, overrides: { ...x.overrides, [curKey]: n } } : x));
    persist({ ...data, fixedExpenses: updated });
    setOverrideEditId(null); setOverrideInput("");
    showToast("이번 달 금액을 수정했어요");
  };

  return (
    <div>
      <div style={{ background: T.bg2, borderRadius: 10, padding: 10, marginBottom: 16 }}>
        <FixedSortTabs sortKey={sortKey} setSortKey={setSortKey} />
        {sortFixedList((data.fixedExpenses || []).map((f) => ({ ...f, info: fixedInfo(f, curKey) })), sortKey).map((f) => {
          const info = f.info;
          return (
            <div key={f.id} style={{ padding: "8px 4px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.cream, fontSize: 14.5, fontWeight: 600 }}>
                    {f.name}{info.label ? ` · ${info.label}` : ""}{!info.active ? " · 완료" : ""}
                  </div>
                  <div style={{ color: T.muted, fontSize: 12.5 }}>
                    {f.totalMonths ? "할부" : "매달 반복"} · 기본 {fmtWon(f.baseAmount)} · {(f.paymentMethod || "cash") === "card" ? (data.cards.find((c) => c.id === f.cardId)?.name || "카드") : (data.accounts.find((a) => a.id === f.accountId)?.name || "통장(자동이체)")}
                  </div>
                </div>
                {info.active && (
                  <button onClick={() => { setOverrideEditId(f.id); setOverrideInput(String(info.amount)); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold }}><Pencil size={14} /></button>
                )}
                <button onClick={() => setReassignEditId(reassignEditId === f.id ? null : f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.good }}>
                  {(f.paymentMethod || "cash") === "card" ? <CreditCard size={14} /> : <Wallet size={14} />}
                </button>
                <button onClick={() => removeFixed(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
              </div>
              {overrideEditId === f.id && (
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <MoneyInput value={overrideInput} onChange={setOverrideInput} />
                  <button onClick={() => saveOverride(f)} style={{ ...primaryBtn(T), width: 60 }}>확인</button>
                </div>
              )}
              {reassignEditId === f.id && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: T.muted, fontSize: 11.5, marginBottom: 4 }}>
                    {(f.paymentMethod || "cash") === "card" ? "다른 카드로 변경" : "다른 통장으로 변경"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {((f.paymentMethod || "cash") === "card" ? data.cards : data.accounts).map((opt) => {
                      const curId = (f.paymentMethod || "cash") === "card" ? f.cardId : f.accountId;
                      const active = curId === opt.id;
                      return (
                        <button key={opt.id} onClick={() => reassignFixed(f, opt.id)}
                          style={{ padding: "6px 10px", borderRadius: 16, border: active ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                            background: active ? T.good + "22" : "transparent", color: active ? T.cream : T.muted, fontSize: 13, cursor: "pointer" }}>
                          {opt.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(!data.fixedExpenses || data.fixedExpenses.length === 0) && (
          <div style={{ color: T.muted, fontSize: 13.5, textAlign: "center", padding: "8px 0 12px" }}>등록된 표기내역이 없어요.</div>
        )}
      </div>

      <Field label="표기내역">
        <input value={fixedName} onChange={(e) => setFixedName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
      </Field>
      <Field label="월 납입 금액">
        <MoneyInput value={fixedAmount} onChange={setFixedAmount} />
        <QuickAmountButtons amount={fixedAmount} setAmount={setFixedAmount} />
      </Field>
      <Field label="반복 유형">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setIsInstallment(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: !isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: !isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>매달 반복</button>
          <button onClick={() => setIsInstallment(true)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>할부</button>
        </div>
        {isInstallment && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 11.5, marginBottom: 3 }}>총 개월수</div>
              <input type="number" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} placeholder="0" style={{ ...inputSty(T), fontFamily: F.mono }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 11.5, marginBottom: 3 }}>현재 회차</div>
              <input type="number" value={startInstallment} onChange={(e) => setStartInstallment(e.target.value)} placeholder="1" style={{ ...inputSty(T), fontFamily: F.mono }} />
            </div>
          </div>
        )}
      </Field>
      <Field label="결제 방식">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setFixedPaymentMethod("cash")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: fixedPaymentMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: fixedPaymentMethod === "cash" ? T.good + "22" : "transparent", color: T.cream, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            통장(자동이체)
          </button>
          <button onClick={() => setFixedPaymentMethod("card")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: fixedPaymentMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: fixedPaymentMethod === "card" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            카드
          </button>
        </div>
        {fixedPaymentMethod === "card" && (
          (data.cards || []).length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {data.cards.map((c) => (
                <button key={c.id} onClick={() => setFixedCardId(c.id)}
                  style={{ padding: "6px 10px", borderRadius: 16, border: fixedCardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                    background: fixedCardId === c.id ? T.gold + "22" : "transparent", color: fixedCardId === c.id ? T.cream : T.muted, fontSize: 13, cursor: "pointer" }}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: T.warn, fontSize: 12.5, marginTop: 8 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
          )
        )}
        {fixedPaymentMethod === "cash" && (data.accounts || []).length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {data.accounts.map((a) => (
              <button key={a.id} onClick={() => setFixedAccountId(a.id)}
                style={{ padding: "6px 10px", borderRadius: 16, border: fixedAccountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                  background: fixedAccountId === a.id ? T.good + "22" : "transparent", color: fixedAccountId === a.id ? T.cream : T.muted, fontSize: 13, cursor: "pointer" }}>
                {a.name}
              </button>
            ))}
          </div>
        )}
      </Field>
      <button onClick={addFixed} style={primaryBtn(T)}>표기내역 추가</button>
    </div>
  );
}

/* ---------- Ledger (history) ---------- */
function LedgerView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [filter, setFilter] = useState("cycle");
  const [search, setSearch] = useState("");
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (e) => {
    if (!searchLower) return true;
    const catName = (catMap[e.categoryId]?.name || "").toLowerCase();
    return (e.memo || "").toLowerCase().includes(searchLower) || catName.includes(searchLower);
  };

  const list = useMemo(() => {
    let arr;
    if (filter === "receivable") arr = [...data.expenses.filter((e) => e.isReceivable)].sort((a, b) => (a.settled === b.settled ? b.date.localeCompare(a.date) : a.settled ? 1 : -1));
    else if (filter === "card") arr = [...data.expenses.filter((e) => !e.isReceivable && (e.paymentMethod || "cash") === "card")].sort((a, b) => b.date.localeCompare(a.date));
    else {
      arr = data.expenses.filter((e) => !e.isReceivable);
      if (filter === "cycle") arr = arr.filter((e) => e.date.slice(0, 7) === curKey);
      arr = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    }
    return arr.filter(matchesSearch);
  }, [data.expenses, filter, curKey, searchLower]);

  const balanceList = useMemo(() => {
    const arr = [...(data.balanceEntries || [])].sort((a, b) => b.date.localeCompare(a.date));
    if (!searchLower) return arr;
    return arr.filter((b) => (b.memo || "").toLowerCase().includes(searchLower));
  }, [data.balanceEntries, searchLower]);

  const remove = (id) => {
    const exp = data.expenses.find((e) => e.id === id);
    if (!exp) return;
    let next = { ...data, expenses: data.expenses.filter((e) => e.id !== id) };
    let linkedBalanceEntry = null;
    let cardBillDelta = 0;
    let cardIdForTrash = null;
    if (!exp.isReceivable) {
      if ((exp.paymentMethod || "cash") === "card") {
        cardBillDelta = Number(exp.amount);
        cardIdForTrash = exp.cardId || data.cards[0]?.id;
        next.cards = data.cards.map((c) => (c.id === cardIdForTrash ? { ...c, bill: Math.max(0, Number(c.bill || 0) - cardBillDelta) } : c));
      } else if (exp.linkedBalanceId) {
        linkedBalanceEntry = (data.balanceEntries || []).find((b) => b.id === exp.linkedBalanceId) || null;
        next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
      }
    }
    const trashItem = { id: "t" + Date.now(), type: "expense", deletedAt: todayISO(), expense: exp, linkedBalanceEntry, cardBillDelta, cardId: cardIdForTrash };
    next.trash = [...(data.trash || []), trashItem];
    persist(next);
    showToast("휴지통으로 이동했어요");
  };
  const removeBalance = (id) => {
    const b = data.balanceEntries.find((x) => x.id === id);
    if (!b) return;
    const trashItem = { id: "t" + Date.now(), type: "balance", deletedAt: todayISO(), payload: b };
    persist({ ...data, balanceEntries: data.balanceEntries.filter((x) => x.id !== id), trash: [...(data.trash || []), trashItem] });
    showToast("휴지통으로 이동했어요");
  };
  const restoreTrash = (t) => {
    let next = { ...data, trash: (data.trash || []).filter((x) => x.id !== t.id) };
    if (t.type === "expense") {
      next.expenses = [...data.expenses, t.expense];
      if (t.linkedBalanceEntry) next.balanceEntries = [...(next.balanceEntries || data.balanceEntries || []), t.linkedBalanceEntry];
      if (t.cardBillDelta) {
        const cid = t.cardId || data.cards[0]?.id;
        next.cards = (next.cards || data.cards).map((c) => (c.id === cid ? { ...c, bill: Number(c.bill || 0) + t.cardBillDelta } : c));
      }
    } else if (t.type === "balance") {
      next.balanceEntries = [...(next.balanceEntries || data.balanceEntries || []), t.payload];
    } else if (t.type === "fixed") {
      next.fixedExpenses = [...(data.fixedExpenses || []), t.payload];
    }
    persist(next);
    showToast("복원했어요");
  };
  const purgeTrash = (id) => persist({ ...data, trash: (data.trash || []).filter((x) => x.id !== id) });
  const emptyTrash = () => {
    if (!data.trash?.length) return showToast("휴지통이 비어있어요");
    persist({ ...data, trash: [] });
    showToast("휴지통을 비웠어요");
  };



  const grouped = useMemo(() => {
    const map = {};
    list.forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700 }}>전체 내역</div>
        <div style={{ display: "flex", background: T.bg2, borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
          {[["cycle", "이번달"], ["all", "전체"], ["card", "카드"], ["receivable", "대리결제"], ["balance", "입출금"], ["trash", "휴지통"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 12.5, fontWeight: 600,
                background: filter === k ? T.gold : "transparent", color: filter === k ? "#23190C" : T.muted, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="메모나 카테고리로 검색"
        style={{ ...inputSty(T), marginBottom: 14, fontSize: 14.5 }} />

      {filter === "trash" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={emptyTrash} style={{ background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
              휴지통 비우기
            </button>
          </div>
          {(!data.trash || data.trash.length === 0) ? (
            <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>휴지통이 비어있어요.</div>
          ) : (
            <div style={paperCard(T)}>
              {[...data.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>{trashLabel(t, catMap)}</div>
                    <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5 }}>{t.deletedAt} 삭제됨</div>
                  </div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5 }}>{fmtWon(trashAmount(t))}</div>
                  <button onClick={() => restoreTrash(t)} style={{ background: T.good, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>복원</button>
                  <button onClick={() => purgeTrash(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : filter === "card" ? (
        <>
          <div style={{ color: T.goldSoft, fontSize: 12.5, marginBottom: 8 }}>결제하기는 홈 화면에서 할 수 있어요. 여기서는 기록만 확인해요.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {ctx.cardTotals.map((c) => (
              <div key={c.id} style={{ ...paperCard(T), display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                <div>
                  <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5 }}>{c.name}</div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontSize: 18.5, fontWeight: 700 }}>{fmtWon(c.total)}</div>
                  {c.fixedPortion > 0 && <div style={{ color: T.goldSoft, fontSize: 11.5 }}>할부 {fmtWon(c.fixedPortion)} 포함</div>}
                </div>
              </div>
            ))}
          </div>
          {ctx.fixedCardActive.length > 0 && (
            <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 6 }}>카드별 정기결제(할부)</div>
              {ctx.fixedCardActive.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, color: T.cream, padding: "2px 0" }}>
                  <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""} · {data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드"}</span>
                  <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(f.info.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {list.length === 0 ? (
            <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>카드로 기록한 지출이 없어요.</div>
          ) : (
            <div style={paperCard(T)}>
              {list.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[e.categoryId] ? catMap[e.categoryId].color : T.muted, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>
                      {catMap[e.categoryId] ? catMap[e.categoryId].name : "미분류"}
                      <span style={{ fontSize: 11.5, marginLeft: 6, color: T.goldSoft, fontWeight: 700 }}>{data.cards.find((c) => c.id === (e.cardId || data.cards[0]?.id))?.name || "카드"}</span>
                    </div>
                    {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5 }}>{e.memo}</div>}
                  </div>
                  <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{e.date.slice(5)}</div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5 }}>{fmtWon(e.amount)}</div>
                  <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : filter === "balance" ? (
        balanceList.length === 0 ? (
          <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>입출금 기록이 없어요.</div>
        ) : (
          <div style={paperCard(T)}>
            {balanceList.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                {b.type === "in" ? <ArrowDownCircle size={15} color={T.good} /> : <ArrowUpCircle size={15} color={T.danger} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>{b.type === "in" ? "입금" : "출금"}{b.memo ? ` · ${b.memo}` : ""}</div>
                </div>
                <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{b.date.slice(5)}</div>
                <div style={{ color: b.type === "in" ? T.good : T.danger, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5 }}>
                  {b.type === "in" ? "+" : "-"}{fmtWon(b.amount)}
                </div>
                <button onClick={() => removeBalance(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )
      ) : filter === "receivable" ? (
        list.length === 0 ? (
          <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>대리결제 기록이 없어요.</div>
        ) : (
          <div style={paperCard(T)}>
            <div style={{ color: T.goldSoft, fontSize: 12.5, marginBottom: 8 }}>정산은 홈 화면에서 할 수 있어요. 여기서는 기록만 확인해요.</div>
            {list.map((e) => (
              <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>
                      {e.memo || catMap[e.categoryId]?.name || "대리결제"}
                      <span style={{ color: e.settled ? T.good : T.warn, fontSize: 11.5, marginLeft: 6, fontWeight: 700 }}>{e.settled ? "정산완료" : "미정산"}</span>
                    </div>
                    <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5 }}>{e.date}{e.settled ? ` · 상환 ${fmtWon(e.repaidAmount)}` : ""}</div>
                  </div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5 }}>{fmtWon(e.amount)}</div>
                  <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {grouped.length === 0 && <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>기록이 없어요.</div>}
          {grouped.map(([date, items]) => (
            <div key={date} style={{ marginBottom: 12 }}>
              <div style={{ color: T.goldSoft, fontSize: 12.5, marginBottom: 6, paddingLeft: 2 }}>
                {date} · {fmtWon(items.reduce((s, e) => s + Number(e.amount), 0))}
              </div>
              <div style={paperCard(T)}>
                {items.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[e.categoryId] ? catMap[e.categoryId].color : T.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.ink, fontSize: 14.5, fontWeight: 600 }}>
                        {catMap[e.categoryId] ? catMap[e.categoryId].name : "미분류"}
                        <span style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 700, color: (e.paymentMethod || "cash") === "card" ? T.gold : T.good }}>
                          {(e.paymentMethod || "cash") === "card" ? "카드" : "현금"}
                        </span>
                      </div>
                      {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 12.5 }}>{e.memo}</div>}
                    </div>
                    <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 14.5 }}>{fmtWon(e.amount)}</div>
                    <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- Analysis ---------- */
/* ---------- Settings ---------- */
function SettingsView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const [selectedCardId, setSelectedCardId] = useState(data.cards?.[0]?.id || "");
  const [newCardName, setNewCardName] = useState("");
  const [cardAddInput, setCardAddInput] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [spendingGoalInput, setSpendingGoalInput] = useState(String(data.spendingGoal || ""));
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const exportJson = JSON.stringify(data, null, 2);
  const doExport = () => {
    setShowExport(true); setShowImport(false);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(exportJson).then(() => showToast("클립보드에 복사했어요")).catch(() => {});
    }
  };
  const doImport = () => {
    try {
      const parsed = JSON.parse(importText);
      persist(migrate(parsed));
      setImportText(""); setShowImport(false);
      showToast("데이터를 불러왔어요");
    } catch {
      showToast("올바른 JSON 형식이 아니에요");
    }
  };
  const savePin = () => {
    if (!/^\d{4}$/.test(pin1)) return showToast("4자리 숫자를 입력하세요");
    if (pin1 !== pin2) return showToast("PIN이 서로 달라요");
    persist({ ...data, pinLock: { enabled: true, pin: pin1 } });
    setPin1(""); setPin2("");
    showToast("잠금을 설정했어요");
  };
  const disableLock = () => { persist({ ...data, pinLock: { enabled: false, pin: "" } }); showToast("잠금을 해제했어요"); };

  const addCard = () => {
    if (!newCardName.trim()) return showToast("카드 이름을 입력하세요");
    const card = { id: "card" + Date.now(), name: newCardName.trim(), bill: 0 };
    persist({ ...data, cards: [...(data.cards || []), card] });
    setSelectedCardId(card.id);
    setNewCardName("");
    showToast("카드를 등록했어요");
  };
  const removeCard = (id) => {
    if (data.cards.length <= 1) return showToast("카드가 최소 1개는 있어야 해요");
    persist({ ...data, cards: data.cards.filter((c) => c.id !== id) });
    if (selectedCardId === id) setSelectedCardId(data.cards.find((c) => c.id !== id)?.id || "");
  };
  const addCardBill = () => {
    const n = Number(cardAddInput);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!selectedCardId) return showToast("카드를 먼저 선택하세요");
    persist({ ...data, cards: data.cards.map((c) => (c.id === selectedCardId ? { ...c, bill: Number(c.bill || 0) + n } : c)) });
    setCardAddInput("");
    showToast("카드값에 더했어요");
  };
  const resetCardBill = () => {
    if (!selectedCardId) return;
    persist({ ...data, cards: data.cards.map((c) => (c.id === selectedCardId ? { ...c, bill: 0 } : c)) });
    showToast("카드값을 초기화했어요");
  };
  const addAccount = () => {
    if (!newAccountName.trim()) return showToast("통장 이름을 입력하세요");
    const acc = { id: "acc" + Date.now(), name: newAccountName.trim(), initialBalance: Number(newAccountBalance) || 0 };
    persist({ ...data, accounts: [...(data.accounts || []), acc] });
    setNewAccountName(""); setNewAccountBalance("");
    showToast("통장을 등록했어요");
  };
  const removeAccount = (id) => {
    if (data.accounts.length <= 1) return showToast("통장이 최소 1개는 있어야 해요");
    persist({ ...data, accounts: data.accounts.filter((a) => a.id !== id) });
  };
  const saveSpendingGoal = () => { const n = Number(spendingGoalInput); if (Number.isNaN(n) || n < 0) return showToast("올바른 금액을 입력해주세요"); persist({ ...data, spendingGoal: n }); showToast("목표 지출액을 저장했어요"); };
  const setTheme = (mode) => persist({ ...data, theme: mode });
  const removeCategory = (id) => persist({ ...data, categories: data.categories.filter((c) => c.id !== id) });

  return (
    <div>
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700, marginBottom: 16 }}>설정</div>

      <SectionLabel>화면</SectionLabel>
      <Field label="화면 테마">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", rowGap: 16, columnGap: 4 }}>
          {THEME_ORDER.map((id) => {
            const th = THEMES[id];
            const active = data.theme === id;
            return (
              <button key={id} onClick={() => setTheme(id)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: "50%", background: th.swatch,
                  border: active ? `3px solid ${T.gold}` : `1px solid ${T.border}`,
                  boxShadow: active ? `0 0 0 2px ${T.bg2}` : "none",
                  display: "block",
                }} />
                <span style={{ color: active ? T.gold : T.muted, fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{th.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ color: T.muted, fontSize: 12, marginTop: 10 }}>현재 테마: {THEMES[data.theme]?.label || "검정"}</div>
      </Field>

      <SectionLabel>예산</SectionLabel>
      <Field label="이번 달 목표 지출액">
        <div style={{ display: "flex", gap: 8 }}>
          <MoneyInput value={spendingGoalInput} onChange={setSpendingGoalInput} />
          <button onClick={saveSpendingGoal} style={{ ...primaryBtn(T), width: 72 }}>저장</button>
        </div>
        <QuickAmountButtons amount={spendingGoalInput} setAmount={setSpendingGoalInput} />
        <div style={{ color: T.muted, fontSize: 12.5, marginTop: 6 }}>홈 화면의 원형 게이지는 이 금액에서 고정지출·카드값·대출 등 총지출을 뺀 값을 보여줘요.</div>
      </Field>

      <SectionLabel>보안</SectionLabel>
      <Field label="화면 잠금 (PIN)">
        {data.pinLock?.enabled ? (
          <div>
            <div style={{ color: T.good, fontSize: 13.5, marginBottom: 8, fontWeight: 700 }}>잠금 사용 중</div>
            <button onClick={disableLock} style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
              잠금 끄기
            </button>
            <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 6 }}>PIN 변경</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="password" inputMode="numeric" maxLength={4} value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))} placeholder="새 PIN 4자리" style={{ ...inputSty(T), fontFamily: F.mono, letterSpacing: 4 }} />
              <input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="확인" style={{ ...inputSty(T), fontFamily: F.mono, letterSpacing: 4 }} />
            </div>
            <button onClick={savePin} style={primaryBtn(T)}>PIN 변경</button>
          </div>
        ) : (
          <div>
            <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 8 }}>켜두면 앱을 열 때마다 4자리 PIN을 입력해야 해요.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="password" inputMode="numeric" maxLength={4} value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))} placeholder="PIN 4자리" style={{ ...inputSty(T), fontFamily: F.mono, letterSpacing: 4 }} />
              <input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="PIN 확인" style={{ ...inputSty(T), fontFamily: F.mono, letterSpacing: 4 }} />
            </div>
            <button onClick={savePin} style={primaryBtn(T)}>잠금 켜기</button>
          </div>
        )}
      </Field>

      <SectionLabel>계좌 · 카드</SectionLabel>
      <Field label="통장 관리">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6, marginBottom: 10 }}>
          {(data.accounts || []).map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ flex: 1, color: T.cream, fontSize: 14.5 }}>{a.name}</span>
              <button onClick={() => removeAccount(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
          <MoneyInput value={newAccountBalance} onChange={setNewAccountBalance} placeholder="시작 잔액 (선택)" />
          <QuickAmountButtons amount={newAccountBalance} setAmount={setNewAccountBalance} />
          <button onClick={addAccount} style={primaryBtn(T)}>통장 추가</button>
        </div>
      </Field>

      <Field label="카드 관리">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6, marginBottom: 10 }}>
          {(data.cards || []).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ flex: 1, color: T.cream, fontSize: 14.5 }}>{c.name}</span>
              <span style={{ color: T.muted, fontFamily: F.mono, fontSize: 12.5 }}>{fmtWon(c.bill || 0)}</span>
              <button onClick={() => removeCard(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
          <button onClick={addCard} style={{ ...primaryBtn(T), width: 72 }}>추가</button>
        </div>
      </Field>

      <Field label="카드값 수동 추가 / 초기화">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {(data.cards || []).map((c) => (
            <button key={c.id} onClick={() => setSelectedCardId(c.id)}
              style={{ padding: "7px 12px", borderRadius: 20, border: selectedCardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                background: selectedCardId === c.id ? T.gold + "22" : "transparent", color: selectedCardId === c.id ? T.cream : T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {c.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <MoneyInput value={cardAddInput} onChange={setCardAddInput} placeholder="새로 결제한 금액" />
          <button onClick={addCardBill} style={{ ...primaryBtn(T), width: 72 }}>추가</button>
        </div>
        <QuickAmountButtons amount={cardAddInput} setAmount={setCardAddInput} />
        <button onClick={resetCardBill} style={{ marginTop: 8, background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
          선택한 카드 초기화 (결제 처리)
        </button>
      </Field>

      <SectionLabel>카테고리</SectionLabel>
      <Field label="카테고리 관리">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6 }}>
          {data.categories.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
              <span style={{ flex: 1, color: T.cream, fontSize: 14.5 }}>{c.name}</span>
              <button onClick={() => removeCategory(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
            </div>
          ))}
          {data.categories.length === 0 && <div style={{ color: T.muted, fontSize: 13.5, textAlign: "center", padding: "10px 0" }}>카테고리가 없어요. &lsquo;기록&rsquo; 탭에서 추가할 수 있어요.</div>}
        </div>
        <div style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>카테고리별 예산은 &lsquo;기록&rsquo; 탭에서 설정해요.</div>
      </Field>

      <SectionLabel>데이터</SectionLabel>
      <Field label="데이터 백업">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 14, cursor: "pointer" }}>내보내기</button>
          <button onClick={() => { setShowImport(!showImport); setShowExport(false); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 14, cursor: "pointer" }}>가져오기</button>
        </div>
        {showExport && (
          <div>
            <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 6 }}>클립보드에 복사됐어요. 안 됐다면 아래 텍스트를 직접 복사해서 보관하세요.</div>
            <textarea readOnly value={exportJson} onFocus={(e) => e.target.select()} style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 11.5 }} />
          </div>
        )}
        {showImport && (
          <div>
            <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 6 }}>백업해둔 JSON 텍스트를 붙여넣고 불러오기를 누르세요. 현재 데이터를 덮어써요.</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="여기에 백업 JSON 붙여넣기" style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 11.5, marginBottom: 8 }} />
            <button onClick={doImport} style={primaryBtn(T)}>불러오기</button>
          </div>
        )}
      </Field>
    </div>
  );
}
