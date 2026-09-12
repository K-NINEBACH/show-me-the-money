import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Plus, Settings, Home as HomeIcon, BookOpen, Calendar } from "lucide-react";
import { STORAGE_KEY, INBOX_KEY, SEEN_KEY, ALERT_LOG_KEY } from "./lib/constants";
import { THEMES, DARK, ThemeContext, F, applyThemeVars } from "./lib/theme";
import { defaultData, migrate, autoProcessFixed, fixedInfo, monthKey, monthKeyOffset, daysInMonthKey, todayISO, netAmount } from "./lib/data";
import { NavBtn } from "./components/common";
import { pullPendingPayments, saveBackup, inNativeApp } from "./lib/native";
import { autoRecordPayments, isCancelText } from "./lib/auto-record";

/*
  받은 알림을 어떻게 처리했는지 남긴다(진단용, 최근 40건). 결제가 안 들어왔을 때
  웹이 받아 놓고 넘긴 건지, 애초에 못 받은 건지 설정 화면에서 가를 수 있게.
*/
function logAlerts(rows) {
  if (!rows.length) return;
  try {
    const old = JSON.parse(localStorage.getItem(ALERT_LOG_KEY) || "[]");
    localStorage.setItem(ALERT_LOG_KEY, JSON.stringify([...old, ...rows.map((r) => ({ ...r, loggedAt: Date.now() }))].slice(-40)));
  } catch { /* 못 적어도 앱은 돈다 */ }
}
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
  /*
    밖에서 넘어온 결제 문자.

    안드로이드에서 문자·알림을 '공유 → 내돈챙겨줘'로 보내면 manifest의
    share_target을 타고 ?text=... 로 열린다. MacroDroid 같은 자동화 앱이
    같은 주소를 직접 열어도 똑같이 동작한다(?paste=... 도 받는다).

    **주소는 곧바로 지운다.** 안 지우면 새로고침할 때마다 같은 문자가 다시
    올라오고, 홈 화면에 그 주소가 저장돼 버리면 앱을 켤 때마다 뜬다.
  */
  const [pendingText, setPendingText] = useState(null);
  useEffect(() => {
    let raw = null;
    try {
      const q = new URLSearchParams(window.location.search);
      raw = q.get("text") || q.get("paste") || q.get("title");
    } catch {
      /* 주소가 이상해도 앱은 떠야 한다 */
    }
    if (!raw || !raw.trim()) return;
    setPendingText(raw);
    setTab("add");
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* 주소를 못 지워도 등록은 되게 둔다 */
    }
  }, []);

  /*
    껍데기 앱이 모아 둔 결제 알림을 가져온다.

    앱을 켤 때와 화면으로 돌아올 때, 그리고 **켜 둔 동안에도 이따금** 확인한다.
    알림은 앱이 꺼져 있을 때도 오므로 저쪽에 쌓여 있고, 여기서 가져오면 저쪽
    큐는 비워진다.

    켜 둔 동안에도 보는 이유: 예전엔 껍데기가 보내는 '돌아옴' 신호에만 기댔다.
    그래서 앱을 보고 있는 중에 결제 알림이 오면 큐에 쌓이기만 하고, 앱을
    나갔다 다시 들어와야 그제야 들어왔다. 결제하고 바로 앱을 여는 게 흔한
    흐름이라 이 자리에서 자주 놓쳤다.

    여기서는 받아만 둔다. 이 중에 무엇을 자동으로 넣을지는 바로 아래 효과가
    auto-record.js의 규칙으로 정하고, 확실하지 않은 것은 알림함에 남는다.
  */
  /*
    **알림함은 휴대폰에 저장한다.**

    껍데기는 여기서 가져가는 순간 자기 큐를 비운다. 그런데 알림함이 메모리에만
    있어서, 애매해서 보류된 알림은 앱을 닫는 순간 양쪽 어디에도 남지 않았다.
    "애매하면 알림함에 남겨 사람이 나중에 넣는다"가 사실은 "앱을 켜 둔 동안만"
    이었던 것이다. 보지도 못한 알림은 나중에 넣을 수도 없다.

    가계부 데이터와 다른 칸(INBOX_KEY)에 둔다. 한 번 판단한 표시(checked)도 같이
    저장되므로, 다시 켜도 보류한 것을 자동으로 재판단하지 않는다.
  */
  const [inbox, setInbox] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(INBOX_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { localStorage.setItem(INBOX_KEY, JSON.stringify(inbox)); } catch { /* 저장 못 해도 앱은 돈다 */ }
  }, [inbox]);
  useEffect(() => {
    const pull = () => {
      const pulled = pullPendingPayments();
      if (!pulled.length) return;
      /*
        이미 받아 처리한 알림은 다시 안 받는다. 껍데기는 휴대폰을 재시작하거나 앱을
        업데이트하면 알림창에 남은 알림을 다시 넘긴다. 그걸 또 처리하면, 예컨대 이미
        기록을 되돌린 취소 알림이 짝을 못 찾아 알림함에 괜히 뜬다.
      */
      let seen = [];
      try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { seen = []; }
      const got = pulled.filter((g) => !seen.includes(g.text));
      logAlerts(pulled.filter((g) => seen.includes(g.text)).map((g) => ({ text: g.text, at: g.at, outcome: "이미 받은 알림이라 무시" })));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...got.map((g) => g.text)].slice(-500))); } catch { /* 못 적어도 앱은 돈다 */ }
      logAlerts(got.map((g) => ({ text: g.text, at: g.at, outcome: "받음" })));
      if (!got.length) return;
      /*
        같은 문구는 한 번만. 껍데기가 다시 연결될 때 알림창에 남은 것을 한 번 더
        훑어 넘기는데, 이미 알림함에 있는 걸 또 쌓으면 같은 줄이 늘어난다.
        광고 같은 게 섞여 끝없이 쌓이지 않게 최근 50건만 둔다.
      */
      setInbox((prev) => [...prev, ...got.filter((g) => !prev.some((p) => p.text === g.text))].slice(-50));
    };
    pull();
    window.addEventListener("passbook-native-resume", pull);
    // 껍데기가 아니면 가져올 것 자체가 없으므로 타이머도 안 건다
    const tick = inNativeApp()
      ? setInterval(() => { if (document.visibilityState === "visible") pull(); }, 15000)
      : null;
    return () => {
      if (tick) clearInterval(tick);
      window.removeEventListener("passbook-native-resume", pull);
    };
  }, []);

  /*
    자동 등록 — 확실한 것만.

    조건에 안 맞는 것은 알림함에 남아 사람이 본다. 넣은 것에는 auto 표시가
    붙어서 내역에서 '자동' 배지로 보인다 — 이상하면 그 줄만 훑어 지울 수 있다.

    **한 번 보류한 알림은 다시 자동으로 넣지 않는다**(checked 표시). 이 효과는
    data가 바뀔 때마다 도는데, 예전엔 그때마다 알림함 전체를 다시 판단했다.
    그러면 "애매하니 사람이 보라"고 미뤄 둔 것이 나중에 엉뚱한 데이터 변경에
    편승해 조용히 들어간다 — 백업을 되돌렸더니 알림함에 있던 건이 딸려 들어오는
    식이다. 보류했다는 건 사람이 보고 정하라는 뜻이므로, 그다음은 '채우기'를
    눌러서만 들어간다.
  */
  useEffect(() => {
    if (!data?.autoRecord) return;
    const fresh = inbox.filter((i) => !i.checked);
    const heldBefore = inbox.filter((i) => i.checked);
    // 보류된 것도 넘긴다 — 자동으로 넣지는 않고, 결제·취소 짝을 맞출 때만 쓴다
    const { next, registered, leftover, dropped, undone, skipped } = autoRecordPayments(data, fresh, heldBefore);
    // 새로 온 것도, 치울 짝도 없으면 아무 상태도 안 바꾼다 — 안 그러면 이 효과가 끝없이 돈다
    if (fresh.length === 0 && dropped.length === 0) return;
    const keep = new Set(leftover);
    const gone = new Set(dropped);
    const skip = new Set(skipped);
    logAlerts(fresh.map((i) => ({
      text: i.text, at: i.at,
      outcome: keep.has(i) ? "알림함에 남김(어느 카드·통장인지 모름 등)"
        : gone.has(i) ? "결제·취소 짝이라 안 넣음"
        : skip.has(i) ? "이미 적힌 거래라 넘김"
        : isCancelText(i.text) ? "취소 → 기록 되돌림" : "자동 기록함",
    })));
    // 판단이 끝난 것만 남기고 표시해 둔다 — 넣은 것과 짝이 맞아 치운 것은 목록에서 빠진다
    setInbox(inbox.filter((i) => !gone.has(i) && (i.checked || keep.has(i))).map((i) => (i.checked ? i : { ...i, checked: true })));
    const msgs = [];
    if (registered.length) msgs.push(`결제 ${registered.length}건 자동으로 기록했어요`);
    if (undone.length) msgs.push(`취소된 결제 ${undone.length}건을 기록에서 뺐어요`);
    if (dropped.length) msgs.push(`결제 후 취소된 ${Math.round(dropped.length / 2)}건은 넣지 않았어요`);
    if (skipped.length) msgs.push(`이미 적힌 거래 ${skipped.length}건은 넘겼어요`);
    if (next !== data) persist(next);
    if (msgs.length) showToast(msgs.join(" · "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, data]);
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

  /*
    새 알림 문구가 뜨면 앞 문구의 타이머를 끊는다. 예전엔 앞 타이머가 그대로 살아
    있어서 연달아 뜬 뒤 문구를 일찍 지웠다 — 결제가 자동으로 들어가고 곧바로 취소가
    오면 "기록에서 뺐어요"가 뜨자마자 사라졌다.
  */
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };

  const T = (data && THEMES[data.theme]) || THEMES.dark;
  useEffect(() => { applyThemeVars(T); }, [T]);

  /*
    자동 백업 — 화면을 벗어날 때 한 번.

    데이터가 바뀔 때마다 저장하면 글자 하나 칠 때마다 파일을 쓴다. 기록을
    남기고 앱을 닫는 게 가장 흔한 흐름이라, 그 순간이 데이터가 가장 최신인
    지점이다. 껍데기 앱이 없으면(크롬으로 열었으면) 아무 일도 안 한다.
  */
  useEffect(() => {
    if (!data) return;
    const dump = () => saveBackup(data);
    window.addEventListener("passbook-native-pause", dump);
    const onHide = () => {
      if (document.visibilityState === "hidden") dump();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("passbook-native-pause", dump);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [data]);

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
  const todaySpent = cycleExpenses.filter((e) => e.date === todayISO()).reduce((s, e) => s + netAmount(e), 0);
  const normalSpent = cycleExpenses.filter((e) => (e.paymentMethod || "cash") !== "card").reduce((s, e) => s + netAmount(e), 0);
  // isCardAdjustment 항목(정기결제 "카드반영")은 제외 — fixedSumAll이 이 금액을 매달
  // 이미 반영 여부와 무관하게 미리 포함하고 있어서, 여기서도 더하면 이중 계산됨.
  const cardSpentThisCycle = cycleExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment).reduce((s, e) => s + netAmount(e), 0);

  /*
    카드로 대신 내주고 돌려받은 돈.

    카드 지출은 spent에 cardBillTotal(카드사에 낼 실제 청구액)로 들어간다.
    청구액은 돌려받은 것과 무관하게 전액 그대로라 netAmount로는 안 빠진다.
    그래서 이 몫만 따로 한 번 뺀다 — 카드값은 나가지만 그만큼 통장으로
    이미 들어왔으니, 이번 달 내 주머니에서 실제로 줄어든 돈은 그 차액이다.

    (현금으로 대신 낸 것은 normalSpent가 이미 net이라 여기서 세면 두 번 뺀다)
  */
  const cardReimbursedThisCycle = cycleExpenses.filter((e) => (e.paymentMethod || "cash") === "card").reduce((s, e) => s + Number(e.reimbursedAmount || 0), 0);
  const reimbursedThisCycle = cycleExpenses.reduce((s, e) => s + Number(e.reimbursedAmount || 0), 0);

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
  const prevNormalSpent = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") !== "card").reduce((s, e) => s + netAmount(e), 0);
  const prevCardSpent = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment).reduce((s, e) => s + netAmount(e), 0);
  const prevFixedSum = data.fixedExpenses.map((f) => fixedInfo(f, prevKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const prevTotalSpent = prevNormalSpent + prevCardSpent + prevFixedSum;
  // 홈 화면의 "지난달 대비"는 이번 달 지금까지(진행 중)와 지난달 전체(이미 끝난 달)를
  // 그냥 비교하면 월초일수록 무조건 크게 줄어든 것처럼 보임(비교 기간 길이가 다르니까) —
  // 달력 탭의 "지난달 이맘때보다"처럼 지난달도 오늘과 같은 날짜까지만 잘라서 비교해야
  // 공평함. 고정지출은 날짜 단위로 나뉘는 개념이 아니라(한 달치가 통째로 잡힘) 안 자름.
  const prevCutoff = Math.min(dayIntoCycle, daysInMonthKey(prevKey));
  const prevNormalSpentToDate = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") !== "card" && Number(e.date.slice(8, 10)) <= prevCutoff).reduce((s, e) => s + netAmount(e), 0);
  const prevCardSpentToDate = prevMonthExpenses.filter((e) => (e.paymentMethod || "cash") === "card" && !e.isCardAdjustment && Number(e.date.slice(8, 10)) <= prevCutoff).reduce((s, e) => s + netAmount(e), 0);
  const prevTotalSpentToDate = prevNormalSpentToDate + prevCardSpentToDate + prevFixedSum;

  const spent = normalSpent + fixedSum + cardBillTotal - cardReimbursedThisCycle;
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
    cycleExpenses, normalSpent, fixedActive, fixedCardActive, fixedCardInstallment, fixedCardRecurring, fixedSum, fixedSumAll, cards, cardTotals, cardBillTotal, totalSpentThisMonth, prevTotalSpent, prevTotalSpentToDate, reimbursedThisCycle,
    spent, remaining, budgetRatio, receivables, accounts, accountTotals, accountBalance, spendingGoal, hasGoal, unpaidFixed, unpaidFixedSum, processedSpent, realRemaining, realBudgetRatio, todaySpent,
    pendingText, clearPendingText: () => setPendingText(null),
    // 번호가 아니라 알림 자체(문구+받은 시각)로 지운다 — 목록은 15초마다 늘고 자동 처리로
    // 줄기도 해서, 누르는 순간 번호가 당겨지면 엉뚱한 알림이 지워질 수 있었다
    inbox, dismissInbox: (item) => setInbox((prev) => prev.filter((p) => !(p.text === item.text && p.at === item.at))),
  };

  const S = {
    appShell: { background: `radial-gradient(circle at 50% -10%, ${T.bg2}, ${T.bg} 60%)`, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: F.body },
    screen: { flex: 1, overflowY: "auto", padding: "20px 16px 12px", paddingBottom: 90 },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.navBg, borderTop: `1px solid ${T.goldSoft}55`, backdropFilter: "blur(8px)", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))" },
    toast: { position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.gold, color: T.onGold, padding: "8px 16px", borderRadius: 20, fontSize: 16, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", width: "max-content", maxWidth: "calc(100% - 32px)", textAlign: "center" },
  };

  return (
    <ThemeContext.Provider value={T}>
      <div style={S.appShell}>
        <main style={S.screen}>
          {tab === "home" && <HomeView ctx={ctx} />}
          {tab === "add" && <AddView ctx={ctx} />}
          {tab === "ledger" && <LedgerView ctx={ctx} />}
          {(tab === "calendar" || tab === "settings") && (
            <Suspense fallback={<div style={{ color: T.muted, fontFamily: F.body, textAlign: "center", padding: "40px 0" }}>불러오는 중…</div>}>
              {tab === "calendar" && <CalendarView ctx={ctx} />}
              {tab === "settings" && <SettingsView ctx={ctx} />}
            </Suspense>
          )}
        </main>
        <nav style={S.nav}>
          <NavBtn icon={HomeIcon} label="홈" active={tab === "home"} onClick={() => setTab("home")} />
          <NavBtn icon={Plus} label="기록" active={tab === "add"} onClick={() => setTab("add")} />
          <NavBtn icon={BookOpen} label="내역" active={tab === "ledger"} onClick={() => setTab("ledger")} />
          <NavBtn icon={Calendar} label="달력" active={tab === "calendar"} onClick={() => setTab("calendar")} />
          <NavBtn icon={Settings} label="설정" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>
        {/* 자리는 늘 두고 글자만 바꾼다 — 그래야 스크린리더가 매번 읽어 준다 */}
        <div role="status" aria-live="polite" style={toast ? S.toast : { position: "fixed", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{toast}</div>
      </div>
    </ThemeContext.Provider>
  );
}
