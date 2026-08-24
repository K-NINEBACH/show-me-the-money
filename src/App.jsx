import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Plus, Settings, Home as HomeIcon, BookOpen, Calendar } from "lucide-react";
import { STORAGE_KEY } from "./lib/constants";
import { THEMES, DARK, ThemeContext, F } from "./lib/theme";
import { defaultData, migrate, autoProcessFixed, fixedInfo, monthKey, monthKeyOffset, daysInMonthKey, todayISO } from "./lib/data";
import { NavBtn } from "./components/common";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HomeView } from "./screens/Home";
import { AddView } from "./screens/Add";
import { LedgerView } from "./screens/Ledger";
// 홈/기록/내역은 매일 쓰는 탭이라 그대로 즉시 로드하고, 온보딩·월마감·달력·설정은
// 자주 안 들어가는 화면이라 lazy로 분리 — 평소에 쓰는 3탭의 초기 로딩 크기를 줄여서
// 앱을 켤 때 실제로 체감되는 속도를 개선함. 한 번 들어가면 서비스워커가 캐시해두니
// 그다음부턴 이 지연도 없음.
const Onboarding = lazy(() => import("./screens/Gates").then((m) => ({ default: m.Onboarding })));
const MonthWrapUp = lazy(() => import("./screens/Gates").then((m) => ({ default: m.MonthWrapUp })));
const CalendarView = lazy(() => import("./screens/Calendar").then((m) => ({ default: m.CalendarView })));
const SettingsView = lazy(() => import("./screens/Settings").then((m) => ({ default: m.SettingsView })));

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function LoadingGate({ T }) {
  return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: T.cream, fontFamily: F.body }}>불러오는 중…</div>
    </div>
  );
}

