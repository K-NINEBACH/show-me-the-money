import React, { useState, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Plus, Trash2, Settings, Home as HomeIcon, BookOpen, BarChart3, X, Check, CreditCard, HandCoins, Wallet, ArrowDownCircle, ArrowUpCircle, Sun, Moon, Pencil } from "lucide-react";

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
  salary: 1500000,
  theme: "dark",
  account: { initialBalance: 0 },
  cardBill: 0,
  savingsGoal: 0,
  categories: [
    { id: "c1", name: "식비", color: PALETTE[0], budget: 0 },
    { id: "c2", name: "교통", color: PALETTE[3], budget: 0 },
    { id: "c3", name: "쇼핑", color: PALETTE[4], budget: 0 },
  ],
  expenses: [],
  fixedExpenses: [],
  balanceEntries: [],
});

function migrate(raw) {
  const d = { ...defaultData(), ...raw };
  if (raw.budget != null && raw.salary == null) d.salary = raw.budget;
  if (raw.cardBills && typeof raw.cardBills === "object") {
    const vals = Object.values(raw.cardBills).map(Number).filter((n) => !Number.isNaN(n));
    d.cardBill = (raw.cardBill || 0) + vals.reduce((a, b) => a + b, 0);
  } else {
    d.cardBill = Number(raw.cardBill) || 0;
  }
  if (Array.isArray(raw.fixedExpenses)) {
    d.fixedExpenses = raw.fixedExpenses.map((f) =>
      f.totalMonths !== undefined
        ? { overrides: {}, ...f }
        : { id: f.id, name: f.name, baseAmount: f.amount, totalMonths: 0, startInstallment: 1, setupMonthKey: monthKey(new Date()), overrides: {} }
    );
  }
  d.account = raw.account || { initialBalance: 0 };
  d.categories = raw.categories && raw.categories.length ? raw.categories.map((c) => ({ budget: 0, ...c })) : defaultData().categories;
  d.expenses = raw.expenses || [];
  d.balanceEntries = raw.balanceEntries || [];
  d.savingsGoal = Number(raw.savingsGoal) || 0;
  return d;
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

/* ---------- Theme ---------- */
const DARK = {
  mode: "dark", bg: "#161B2E", bg2: "#1E2440", navBg: "rgba(22,27,46,0.95)",
  paper: "#F1E7D0", paperLine: "#D9C9A3", ink: "#2A2419", cream: "#EDE3CB",
  gold: "#C79A46", goldSoft: "#8A6E3A", good: "#5B8A62", warn: "#C97C3D",
  danger: "#B6473F", muted: "#9A9080", border: "#3A3F5C",
};
const LIGHT = {
  mode: "light", bg: "#F7F3E9", bg2: "#FFFFFF", navBg: "rgba(255,255,255,0.94)",
  paper: "#FBF3DE", paperLine: "#E3D6B2", ink: "#2A2419", cream: "#2A2419",
  gold: "#B8863A", goldSoft: "#8A6E3A", good: "#4C7A52", warn: "#B96A2E",
  danger: "#A83B34", muted: "#7D735C", border: "#E1D8C2",
};
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
function inputSty(T) { return { width: "100%", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.cream, fontSize: 14, outline: "none" }; }
function primaryBtn(T) { return { width: "100%", background: T.gold, color: "#23190C", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }; }

function QuickAmountButtons({ amount, setAmount }) {
  const T = useTheme();
  const add = (n) => setAmount(String((Number(amount) || 0) + n));
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {QUICK_AMOUNTS.map((o) => (
        <button key={o.n} type="button" onClick={() => add(o.n)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg2, color: T.gold, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
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

  const T = data && data.theme === "light" ? LIGHT : DARK;

  if (!loaded || !data) {
    return (
      <ThemeContext.Provider value={DARK}>
        <div style={{ background: DARK.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: DARK.cream, fontFamily: F.body }}>불러오는 중…</div>
        </div>
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

  const fixedActive = data.fixedExpenses.map((f) => ({ ...f, info: fixedInfo(f, curKey) })).filter((f) => f.info.active);
  const fixedSum = fixedActive.reduce((s, f) => s + Number(f.info.amount), 0);
  const totalSpentThisMonth = normalSpent + cardSpentThisCycle + fixedSum;

  const prevKey = monthKeyOffset(curKey, -1);
  const prevMonthExpenses = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === prevKey);
  const prevSpentDirect = prevMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const prevFixedSum = data.fixedExpenses.map((f) => fixedInfo(f, prevKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const prevTotalSpent = prevSpentDirect + prevFixedSum;

  const categorySpentThisMonth = {};
  cycleExpenses.forEach((e) => { categorySpentThisMonth[e.categoryId] = (categorySpentThisMonth[e.categoryId] || 0) + Number(e.amount); });

  const cardBill = data.cardBill || 0;
  const spent = normalSpent + fixedSum + cardBill;
  const monthlyIncome = (data.balanceEntries || []).filter((b) => b.type === "in" && b.date.slice(0, 7) === curKey).reduce((s, b) => s + Number(b.amount), 0);
  const hasIncome = monthlyIncome > 0;
  const remaining = monthlyIncome - spent;
  const budgetRatio = hasIncome ? Math.min(spent / monthlyIncome, 1.2) : (spent > 0 ? 1.2 : 0);
  const receivables = data.expenses.filter((e) => e.isReceivable && !e.settled);

  const balanceIn = (data.balanceEntries || []).filter((b) => b.type === "in").reduce((s, b) => s + Number(b.amount), 0);
  const balanceOut = (data.balanceEntries || []).filter((b) => b.type === "out").reduce((s, b) => s + Number(b.amount), 0);
  const accountBalance = (data.account?.initialBalance || 0) + balanceIn - balanceOut;

  const ctx = {
    data, persist, showToast, today, todayStr, curKey, prevKey, cycleLen, dayIntoCycle,
    cycleExpenses, normalSpent, fixedActive, fixedSum, cardBill, totalSpentThisMonth, prevTotalSpent, categorySpentThisMonth,
    spent, remaining, budgetRatio, receivables, accountBalance, monthlyIncome, hasIncome,
  };

  const S = {
    appShell: { background: `radial-gradient(circle at 50% -10%, ${T.bg2}, ${T.bg} 60%)`, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body },
    screen: { flex: 1, overflowY: "auto", padding: "20px 16px 12px", paddingBottom: 90 },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.navBg, borderTop: `1px solid ${T.goldSoft}55`, backdropFilter: "blur(8px)", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" },
    toast: { position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.gold, color: "#23190C", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },
  };

  return (
    <ThemeContext.Provider value={T}>
      <div style={S.appShell}>
        <GoogleFonts />
        <div style={S.screen}>
          {tab === "home" && <HomeView ctx={ctx} />}
          {tab === "add" && <AddView ctx={ctx} />}
          {tab === "ledger" && <LedgerView ctx={ctx} />}
          {tab === "analysis" && <AnalysisView ctx={ctx} />}
          {tab === "settings" && <SettingsView ctx={ctx} />}
        </div>
        <nav style={S.nav}>
          <NavBtn icon={HomeIcon} label="홈" active={tab === "home"} onClick={() => setTab("home")} />
          <NavBtn icon={Plus} label="기록" active={tab === "add"} onClick={() => setTab("add")} />
          <NavBtn icon={BookOpen} label="내역" active={tab === "ledger"} onClick={() => setTab("ledger")} />
          <NavBtn icon={BarChart3} label="분석" active={tab === "analysis"} onClick={() => setTab("analysis")} />
          <NavBtn icon={Settings} label="설정" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    </ThemeContext.Provider>
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
      <span style={{ fontSize: 10, fontFamily: F.body, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

function Field({ label, children }) {
  const T = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.muted, fontSize: 12, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

/* ---------- Home ---------- */
function HomeView({ ctx }) {
  const T = useTheme();
  const { data, curKey, dayIntoCycle, cycleLen, remaining, budgetRatio,
    fixedSum, normalSpent, fixedActive, receivables, cycleExpenses, accountBalance, hasIncome } = ctx;
  const over = remaining < 0;
  const ringColor = budgetRatio < 0.7 ? T.good : budgetRatio < 1 ? T.warn : T.danger;
  const dashArray = 2 * Math.PI * 54;
  const dashOffset = dashArray * (1 - Math.min(budgetRatio, 1));
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const recent = [...cycleExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <div>
      <BalanceCard ctx={ctx} accountBalance={accountBalance} />

      <div style={{ textAlign: "center", marginBottom: 6, marginTop: 18 }}>
        <div style={{ color: T.muted, fontSize: 12, letterSpacing: 1 }}>내 돈 챙겨줘</div>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20, fontWeight: 700, marginTop: 2 }}>
          {monthLabel(curKey)} · {dayIntoCycle}일차
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 8px" }}>
        <div style={{ position: "relative", width: 176, height: 176 }}>
          <svg width="176" height="176" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke={T.mode === "dark" ? "#2A2F4C" : "#EDE4CC"} strokeWidth="10" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: T.muted, fontSize: 10, marginBottom: 2 }}>{over ? "예산 초과" : "남은 돈"}</div>
            <div style={{ color: over ? T.danger : T.cream, fontFamily: F.mono, fontWeight: 600, fontSize: 18, lineHeight: 1.15, textAlign: "center" }}>
              {over ? "-" : ""}{fmtWon(Math.abs(remaining))}
            </div>
            <div style={{ color: T.goldSoft, fontSize: 10, marginTop: 4 }}>
              {cycleLen - dayIntoCycle >= 0 ? `${cycleLen - dayIntoCycle}일 남음` : ""}
            </div>
          </div>
        </div>
      </div>
      {!hasIncome && (
        <div style={{ textAlign: "center", color: T.warn, fontSize: 11, marginTop: -4, marginBottom: 14 }}>
          이번 달 입금 기록이 아직 없어요 · 급여 받으면 위에서 &lsquo;입금&rsquo;으로 남겨주세요
        </div>
      )}

      <SummaryCard ctx={ctx} />

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <CardBillCard ctx={ctx} />
        <StatCard label="고정지출" value={fmtWon(fixedSum)} />
        <StatCard label="현금지출" value={fmtWon(normalSpent)} />
      </div>

      {(fixedActive.length > 0 || receivables.length > 0 || data.savingsGoal > 0 || data.categories.some((c) => c.budget > 0)) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <SavingsGoalCard ctx={ctx} />
          <CategoryBudgetCard ctx={ctx} />
          {fixedActive.length > 0 && (
            <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ color: T.muted, fontSize: 11, marginBottom: 6 }}>이번 달 고정지출</div>
              {fixedActive.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.cream, padding: "2px 0" }}>
                  <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""}</span>
                  <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(f.info.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {receivables.length > 0 && (
            <div style={{ background: T.bg2, border: `1px solid ${T.good}55`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <HandCoins size={13} color={T.good} />
                <span style={{ color: T.good, fontSize: 11, fontWeight: 700 }}>회수할 돈 (채권) · 내역 탭에서 정산</span>
              </div>
              {receivables.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.cream, padding: "2px 0" }}>
                  <span>{r.memo || catMap[r.categoryId]?.name || "대리결제"}</span>
                  <span style={{ fontFamily: F.mono, color: T.good }}>{fmtWon(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={paperCard(T)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontFamily: F.display, color: T.ink, fontSize: 15, fontWeight: 700 }}>최근 기록</div>
          <div style={{ fontSize: 11, color: T.goldSoft }}>이번 달 {cycleExpenses.length}건</div>
        </div>
        {recent.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: "18px 0" }}>
            아직 이번 달 기록이 없어요.<br />지출이 생기면 &lsquo;기록&rsquo; 탭에서 남겨보세요.
          </div>
        ) : (
          recent.map((e) => <LedgerRow key={e.id} e={e} cat={catMap[e.categoryId]} />)
        )}
      </div>
    </div>
  );
}

function SummaryCard({ ctx }) {
  const T = useTheme();
  const { curKey, totalSpentThisMonth, prevTotalSpent, remaining } = ctx;
  const hasPrev = prevTotalSpent > 0;
  const pct = hasPrev ? Math.round(((totalSpentThisMonth - prevTotalSpent) / prevTotalSpent) * 100) : null;
  const up = pct != null && pct > 0;
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ color: T.muted, fontSize: 11, marginBottom: 4 }}>{monthLabel(curKey)} 요약</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 15, fontWeight: 700 }}>총 지출 {fmtWon(totalSpentThisMonth)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pct == null ? T.muted : up ? T.danger : T.good }}>
          {pct == null ? "지난달 비교 데이터 없음" : `지난달 대비 ${up ? "+" : ""}${pct}%`}
        </div>
      </div>
      <div style={{ color: remaining >= 0 ? T.good : T.danger, fontSize: 12, marginTop: 4 }}>
        {remaining >= 0 ? `저축 중 ${fmtWon(remaining)}` : `초과 지출 ${fmtWon(Math.abs(remaining))}`}
      </div>
    </div>
  );
}

function SavingsGoalCard({ ctx }) {
  const T = useTheme();
  const { data, remaining } = ctx;
  const goal = data.savingsGoal || 0;
  if (goal <= 0) return null;
  const saved = Math.max(0, remaining);
  const ratio = Math.min(saved / goal, 1);
  const reached = saved >= goal;
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, marginBottom: 6 }}>
        <span>이번 달 저축 목표</span>
        <span style={{ color: reached ? T.good : T.muted, fontWeight: 700 }}>{fmtWon(saved)} / {fmtWon(goal)}</span>
      </div>
      <div style={{ height: 7, background: T.mode === "dark" ? "#2A2F4C" : "#EDE4CC", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${ratio * 100}%`, height: "100%", background: reached ? T.good : T.gold, transition: "width 0.4s" }} />
      </div>
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
      <div style={{ color: T.muted, fontSize: 11, marginBottom: 8 }}>카테고리별 예산</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {budgeted.map((c) => {
          const spent = categorySpentThisMonth[c.id] || 0;
          const ratio = Math.min(spent / c.budget, 1);
          const over = spent > c.budget;
          return (
            <div key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.cream, marginBottom: 3 }}>
                <span>{c.name}</span>
                <span style={{ color: over ? T.danger : T.muted, fontFamily: F.mono, fontSize: 11 }}>{fmtWon(spent)} / {fmtWon(c.budget)}</span>
              </div>
              <div style={{ height: 6, background: T.mode === "dark" ? "#2A2F4C" : "#EDE4CC", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${ratio * 100}%`, height: "100%", background: over ? T.danger : c.color, transition: "width 0.4s" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardBillCard({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, cardBill } = ctx;
  const pay = () => {
    if (!cardBill || cardBill <= 0) return showToast("현재 카드값이 없어요");
    persist({ ...data, cardBill: 0, balanceEntries: [...(data.balanceEntries || []), { id: "b" + Date.now(), type: "out", amount: cardBill, date: todayISO(), memo: "카드값 결제" }] });
    showToast(`${fmtWon(cardBill)} 결제 처리 · 통장에서 출금됐어요`);
  };
  return (
    <div style={{ flex: 1, background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 10px" }}>
      <div style={{ color: T.muted, fontSize: 10, marginBottom: 4 }}>카드값</div>
      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{fmtWon(cardBill)}</div>
      <button onClick={pay} disabled={!cardBill}
        style={{ width: "100%", padding: "4px 0", borderRadius: 6, border: "none", background: cardBill ? T.gold : T.border, color: cardBill ? "#23190C" : T.muted, fontSize: 10, fontWeight: 700, cursor: cardBill ? "pointer" : "default" }}>
        결제하기
      </button>
    </div>
  );
}

function BalanceCard({ ctx, accountBalance }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    const entry = { id: "b" + Date.now(), type: mode, amount: n, date: todayISO(), memo: memo.trim() };
    persist({ ...data, balanceEntries: [...(data.balanceEntries || []), entry] });
    setAmount(""); setMemo(""); setMode(null);
    showToast(mode === "in" ? "입금을 기록했어요" : "출금을 기록했어요");
  };

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}55`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Wallet size={14} color={T.gold} />
        <span style={{ color: T.muted, fontSize: 11 }}>통장 잔액</span>
      </div>
      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 24, fontWeight: 700, marginBottom: 10 }}>{fmtWon(accountBalance)}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setMode(mode === "in" ? null : "in")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.good}`, background: mode === "in" ? T.good + "22" : "transparent", color: T.good, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <ArrowDownCircle size={14} /> 입금
        </button>
        <button onClick={() => setMode(mode === "out" ? null : "out")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.danger}`, background: mode === "out" ? T.danger + "22" : "transparent", color: T.danger, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <ArrowUpCircle size={14} /> 출금
        </button>
      </div>
      {mode && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="number" inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="금액" style={{ ...inputSty(T), fontFamily: F.mono }} />
          <QuickAmountButtons amount={amount} setAmount={setAmount} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택, 예: 급여)" style={{ ...inputSty(T), marginTop: 4 }} />
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
      <div style={{ color: T.muted, fontSize: 10, marginBottom: 4 }}>{label}</div>
      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 12.5, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function LedgerRow({ e, cat }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>
          {cat ? cat.name : "미분류"}
          <span style={{ fontSize: 10, marginLeft: 6, fontWeight: 700, color: (e.paymentMethod || "cash") === "card" ? T.gold : T.good }}>
            {(e.paymentMethod || "cash") === "card" ? "카드" : "현금"}
          </span>
        </div>
        {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo}</div>}
      </div>
      <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 11, fontFamily: F.mono }}>{e.date.slice(5)}</div>
      <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 13, minWidth: 74, textAlign: "right" }}>{fmtWon(e.amount)}</div>
    </div>
  );
}

/* ---------- Add ---------- */
function AddView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [isReceivable, setIsReceivable] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(PALETTE[0]);

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
    const catName = data.categories.find((c) => c.id === categoryId)?.name || "지출";
    const linkedBalanceId = !isReceivable && paymentMethod === "cash" ? "b" + Date.now() : null;
    const expense = { id: "e" + Date.now(), amount: n, categoryId, date, memo: memo.trim(), isReceivable, settled: false, repaidAmount: null, paymentMethod, linkedBalanceId };
    let next = { ...data, expenses: [...data.expenses, expense] };
    if (!isReceivable) {
      if (paymentMethod === "card") {
        next.cardBill = (data.cardBill || 0) + n;
      } else {
        next.balanceEntries = [...(next.balanceEntries || []), { id: linkedBalanceId, type: "out", amount: n, date, memo: `${catName}${memo.trim() ? " · " + memo.trim() : ""}` }];
      }
    }
    persist(next);
    setAmount(""); setMemo(""); setIsReceivable(false);
    showToast(isReceivable ? "채권으로 기록했어요" : paymentMethod === "card" ? "카드값에 반영했어요" : "통장에서 차감했어요");
  };

  return (
    <div>
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 19, fontWeight: 700, marginBottom: 16 }}>지출 기록</div>

      <Field label="금액">
        <div style={{ position: "relative" }}>
          <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            style={{ ...inputSty(T), fontFamily: F.mono, fontSize: 20, fontWeight: 600, paddingRight: 36 }} />
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.muted }}>원</span>
        </div>
        <QuickAmountButtons amount={amount} setAmount={setAmount} />
      </Field>

      <Field label="카테고리">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.categories.map((c) => (
            <button key={c.id} onClick={() => setCategoryId(c.id)}
              style={{ padding: "8px 14px", borderRadius: 20, border: categoryId === c.id ? `2px solid ${c.color}` : `1px solid ${T.border}`,
                background: categoryId === c.id ? c.color + "22" : "transparent", color: categoryId === c.id ? T.cream : T.muted,
                fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />
              {c.name}
            </button>
          ))}
          <button onClick={() => setNewCatMode(!newCatMode)}
            style={{ padding: "8px 12px", borderRadius: 20, border: `1px dashed ${T.gold}`, background: "transparent", color: T.gold, fontSize: 13, cursor: "pointer" }}>
            + 새 카테고리
          </button>
        </div>
        {newCatMode && (
          <div style={{ marginTop: 10, background: T.bg2, borderRadius: 10, padding: 12 }}>
            <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="카테고리 이름" style={{ ...inputSty(T), marginBottom: 8 }} />
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

      <Field label="결제 수단">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPaymentMethod("card")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: paymentMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: paymentMethod === "card" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <CreditCard size={15} /> 카드
          </button>
          <button onClick={() => setPaymentMethod("cash")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: paymentMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: paymentMethod === "cash" ? T.good + "22" : "transparent", color: T.cream, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Wallet size={15} /> 통장(현금)
          </button>
        </div>
        <div style={{ color: T.muted, fontSize: 11, marginTop: 6 }}>
          {paymentMethod === "card" ? "카드값에 누적되고, 홈에서 나중에 한번에 결제 처리해요." : "지금 바로 통장 잔액에서 차감되고 입출금 내역에도 남아요."}
        </div>
      </Field>

      <Field label="날짜">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputSty(T)} />
      </Field>

      <Field label="메모 (선택)">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 점심 도시락" style={inputSty(T)} />
      </Field>

      <button onClick={() => setIsReceivable(!isReceivable)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: isReceivable ? T.good + "22" : T.bg2,
          border: isReceivable ? `1px solid ${T.good}` : `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, cursor: "pointer" }}>
        <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isReceivable ? T.good : T.muted}`, background: isReceivable ? T.good : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {isReceivable && <Check size={13} color="#fff" />}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ color: isReceivable ? T.good : T.cream, fontSize: 13, fontWeight: 700 }}>지인 대리결제 (채권으로 분류)</div>
          <div style={{ color: T.muted, fontSize: 11 }}>예산에서 빠지고 &lsquo;회수할 돈&rsquo; 목록으로 이동해요. 정산은 &lsquo;내역&rsquo; 탭에서 해요.</div>
        </div>
      </button>

      <button onClick={submit} style={{ ...primaryBtn(T), padding: "14px 0", fontSize: 15 }}>
        <Check size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
        기록하기
      </button>
    </div>
  );
}

/* ---------- Ledger (history) ---------- */
function LedgerView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [filter, setFilter] = useState("cycle");
  const [search, setSearch] = useState("");
  const [settlingId, setSettlingId] = useState(null);
  const [repaidInput, setRepaidInput] = useState("");
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
    let next = { ...data, expenses: data.expenses.filter((e) => e.id !== id) };
    if (exp && !exp.isReceivable) {
      if ((exp.paymentMethod || "cash") === "card") {
        next.cardBill = Math.max(0, (data.cardBill || 0) - Number(exp.amount));
      } else if (exp.linkedBalanceId) {
        next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
      }
    }
    persist(next);
  };
  const removeBalance = (id) => persist({ ...data, balanceEntries: data.balanceEntries.filter((b) => b.id !== id) });

  const openSettle = (e) => { setSettlingId(e.id); setRepaidInput(String(e.amount)); };
  const cancelSettle = () => { setSettlingId(null); setRepaidInput(""); };

  const confirmSettle = (exp) => {
    const repaid = Number(repaidInput);
    if (repaidInput === "" || Number.isNaN(repaid) || repaid < 0) return showToast("상환받은 금액을 입력해주세요");
    const diff = repaid - exp.amount;
    let next2 = { ...data, expenses: data.expenses.map((e) => (e.id === exp.id ? { ...e, settled: true, repaidAmount: repaid, settledAt: todayISO() } : e)) };
    if (diff < 0) {
      next2.cardBill = (data.cardBill || 0) + Math.abs(diff);
    } else if (diff > 0) {
      next2.balanceEntries = [...(next2.balanceEntries || []), { id: "b" + Date.now(), type: "in", amount: diff, date: todayISO(), memo: "채권 정산 차액" }];
    }
    persist(next2);
    setSettlingId(null); setRepaidInput("");
    if (diff < 0) showToast(`부족분 ${fmtWon(Math.abs(diff))}이 카드값에 반영됐어요`);
    else if (diff > 0) showToast(`초과분 ${fmtWon(diff)}이 통장 잔액에 반영됐어요`);
    else showToast("정산 완료했어요");
  };

  const grouped = useMemo(() => {
    const map = {};
    list.forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 19, fontWeight: 700 }}>전체 내역</div>
        <div style={{ display: "flex", background: T.bg2, borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
          {[["cycle", "이번달"], ["all", "전체"], ["card", "카드"], ["receivable", "채권"], ["balance", "입출금"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 600,
                background: filter === k ? T.gold : "transparent", color: filter === k ? "#23190C" : T.muted, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="메모나 카테고리로 검색"
        style={{ ...inputSty(T), marginBottom: 14, fontSize: 13 }} />

      {filter === "card" ? (
        <>
          <div style={{ ...paperCard(T), marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: T.muted, fontSize: 11 }}>현재 누적 카드값</div>
              <div style={{ color: T.ink, fontFamily: F.mono, fontSize: 18, fontWeight: 700 }}>{fmtWon(data.cardBill || 0)}</div>
            </div>
            <button onClick={() => {
              if (!data.cardBill) return showToast("현재 카드값이 없어요");
              persist({ ...data, cardBill: 0, balanceEntries: [...(data.balanceEntries || []), { id: "b" + Date.now(), type: "out", amount: data.cardBill, date: todayISO(), memo: "카드값 결제" }] });
              showToast(`${fmtWon(data.cardBill)} 결제 처리 · 통장에서 출금됐어요`);
            }} style={{ background: T.gold, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "#23190C", fontSize: 12.5, fontWeight: 700 }}>
              결제하기
            </button>
          </div>
          {list.length === 0 ? (
            <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>카드로 기록한 지출이 없어요.</div>
          ) : (
            <div style={paperCard(T)}>
              {list.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[e.categoryId] ? catMap[e.categoryId].color : T.muted, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>{catMap[e.categoryId] ? catMap[e.categoryId].name : "미분류"}</div>
                    {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 11 }}>{e.memo}</div>}
                  </div>
                  <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 11, fontFamily: F.mono }}>{e.date.slice(5)}</div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 13 }}>{fmtWon(e.amount)}</div>
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
                  <div style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>{b.type === "in" ? "입금" : "출금"}{b.memo ? ` · ${b.memo}` : ""}</div>
                </div>
                <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 11, fontFamily: F.mono }}>{b.date.slice(5)}</div>
                <div style={{ color: b.type === "in" ? T.good : T.danger, fontFamily: F.mono, fontWeight: 700, fontSize: 13 }}>
                  {b.type === "in" ? "+" : "-"}{fmtWon(b.amount)}
                </div>
                <button onClick={() => removeBalance(b.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )
      ) : filter === "receivable" ? (
        list.length === 0 ? (
          <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>채권 기록이 없어요.</div>
        ) : (
          <div style={paperCard(T)}>
            {list.map((e) => (
              <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>
                      {e.memo || catMap[e.categoryId]?.name || "대리결제"}
                      <span style={{ color: e.settled ? T.good : T.warn, fontSize: 10, marginLeft: 6, fontWeight: 700 }}>{e.settled ? "정산완료" : "미정산"}</span>
                    </div>
                    <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 11 }}>{e.date}{e.settled ? ` · 상환 ${fmtWon(e.repaidAmount)}` : ""}</div>
                  </div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 13 }}>{fmtWon(e.amount)}</div>
                  {!e.settled && settlingId !== e.id && (
                    <button onClick={() => openSettle(e)} style={{ background: T.good, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#fff", fontSize: 11, fontWeight: 700 }}>정산</button>
                  )}
                  <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                </div>
                {settlingId === e.id && (
                  <div style={{ marginTop: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 10, padding: 10 }}>
                    <div style={{ color: T.ink, fontSize: 11.5, marginBottom: 6 }}>실제 상환(회수)받은 금액을 입력하세요. 부족분은 카드값에, 초과분은 통장 잔액에 자동 반영돼요.</div>
                    <input type="number" inputMode="numeric" autoFocus value={repaidInput} onChange={(ev) => setRepaidInput(ev.target.value)}
                      style={{ ...inputSty(T), background: "#fff", color: T.ink, border: `1px solid ${T.paperLine}`, fontFamily: F.mono }} />
                    <QuickAmountButtons amount={repaidInput} setAmount={setRepaidInput} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button onClick={cancelSettle} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.ink, fontSize: 12.5, cursor: "pointer" }}>취소</button>
                      <button onClick={() => confirmSettle(e)} style={{ flex: 2, ...primaryBtn(T), padding: "9px 0" }}>정산 확정</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {grouped.length === 0 && <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>기록이 없어요.</div>}
          {grouped.map(([date, items]) => (
            <div key={date} style={{ marginBottom: 12 }}>
              <div style={{ color: T.goldSoft, fontSize: 11, marginBottom: 6, paddingLeft: 2 }}>
                {date} · {fmtWon(items.reduce((s, e) => s + Number(e.amount), 0))}
              </div>
              <div style={paperCard(T)}>
                {items.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[e.categoryId] ? catMap[e.categoryId].color : T.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.ink, fontSize: 13, fontWeight: 600 }}>
                        {catMap[e.categoryId] ? catMap[e.categoryId].name : "미분류"}
                        <span style={{ fontSize: 10, marginLeft: 6, fontWeight: 700, color: (e.paymentMethod || "cash") === "card" ? T.gold : T.good }}>
                          {(e.paymentMethod || "cash") === "card" ? "카드" : "현금"}
                        </span>
                      </div>
                      {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 11 }}>{e.memo}</div>}
                    </div>
                    <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 13 }}>{fmtWon(e.amount)}</div>
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
function AnalysisView({ ctx }) {
  const T = useTheme();
  const { data, curKey, todayStr } = ctx;
  const [compareKey, setCompareKey] = useState(monthKeyOffset(curKey, -1));
  const [viewKey, setViewKey] = useState(curKey);
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  const byCategory = useMemo(() => {
    const map = {};
    data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === viewKey).forEach((e) => { map[e.categoryId] = (map[e.categoryId] || 0) + Number(e.amount); });
    return Object.entries(map).map(([id, val]) => ({ id, name: catMap[id]?.name || "미분류", value: val, color: catMap[id]?.color || T.muted })).sort((a, b) => b.value - a.value);
  }, [data.expenses, viewKey]);
  const totalSpent = byCategory.reduce((s, c) => s + c.value, 0);

  const curveData = useMemo(() => {
    const maxDays = Math.max(daysInMonthKey(curKey), daysInMonthKey(compareKey));
    let cumCur = 0, cumCmp = 0;
    const arr = [];
    for (let d = 1; d <= maxDays; d++) {
      const curOk = d <= daysInMonthKey(curKey);
      const cmpOk = d <= daysInMonthKey(compareKey);
      const curDateStr = curOk ? dateStrFor(curKey, d) : null;
      const cmpDateStr = cmpOk ? dateStrFor(compareKey, d) : null;
      if (curDateStr) cumCur += data.expenses.filter((e) => !e.isReceivable && e.date === curDateStr).reduce((s, e) => s + Number(e.amount), 0);
      if (cmpDateStr) cumCmp += data.expenses.filter((e) => !e.isReceivable && e.date === cmpDateStr).reduce((s, e) => s + Number(e.amount), 0);
      arr.push({
        day: `${d}일`,
        이번달: curDateStr && curDateStr <= todayStr ? cumCur : null,
        비교달: cmpDateStr && cmpDateStr <= todayStr ? cumCmp : (cmpDateStr && compareKey !== curKey ? cumCmp : null),
      });
    }
    return arr;
  }, [data.expenses, curKey, compareKey, todayStr]);

  return (
    <div>
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 19, fontWeight: 700, marginBottom: 4 }}>분석</div>
      <div style={{ color: T.muted, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        이번 달 지출이 다른 달보다 빠르게 늘고 있는지, 어디에 많이 썼는지 확인하는 탭이에요.
      </div>

      <div style={{ ...paperCard(T), marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: F.display, color: T.ink, fontWeight: 700, fontSize: 14 }}>누적 지출 비교</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: T.goldSoft }}>비교할 달</span>
            <input type="month" value={compareKey} onChange={(e) => setCompareKey(e.target.value)}
              style={{ border: `1px solid ${T.paperLine}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, background: "#fff", color: T.ink }} />
          </div>
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curveData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={T.paperLine + "66"} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: T.mode === "dark" ? "#7A6E52" : "#9A8E6E" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: T.mode === "dark" ? "#7A6E52" : "#9A8E6E" }} tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 10000)}만` : v)} />
              <Tooltip formatter={(v) => fmtWon(v)} contentStyle={{ fontSize: 12, fontFamily: F.body }} />
              <Line type="monotone" dataKey="비교달" stroke="#B0A480" strokeWidth={2} dot={false} strokeDasharray="4 3" connectNulls />
              <Line type="monotone" dataKey="이번달" stroke={T.danger} strokeWidth={2.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 10.5, color: T.goldSoft, marginTop: 4 }}>빨강 = {monthLabel(curKey)} · 점선 = {monthLabel(compareKey)}</div>
      </div>

      <div style={paperCard(T)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: F.display, color: T.ink, fontWeight: 700, fontSize: 14 }}>카테고리별 지출 비중</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: T.goldSoft }}>조회할 달</span>
            <input type="month" value={viewKey} onChange={(e) => setViewKey(e.target.value)}
              style={{ border: `1px solid ${T.paperLine}`, borderRadius: 6, padding: "3px 6px", fontSize: 11, background: "#fff", color: T.ink }} />
          </div>
        </div>
        {byCategory.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>{monthLabel(viewKey)} 기록이 없어요.</div>
        ) : (
          <>
            <div style={{ height: 160, display: "flex", justifyContent: "center" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtWon(v)} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop: 4 }}>
              {byCategory.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                  <span style={{ flex: 1, color: T.ink, fontSize: 12 }}>{c.name}</span>
                  <span style={{ color: T.mode === "dark" ? "#7A6E52" : "#9A8E6E", fontSize: 11 }}>{totalSpent ? Math.round((c.value / totalSpent) * 100) : 0}%</span>
                  <span style={{ color: T.ink, fontFamily: F.mono, fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>{fmtWon(c.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey, cardBill } = ctx;
  const [cardAddInput, setCardAddInput] = useState("");
  const [initBalInput, setInitBalInput] = useState(String(data.account?.initialBalance || 0));
  const [fixedName, setFixedName] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalMonths, setTotalMonths] = useState("");
  const [startInstallment, setStartInstallment] = useState("1");
  const [overrideEditId, setOverrideEditId] = useState(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [savingsGoalInput, setSavingsGoalInput] = useState(String(data.savingsGoal || ""));
  const [catBudgetEditId, setCatBudgetEditId] = useState(null);
  const [catBudgetInput, setCatBudgetInput] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
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

  const addCardBill = () => { const n = Number(cardAddInput); if (!n || n <= 0) return showToast("금액을 입력해주세요"); persist({ ...data, cardBill: (data.cardBill || 0) + n }); setCardAddInput(""); showToast("카드값에 더했어요"); };
  const resetCardBill = () => { persist({ ...data, cardBill: 0 }); showToast("카드값을 초기화했어요"); };
  const saveInitBal = () => { const n = Number(initBalInput); if (Number.isNaN(n)) return showToast("올바른 금액을 입력해주세요"); persist({ ...data, account: { ...data.account, initialBalance: n } }); showToast("통장 초기 잔액을 저장했어요"); };
  const saveSavingsGoal = () => { const n = Number(savingsGoalInput); if (Number.isNaN(n) || n < 0) return showToast("올바른 금액을 입력해주세요"); persist({ ...data, savingsGoal: n }); showToast("저축 목표를 저장했어요"); };
  const setTheme = (mode) => persist({ ...data, theme: mode });
  const removeCategory = (id) => persist({ ...data, categories: data.categories.filter((c) => c.id !== id) });
  const saveCatBudget = (c) => {
    const n = Number(catBudgetInput);
    if (Number.isNaN(n) || n < 0) return showToast("올바른 금액을 입력해주세요");
    persist({ ...data, categories: data.categories.map((x) => (x.id === c.id ? { ...x, budget: n } : x)) });
    setCatBudgetEditId(null); setCatBudgetInput("");
    showToast(n > 0 ? "카테고리 예산을 저장했어요" : "카테고리 예산을 해제했어요");
  };

  const addFixed = () => {
    const n = Number(fixedAmount);
    if (!fixedName.trim()) return showToast("이름을 입력해주세요");
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    let item;
    if (isInstallment) {
      const tm = Number(totalMonths); const si = Number(startInstallment);
      if (!tm || tm < 1) return showToast("총 개월수를 입력해주세요");
      if (!si || si < 1 || si > tm) return showToast("현재 회차를 올바르게 입력해주세요 (1~총개월수)");
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: tm, startInstallment: si, setupMonthKey: curKey, overrides: {} };
    } else {
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: 0, startInstallment: 1, setupMonthKey: curKey, overrides: {} };
    }
    persist({ ...data, fixedExpenses: [...(data.fixedExpenses || []), item] });
    setFixedName(""); setFixedAmount(""); setTotalMonths(""); setStartInstallment("1"); setIsInstallment(false);
    showToast("고정지출을 추가했어요");
  };
  const removeFixed = (id) => persist({ ...data, fixedExpenses: data.fixedExpenses.filter((f) => f.id !== id) });
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
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 19, fontWeight: 700, marginBottom: 16 }}>설정</div>

      <Field label="화면 테마">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTheme("dark")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: data.theme !== "light" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: data.theme !== "light" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Moon size={15} /> 다크
          </button>
          <button onClick={() => setTheme("light")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: data.theme === "light" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: data.theme === "light" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Sun size={15} /> 라이트
          </button>
        </div>
      </Field>

      <Field label={`카드값 (현재 누적 ${fmtWon(cardBill)})`}>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={cardAddInput} onChange={(e) => setCardAddInput(e.target.value)} placeholder="새로 결제한 금액" style={{ ...inputSty(T), fontFamily: F.mono }} />
          <button onClick={addCardBill} style={{ ...primaryBtn(T), width: 72 }}>추가</button>
        </div>
        <QuickAmountButtons amount={cardAddInput} setAmount={setCardAddInput} />
        <button onClick={resetCardBill} style={{ marginTop: 8, background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, cursor: "pointer" }}>
          카드값 전액 초기화 (결제 처리)
        </button>
      </Field>

      <Field label="통장 초기 잔액">
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={initBalInput} onChange={(e) => setInitBalInput(e.target.value)} style={{ ...inputSty(T), fontFamily: F.mono }} />
          <button onClick={saveInitBal} style={{ ...primaryBtn(T), width: 72 }}>저장</button>
        </div>
        <QuickAmountButtons amount={initBalInput} setAmount={setInitBalInput} />
      </Field>

      <Field label="이번 달 저축 목표">
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={savingsGoalInput} onChange={(e) => setSavingsGoalInput(e.target.value)} placeholder="예: 500000" style={{ ...inputSty(T), fontFamily: F.mono }} />
          <button onClick={saveSavingsGoal} style={{ ...primaryBtn(T), width: 72 }}>저장</button>
        </div>
        <QuickAmountButtons amount={savingsGoalInput} setAmount={setSavingsGoalInput} />
        <div style={{ color: T.muted, fontSize: 11, marginTop: 6 }}>0으로 저장하면 홈 화면에서 숨겨져요.</div>
      </Field>

      <Field label="고정 지출 / 할부 템플릿">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 10 }}>
          {(data.fixedExpenses || []).map((f) => {
            const info = fixedInfo(f, curKey);
            return (
              <div key={f.id} style={{ padding: "8px 4px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.cream, fontSize: 13, fontWeight: 600 }}>
                      {f.name}{info.label ? ` · ${info.label}` : ""}{!info.active ? " · 완료" : ""}
                    </div>
                    <div style={{ color: T.muted, fontSize: 11 }}>{f.totalMonths ? "할부" : "매달 반복"} · 기본 {fmtWon(f.baseAmount)}</div>
                  </div>
                  {info.active && (
                    <button onClick={() => { setOverrideEditId(f.id); setOverrideInput(String(info.amount)); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold }}><Pencil size={14} /></button>
                  )}
                  <button onClick={() => removeFixed(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
                </div>
                {overrideEditId === f.id && (
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <input type="number" value={overrideInput} onChange={(e) => setOverrideInput(e.target.value)} style={{ ...inputSty(T), fontFamily: F.mono }} />
                    <button onClick={() => saveOverride(f)} style={{ ...primaryBtn(T), width: 60 }}>확인</button>
                  </div>
                )}
              </div>
            );
          })}
          {(!data.fixedExpenses || data.fixedExpenses.length === 0) && (
            <div style={{ color: T.muted, fontSize: 12, textAlign: "center", padding: "8px 0 12px" }}>등록된 고정지출이 없어요.</div>
          )}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={fixedName} onChange={(e) => setFixedName(e.target.value)} placeholder="예: 월세, 쏘렌토 할부" style={inputSty(T)} />
            <input type="number" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="월 납입 금액" style={{ ...inputSty(T), fontFamily: F.mono }} />
            <QuickAmountButtons amount={fixedAmount} setAmount={setFixedAmount} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setIsInstallment(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: !isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: !isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>매달 반복</button>
              <button onClick={() => setIsInstallment(true)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>할부</button>
            </div>
            {isInstallment && (
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.muted, fontSize: 10, marginBottom: 3 }}>총 개월수</div>
                  <input type="number" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} placeholder="예: 60" style={{ ...inputSty(T), fontFamily: F.mono }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.muted, fontSize: 10, marginBottom: 3 }}>현재 회차</div>
                  <input type="number" value={startInstallment} onChange={(e) => setStartInstallment(e.target.value)} placeholder="예: 27" style={{ ...inputSty(T), fontFamily: F.mono }} />
                </div>
              </div>
            )}
            <button onClick={addFixed} style={primaryBtn(T)}>고정지출 추가</button>
          </div>
        </div>
      </Field>

      <Field label="카테고리 관리 / 예산">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6 }}>
          {data.categories.map((c) => (
            <div key={c.id} style={{ padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                <span style={{ flex: 1, color: T.cream, fontSize: 13 }}>{c.name}</span>
                <span style={{ color: T.muted, fontSize: 11 }}>{c.budget > 0 ? `예산 ${fmtWon(c.budget)}` : "예산 없음"}</span>
                <button onClick={() => { setCatBudgetEditId(c.id); setCatBudgetInput(String(c.budget || "")); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold }}><Pencil size={14} /></button>
                <button onClick={() => removeCategory(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
              </div>
              {catBudgetEditId === c.id && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" value={catBudgetInput} onChange={(e) => setCatBudgetInput(e.target.value)} placeholder="이번 달 예산 (0=해제)" style={{ ...inputSty(T), fontFamily: F.mono }} />
                    <button onClick={() => saveCatBudget(c)} style={{ ...primaryBtn(T), width: 60 }}>확인</button>
                  </div>
                  <QuickAmountButtons amount={catBudgetInput} setAmount={setCatBudgetInput} />
                </div>
              )}
            </div>
          ))}
          {data.categories.length === 0 && <div style={{ color: T.muted, fontSize: 12, textAlign: "center", padding: "10px 0" }}>카테고리가 없어요. &lsquo;기록&rsquo; 탭에서 추가할 수 있어요.</div>}
        </div>
      </Field>

      <Field label="데이터 백업">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 12.5, cursor: "pointer" }}>내보내기</button>
          <button onClick={() => { setShowImport(!showImport); setShowExport(false); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 12.5, cursor: "pointer" }}>가져오기</button>
        </div>
        {showExport && (
          <div>
            <div style={{ color: T.muted, fontSize: 11, marginBottom: 6 }}>클립보드에 복사됐어요. 안 됐다면 아래 텍스트를 직접 복사해서 보관하세요.</div>
            <textarea readOnly value={exportJson} onFocus={(e) => e.target.select()} style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 10 }} />
          </div>
        )}
        {showImport && (
          <div>
            <div style={{ color: T.muted, fontSize: 11, marginBottom: 6 }}>백업해둔 JSON 텍스트를 붙여넣고 불러오기를 누르세요. 현재 데이터를 덮어써요.</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="여기에 백업 JSON 붙여넣기" style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 10, marginBottom: 8 }} />
            <button onClick={doImport} style={primaryBtn(T)}>불러오기</button>
          </div>
        )}
      </Field>
    </div>
  );
}
