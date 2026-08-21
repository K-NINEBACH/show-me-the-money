import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, Home as HomeIcon, BookOpen, Calendar } from "lucide-react";
import { STORAGE_KEY } from "./lib/constants";
import { THEMES, DARK, ThemeContext, F } from "./lib/theme";
import { defaultData, migrate, autoProcessFixed, fixedInfo, monthKey, monthKeyOffset, daysInMonthKey, todayISO } from "./lib/data";
import { GoogleFonts, NavBtn } from "./components/common";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Onboarding, MonthWrapUp } from "./screens/Gates";
import { HomeView } from "./screens/Home";
import { AddView } from "./screens/Add";
import { LedgerView } from "./screens/Ledger";
import { CalendarView } from "./screens/Calendar";
import { SettingsView } from "./screens/Settings";

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = localStorage.getItem(STORAGE_KEY);
        if (res) {
          const loaded = migrate(JSON.parse(res));
          const processed = autoProcessFixed(loaded);
          setData(processed);
          if (processed !== loaded) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(processed)); } catch {}
          }
        } else setData(defaultData());
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

  if (!data.onboarded) {
    return (
      <ThemeContext.Provider value={T}>
        <Onboarding data={data} persist={persist} />
      </ThemeContext.Provider>
    );
  }

  const nowMonthKey = monthKey(new Date());
  if (data.lastSeenMonth && data.lastSeenMonth !== nowMonthKey) {
    return (
      <ThemeContext.Provider value={T}>
        <MonthWrapUp data={data} persist={persist} wrapKey={data.lastSeenMonth} />
      </ThemeContext.Provider>
    );
  }

  const today = new Date();
  const todayStr = todayISO();
  const curKey = monthKey(today);
  const cycleLen = daysInMonthKey(curKey);
  const dayIntoCycle = today.getDate();

  const cycleExpenses = data.expenses.filter((e) => e.date.slice(0, 7) === curKey && !e.isReceivable);
  const todaySpent = cycleExpenses.filter((e) => e.date === todayISO()).reduce((s, e) => s + Number(e.amount), 0);
  const normalSpent = cycleExpenses.filter((e) => (e.paymentMethod || "cash") !== "card").reduce((s, e) => s + Number(e.amount), 0);
  // isCardAdjustment 항목(정기결제 "카드반영")은 제외 — fixedSumAll이 이 금액을 매달
  // 이미 반영 여부와 무관하게 미리 포함하고 있어서, 여기서도 더하면 이중 계산됨.
  const cardSpentThisCycle = cycleExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment).reduce((s, e) => s + Number(e.amount), 0);

  const cards = data.cards && data.cards.length ? data.cards : [{ id: "card1", name: "카드", bill: 0 }];
  const fixedActiveAll = data.fixedExpenses.map((f) => ({ ...f, info: fixedInfo(f, curKey) })).filter((f) => f.info.active);
  const fixedActive = fixedActiveAll.filter((f) => (f.paymentMethod || "cash") !== "card");
  const fixedCardActive = fixedActiveAll.filter((f) => (f.paymentMethod || "cash") === "card");
  const fixedCardInstallment = fixedCardActive.filter((f) => f.totalMonths > 0);
  const fixedCardRecurring = fixedCardActive.filter((f) => !f.totalMonths);
  const fixedSum = fixedActive.reduce((s, f) => s + Number(f.info.amount), 0) + fixedCardRecurring.reduce((s, f) => s + Number(f.info.amount), 0);
  const fixedSumAll = fixedActiveAll.reduce((s, f) => s + Number(f.info.amount), 0);
  const totalSpentThisMonth = normalSpent + cardSpentThisCycle + fixedSumAll;

  const cardTotals = cards.map((c) => {
    const fixedPortion = fixedCardInstallment.filter((f) => (f.cardId || cards[0]?.id) === c.id).reduce((s, f) => s + Number(f.info.amount), 0);
    return { ...c, fixedPortion, total: Number(c.bill || 0) + fixedPortion };
  });
  const cardBillTotal = cardTotals.reduce((s, c) => s + c.total, 0);

  const prevKey = monthKeyOffset(curKey, -1);
  const prevMonthExpenses = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === prevKey);
  const prevSpentDirect = prevMonthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const prevFixedSum = data.fixedExpenses.map((f) => fixedInfo(f, prevKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const prevTotalSpent = prevSpentDirect + prevFixedSum;

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

  const unpaidFixed = [...fixedActive, ...fixedCardRecurring].filter((f) => !(f.paidMonths && f.paidMonths[curKey]));
  const unpaidFixedSum = unpaidFixed.reduce((s, f) => s + Number(f.info.amount), 0);
  const processedSpent = spent - unpaidFixedSum;
  const realRemaining = spendingGoal - processedSpent;
  const realBudgetRatio = hasGoal ? Math.min(processedSpent / spendingGoal, 1.2) : (processedSpent > 0 ? 1.2 : 0);

  const ctx = {
    data, persist, showToast, today, todayStr, curKey, prevKey, cycleLen, dayIntoCycle,
    cycleExpenses, normalSpent, fixedActive, fixedCardActive, fixedCardInstallment, fixedCardRecurring, fixedSum, fixedSumAll, cards, cardTotals, cardBillTotal, totalSpentThisMonth, prevTotalSpent,
    spent, remaining, budgetRatio, receivables, accounts, accountTotals, accountBalance, spendingGoal, hasGoal, unpaidFixed, unpaidFixedSum, processedSpent, realRemaining, realBudgetRatio, todaySpent,
  };

  const S = {
    appShell: { background: `radial-gradient(circle at 50% -10%, ${T.bg2}, ${T.bg} 60%)`, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body },
    screen: { flex: 1, overflowY: "auto", padding: "20px 16px 12px", paddingBottom: 90 },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.navBg, borderTop: `1px solid ${T.goldSoft}55`, backdropFilter: "blur(8px)", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" },
    toast: { position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.gold, color: "#23190C", padding: "8px 16px", borderRadius: 20, fontSize: 16, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },
  };

  return (
    <ThemeContext.Provider value={T}>
      <div style={S.appShell}>
        <GoogleFonts />
        <div style={S.screen}>
          {tab === "home" && <HomeView ctx={ctx} />}
          {tab === "add" && <AddView ctx={ctx} />}
          {tab === "ledger" && <LedgerView ctx={ctx} />}
          {tab === "calendar" && <CalendarView ctx={ctx} />}
          {tab === "settings" && <SettingsView ctx={ctx} />}
        </div>
        <nav style={S.nav}>
          <NavBtn icon={HomeIcon} label="홈" active={tab === "home"} onClick={() => setTab("home")} />
          <NavBtn icon={Plus} label="기록" active={tab === "add"} onClick={() => setTab("add")} />
          <NavBtn icon={BookOpen} label="내역" active={tab === "ledger"} onClick={() => setTab("ledger")} />
          <NavBtn icon={Calendar} label="달력" active={tab === "calendar"} onClick={() => setTab("calendar")} />
          <NavBtn icon={Settings} label="설정" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>
        {toast && <div style={S.toast}>{toast}</div>}
      </div>
    </ThemeContext.Provider>
  );
}