function AppInner() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState("");
  const [, forceTick] = useState(0);

  // PWA로 설치해서 쓰면 화면을 껐다 켜거나 다른 앱 갔다 와도 이 탭이 메모리에 그대로
  // 남아있는 경우가 많음 — 그러면 today/curKey 같은 값들이 마지막으로 렌더링됐던
  // 시점에 멈춰있어서, 자정을 넘겨서 돌아오면 "오늘 지출"이나 며칠차 표시가 어제
  // 기준으로 그대로 보이고, 달까지 바뀌었으면 월마감 화면도 안 뜸. 다시 화면을 볼 때
  // 강제로 한 번 더 렌더링해서 날짜 관련 값들이 항상 최신으로 다시 계산되게 함.
  useEffect(() => {
    const onWake = () => { if (document.visibilityState === "visible") forceTick((n) => n + 1); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

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
        <Suspense fallback={<LoadingGate T={T} />}>
          <Onboarding data={data} persist={persist} />
        </Suspense>
      </ThemeContext.Provider>
    );
  }

  const nowMonthKey = monthKey(new Date());
  if (data.lastSeenMonth && data.lastSeenMonth !== nowMonthKey) {
    return (
      <ThemeContext.Provider value={T}>
        <Suspense fallback={<LoadingGate T={T} />}>
          <MonthWrapUp data={data} persist={persist} wrapKey={data.lastSeenMonth} />
        </Suspense>
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
  // "카드 매달반복" 항목은 반영(카드반영) 전에는 예측치로 fixedSum에 잡아두지만,
  // 일단 반영되면 그 금액이 c.bill(→cardBillTotal)에 실제로 들어가므로 여기서는 빼야 함.
  // 안 그러면 반영한 달에 spent에서 그 항목이 두 번(예측치+실제치) 잡히는 이중계산이 생김.
  const fixedCardRecurringUnpaid = fixedCardRecurring.filter((f) => !(f.paidMonths && f.paidMonths[curKey]));
  const fixedSum = fixedActive.reduce((s, f) => s + Number(f.info.amount), 0) + fixedCardRecurringUnpaid.reduce((s, f) => s + Number(f.info.amount), 0);
  const fixedSumAll = fixedActiveAll.reduce((s, f) => s + Number(f.info.amount), 0);
  const totalSpentThisMonth = normalSpent + cardSpentThisCycle + fixedSumAll;

  const cardTotals = cards.map((c) => {
    // f.cardId가 (예: JSON 백업을 통해 들어온) 이미 삭제된 카드를 가리키면 어느 카드와도
    // 매칭이 안 돼서 이 할부 몫이 예산 계산에서 통째로 조용히 빠짐 — 유효하지 않으면
    // 첫 카드로 몰아서 최소한 어딘가엔 집계되게 함.
    const fixedPortion = fixedCardInstallment
      .filter((f) => (f.cardId && cards.some((cc) => cc.id === f.cardId) ? f.cardId : cards[0]?.id) === c.id)
      .reduce((s, f) => s + Number(f.info.amount), 0);
    return { ...c, fixedPortion, total: Number(c.bill || 0) + fixedPortion };
  });
  const cardBillTotal = cardTotals.reduce((s, c) => s + c.total, 0);

  const prevKey = monthKeyOffset(curKey, -1);
  const prevMonthExpenses = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === prevKey);
  // totalSpentThisMonth과 같은 방식으로 계산해야 공평한 비교가 됨 — "카드반영"으로 생긴
  // isCardAdjustment 항목은 fixedSumAll(예측치) 쪽에서 이미 잡고 있어서, 실제 지출
  // 합산에서까지 더하면 이중계산됨. 예전엔 이 구분 없이 그냥 다 더해서, 카드반영을 쓴
  // 달일수록 "지난달 총 지출"이 실제보다 부풀려져 있었음.
  const prevNormalSpent = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") !== "card").reduce((s, e) => s + Number(e.amount), 0);
  const prevCardSpent = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment).reduce((s, e) => s + Number(e.amount), 0);
  const prevFixedSum = data.fixedExpenses.map((f) => fixedInfo(f, prevKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const prevTotalSpent = prevNormalSpent + prevCardSpent + prevFixedSum;
  // 홈 화면의 "지난달 대비"는 이번 달 지금까지(진행 중)와 지난달 전체(이미 끝난 달)를
  // 그냥 비교하면 월초일수록 무조건 크게 줄어든 것처럼 보임(비교 기간 길이가 다르니까) —
  // 달력 탭의 "지난달 이맘때보다"처럼 지난달도 오늘과 같은 날짜까지만 잘라서 비교해야
  // 공평함. 고정지출은 날짜 단위로 나뉘는 개념이 아니라(한 달치가 통째로 잡힘) 안 자름.
  const prevCutoff = Math.min(dayIntoCycle, daysInMonthKey(prevKey));
  const prevNormalSpentToDate = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") !== "card" && Number(e.date.slice(8, 10)) <= prevCutoff).reduce((s, e) => s + Number(e.amount), 0);
  const prevCardSpentToDate = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment && Number(e.date.slice(8, 10)) <= prevCutoff).reduce((s, e) => s + Number(e.amount), 0);
  const prevTotalSpentToDate = prevNormalSpentToDate + prevCardSpentToDate + prevFixedSum;

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
    cycleExpenses, normalSpent, fixedActive, fixedCardActive, fixedCardInstallment, fixedCardRecurring, fixedSum, fixedSumAll, cards, cardTotals, cardBillTotal, totalSpentThisMonth, prevTotalSpent, prevTotalSpentToDate,
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
        <div style={S.screen}>
          {tab === "home" && <HomeView ctx={ctx} />}
          {tab === "add" && <AddView ctx={ctx} />}
          {tab === "ledger" && <LedgerView ctx={ctx} />}
          {(tab === "calendar" || tab === "settings") && (
            <Suspense fallback={<div style={{ color: T.muted, fontFamily: F.body, textAlign: "center", padding: "40px 0" }}>불러오는 중…</div>}>
              {tab === "calendar" && <CalendarView ctx={ctx} />}
              {tab === "settings" && <SettingsView ctx={ctx} />}
            </Suspense>
          )}
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
