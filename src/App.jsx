import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Plus, Settings, Home as HomeIcon, BookOpen, Calendar } from "lucide-react";
import { STORAGE_KEY, INBOX_KEY, SEEN_KEY, SEEN_DEAL_KEY, ALERT_LOG_KEY } from "./lib/constants";
import { THEMES, DARK, ThemeContext, F, applyThemeVars } from "./lib/theme";
import { defaultData, migrate, autoProcessFixed, repairMisdatedAuto, findPayDeposit, fixedInfo, monthKey, monthKeyOffset, daysInMonthKey, todayISO, netAmount } from "./lib/data";
import { NavBtn } from "./components/common";
import { pullPendingPayments, saveBackup, inNativeApp, pushSummary } from "./lib/native";
import { autoRecordPayments, isCancelText, dealKey } from "./lib/auto-record";
import { fetchDrops, markApplied } from "./lib/drop";
import { parseStatement, reconcileStatement, reprojectInstallment } from "./lib/statement";

/*
  받은 알림을 어떻게 처리했는지 남긴다(진단용, 최근 40건). 결제가 안 들어왔을 때
  웹이 받아 놓고 넘긴 건지, 애초에 못 받은 건지 설정 화면에서 가를 수 있게.
*/
function logAlerts(rows) {
  if (!rows.length) return;
  try {
    const old = JSON.parse(localStorage.getItem(ALERT_LOG_KEY) || "[]");
    // 알림 하나에 두 줄(받음·처리 결과)이 쌓인다 — 껍데기 기록(30건)보다 넉넉히 둬야 설정에서 안 끊긴다
    localStorage.setItem(ALERT_LOG_KEY, JSON.stringify([...old, ...rows.map((r) => ({ ...r, loggedAt: Date.now() }))].slice(-150)));
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

/*
  **위젯·아침 알림에 쓸 요약을 껍데기에 넘긴다**(2026-09-17, 껍데기 1.3부터).

  사용자의 핵심은 "굳이 추가적인 제스처나 행동 없이 한눈에". 마지막까지 남아 있던 행동이
  '앱을 여는 것'이었다. 숫자가 바뀔 때마다 넘겨 두면 껍데기가 홈 화면 위젯을 그리고,
  아침에 "오늘은 N원까지"를 알리고, 월급을 넘어선 순간 경고를 띄운다.
  **숫자는 웹이 낸다** — 네이티브가 가계부 형식을 알면 계산이 두 벌이 되고 반드시 갈라진다.

  화면이 없는 컴포넌트인 이유: 이 값들은 로딩·온보딩 게이트 **뒤**에서 만들어지는데,
  그 자리에 useEffect를 쓰면 렌더마다 훅 수가 달라져 앱이 통째로 죽는다(React #310).
*/
function NativeSummary({ s }) {
  const key = JSON.stringify(s);
  useEffect(() => { pushSummary(JSON.parse(key)); }, [key]);
  return null;
}

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
  // 알림을 가져오는 타이머는 한 번만 걸려서 inbox를 직접 못 본다 — 최신 값을 여기로
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
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
      const fresh = pulled.filter((g) => !seen.includes(g.text));
      logAlerts(pulled.filter((g) => seen.includes(g.text)).map((g) => ({ text: g.text, at: g.at, outcome: "이미 받은 알림이라 무시" })));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((g) => g.text)].slice(-500))); } catch { /* 못 적어도 앱은 돈다 */ }
      // 글자는 달라도 같은 거래(문자 앱 알림과 문자함에서 같은 문자)면 한 번만 — dealKey 설명 참고
      let deals = [];
      try { deals = JSON.parse(localStorage.getItem(SEEN_DEAL_KEY) || "[]"); } catch { deals = []; }
      const got = [];
      const twice = [];
      /*
        먼저 온 쪽이 알림함에 보류돼 있으면 버리지 않고 **나중 것으로 바꿔 다시 판단한다.**
        문자는 보낸 앱으로 은행을 못 가려 보류될 수 있는데, 같은 거래가 은행 앱 알림으로
        오면 그쪽은 가려진다. 나중 것을 버리면 가려질 수 있는 거래가 알림함에 남는다.
      */
      const replaced = new Set();
      for (const g of fresh) {
        const k = dealKey(g.text);
        if (k && deals.includes(k)) {
          const held = inboxRef.current.find((i) => i.checked && !replaced.has(i.text) && dealKey(i.text) === k);
          if (!held) { twice.push(g); continue; }
          replaced.add(held.text);
        } else if (k) deals.push(k);
        got.push(g);
      }
      try { localStorage.setItem(SEEN_DEAL_KEY, JSON.stringify(deals.slice(-300))); } catch { /* 못 적어도 앱은 돈다 */ }
      logAlerts(twice.map((g) => ({ text: g.text, at: g.at, outcome: "같은 거래가 문자·알림으로 또 와서 무시" })));
      logAlerts(got.map((g) => ({ text: g.text, at: g.at, outcome: "받음" })));
      if (!got.length) return;
      if (replaced.size) setInbox((prev) => prev.filter((p) => !replaced.has(p.text)));
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
    const { next, registered, leftover, dropped, undone, skipped, synced, settled, transits, ignored, dupPaid } = autoRecordPayments(data, fresh, heldBefore);
    // 새로 온 것도, 치울 짝도 없으면 아무 상태도 안 바꾼다 — 안 그러면 이 효과가 끝없이 돈다
    if (fresh.length === 0 && dropped.length === 0) return;
    const keep = new Set(leftover);
    const gone = new Set(dropped);
    const skip = new Set(skipped);
    const won = (n) => `${n > 0 ? "+" : "-"}${Math.abs(n).toLocaleString("ko-KR")}원`;
    const syncOf = new Map(synced.map((s) => [s.item, s]));
    const paidOf = new Map(settled.map((s) => [s.item, s]));
    const transitOf = new Map(transits.map((s) => [s.item, s]));
    const quiet = new Set(ignored);
    const dupSet = new Set(dupPaid || []);
    logAlerts(fresh.map((i) => ({
      text: i.text, at: i.at,
      outcome: (keep.has(i) ? "알림함에 남김(어느 카드·통장인지 모름 등)"
        : gone.has(i) ? "결제·취소 짝이라 안 넣음"
        : skip.has(i) ? "이미 적힌 거래라 넘김"
        : dupSet.has(i) ? "이미 반영한 카드값 결제라 넘김"
        : quiet.has(i) ? "명세서·결제금액 안내라 넘김"
        : paidOf.has(i) ? `카드값 ${paidOf.get(i).partial ? "일부" : "전액"} 결제 확인 → ${paidOf.get(i).card} ${Number(paidOf.get(i).before).toLocaleString("ko-KR")}원 → ${Number(paidOf.get(i).after).toLocaleString("ko-KR")}원${paidOf.get(i).fixedNote ? ` · ${paidOf.get(i).fixedNote.name} ${paidOf.get(i).fixedNote.after.toLocaleString("ko-KR")}원으로(남은 회차 다시 계산)` : ""}`
        : transitOf.has(i) ? `${transitOf.get(i).month}월 대중교통 합계 반영${transitOf.get(i).paid ? " · 이미 낸 카드값이라 카드값은 그대로" : ""}`
        : isCancelText(i.text) ? "취소 → 기록 되돌림" : "자동 기록함")
        + (syncOf.has(i) ? ` · 잔액을 은행과 맞춤(${won(syncOf.get(i).diff)})` : ""),
    })));
    // 판단이 끝난 것만 남기고 표시해 둔다 — 넣은 것과 짝이 맞아 치운 것은 목록에서 빠진다
    setInbox(inbox.filter((i) => !gone.has(i) && (i.checked || keep.has(i))).map((i) => (i.checked ? i : { ...i, checked: true })));
    const msgs = [];
    // 통장 입출금을 '결제'라고 부르면 안 된다 — 여유에 들어가는 것과 잔액만 바뀌는 것은 다르다
    const moves = registered.filter((x) => x.type === "in" || x.type === "out").length;
    const pays = registered.length - moves;
    if (pays) msgs.push(`결제 ${pays}건 자동으로 기록했어요`);
    if (moves) msgs.push(`통장 입출금 ${moves}건 자동으로 기록했어요`);
    if (undone.length) msgs.push(`취소된 결제 ${undone.length}건을 기록에서 뺐어요`);
    if (dropped.length) msgs.push(`결제 후 취소된 ${Math.round(dropped.length / 2)}건은 넣지 않았어요`);
    if (skipped.length) msgs.push(`이미 적힌 거래 ${skipped.length}건은 넘겼어요`);
    for (const s of settled.filter((x, i, a) => a.findIndex((y) => y.card === x.card) === i)) {
      const last = settled.filter((y) => y.card === s.card).slice(-1)[0];
      msgs.push(`${s.card} 카드값 ${last.partial ? "일부 " : ""}결제를 확인했어요 · 남은 카드값 ${last.after.toLocaleString("ko-KR")}원${last.fixedNote ? ` · ${last.fixedNote.name} ${last.fixedNote.after.toLocaleString("ko-KR")}원` : ""}`);
    }
    for (const t of transits) {
      msgs.push(t.paid
        ? `${t.month}월 대중교통 ${t.total.toLocaleString("ko-KR")}원을 기록했어요(이미 낸 카드값이라 카드값은 그대로)`
        : `${t.month}월 대중교통 ${t.total.toLocaleString("ko-KR")}원을 ${t.card}에 반영했어요`);
    }
    // 같은 통장을 여러 번 맞췄으면 합쳐서 한 번만 알린다
    const byAcc = new Map();
    for (const s of synced) byAcc.set(s.accountId, { name: s.name, diff: (byAcc.get(s.accountId)?.diff || 0) + s.diff });
    for (const s of byAcc.values()) if (s.diff) msgs.push(`${s.name} 잔액을 은행과 맞췄어요(${won(s.diff)})`);
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
          // 날짜를 잘못 읽어 엉뚱한 달에 들어간 자동 기록을 원래 알림 문구로 바로잡는다(data.js 설명 참고)
          let seenTexts = [];
          try { seenTexts = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { seenTexts = []; }
          const repaired = repairMisdatedAuto(loaded, seenTexts);
          const processed = autoProcessFixed(repaired.data);
          setData(processed);
          if (processed !== loaded) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(processed)); } catch {}
          }
          if (repaired.count) setTimeout(() => showToast(`날짜가 잘못 들어간 자동 기록 ${repaired.count}건을 바로잡았어요`), 600);
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
  /*
    **Claude가 넣어 둔 것 받기**(lib/drop.js 설명). 켤 때·돌아올 때 암호화된 받은편지함을 받아 풀고,
    카드 명세서면 명세서로 맞추기(lib/statement.js)를 그대로 돌린다. 사람이 붙여 넣던 걸 대신한다.
    카드는 보낸 쪽이 적은 이름 조각('롯데')이 든 카드가 딱 하나일 때만 — 못 찾으면 적용하지 않고
    남겨 둔다(카드를 등록하면 다음에 적용된다).
  */
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!loaded) return;
    let busy = false;
    const run = async () => {
      if (busy || !dataRef.current) return;
      busy = true;
      try {
        const msgs = await fetchDrops();
        if (!msgs.length) return;
        let d = dataRef.current;
        const done = [];
        const logs = [];
        const notes = [];
        for (const m of msgs) {
          if (m.kind !== "statement" && m.kind !== "cardbill") { done.push(m.id); continue; }
          const hits = (d.cards || []).filter((c) => String(c.name).includes(m.card));
          if (hits.length !== 1) {
            logs.push({ at: Date.now(), id: m.id, text: `${m.card} — 앱에서 그 카드를 못 찾아 아직 안 넣었어요` });
            continue;
          }
          const card = hits[0];
          /*
            **카드값을 카드 앱 숫자로 그대로 맞추기**(2026-09-17). 명세서 줄을 다 옮기지 않아도 되는 자리다 —
            사용자가 카드 앱의 '결제 예정 금액'을 보여 주면 그 금액으로 맞춘다(일부 결제·리볼빙처럼 우리 계산이
            못 따라가는 경우). 할부 몫은 카드값(bill)에 또 들어가면 두 번 세므로, 할부는 그 달 금액만 고친다.
          */
          if (m.kind === "cardbill") {
            // 결제일만 보낼 수도 있다(금액 없이) — 그땐 카드값을 건드리지 않는다
            const hasBill = m.bill != null && Number.isFinite(Number(m.bill));
            const bill = Math.max(0, Number(m.bill) || 0);
            let fixedNote = "";
            let fixes = d.fixedExpenses || [];
            if (m.install && m.install.name && m.install.month && Number(m.install.amount) > 0) {
              const f = fixes.find((x) => String(x.name).includes(m.install.name) && (x.paymentMethod || "cash") === "card" && x.cardId === card.id);
              if (f) {
                fixes = fixes.map((x) => (x.id === f.id ? reprojectInstallment(x, m.install.month, Number(m.install.amount)) : x));
                fixedNote = ` · ${f.name} ${m.install.month.slice(5)}월 ${Number(m.install.amount).toLocaleString("ko-KR")}원(남은 회차 다시 계산)`;
              }
            }
            /*
              **알림이 안 오는 것은 '그 달 한 줄'로 적는다**(2026-09-17, 사용자와 합의 — 대중교통·하이패스).
              건수는 수십 건인데 알림이 없고 금액이 달마다 다르다. 같은 달 줄이 이미 있으면 새로 만들지 않고
              금액만 갱신한다(달이 끝날 때까지 오른다). 대중교통이 이미 이 방식이다(linkedTransitMonth).
              **카드값은 안 건드린다** — 카드값은 카드 앱 숫자로 맞춘 것이라 여기서 또 더하면 두 번 잡힌다.
            */
            let exps = d.expenses || [];
            const rowNames = [];
            let seq = 0;
            for (const row of m.rows || []) {
              const amount = Number(row.amount);
              if (!row.name || !/^\d{4}-\d{2}$/.test(String(row.month || "")) || !(amount > 0)) continue;
              const key = `${row.name}:${row.month}`;
              const memo = `${Number(row.month.slice(5, 7))}월 ${row.name}`;
              const prevRow = exps.find((e) => e.linkedMonthly === key);
              if (prevRow) {
                exps = exps.map((e) => (e.id === prevRow.id ? { ...e, amount, memo, cardId: card.id, auto: true } : e));
              } else {
                const last = new Date(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0).getDate();
                const cat = (d.categories || []).find((c) => c.name === (row.category || "교통"))?.id || null;
                exps = [...exps, { id: "e" + (Date.now() + seq++), amount, categoryId: cat, date: `${row.month}-${String(last).padStart(2, "0")}`,
                  memo, paymentMethod: "card", cardId: card.id, linkedBalanceId: null, linkedMonthly: key, auto: true }];
              }
              rowNames.push(`${memo} ${amount.toLocaleString("ko-KR")}원`);
            }
            const was = Number(card.bill || 0);
            // syncedAtMs — '카드 앱 숫자와 맞춘 때'. 홈이 "카드 앱과 2시간 전 맞춤"으로 보여 준다(오래되면 경고)
            const payDay = Number(m.payDay) >= 1 && Number(m.payDay) <= 31 ? Number(m.payDay) : undefined;
            d = { ...d, expenses: exps, fixedExpenses: fixes,
              cards: d.cards.map((c) => (c.id === card.id
                ? { ...c, ...(hasBill ? { bill, paidAtMs: Date.now(), syncedAtMs: Date.now() } : {}), ...(payDay ? { payDay } : {}) }
                : c)) };
            const what = hasBill
              ? `카드값을 ${was.toLocaleString("ko-KR")}원 → ${bill.toLocaleString("ko-KR")}원으로 맞췄어요`
              : `결제일을 매달 ${payDay}일로 적었어요`;
            logs.push({ at: Date.now(), id: m.id, text: `${card.name} ${what}${m.memo ? ` (${m.memo})` : ""}${fixedNote}${rowNames.length ? ` · ${rowNames.join(", ")} 기록(카드값은 그대로)` : ""}` });
            notes.push(`${card.name} ${hasBill ? `카드값을 ${bill.toLocaleString("ko-KR")}원으로 맞췄어요` : `결제일 ${payDay}일`}`);
            done.push(m.id);
            continue;
          }
          /*
            **못 읽었으면 '적용함'으로 적지 않는다**(2026-09-16). 옛 화면(할부만 있는 명세서를 못 읽던 판)이
            그 파일을 먼저 받아 넘기면서 적용함으로 적어 버렸고, 새 화면이 된 뒤엔 '이미 넣음'으로 건너뛰어
            롯데 할부가 영영 안 들어갔다. 못 읽은 건 남겨 두고 다음에 다시 해 본다.
          */
          const plan = reconcileStatement(d, card.id, parseStatement(m.text), Date.now(), { prepaid: !!m.prepaid });
          if (!plan) {
            logs.push({ at: Date.now(), id: m.id, text: `${card.name} 명세서를 못 읽었어요 — 다음에 다시 해 봐요` });
            continue;
          }
          d = plan.next;
          const s = plan.summary;
          const inst = s.installFixes.map((f) => `${f.name} ${Number(f.after).toLocaleString("ko-KR")}원`).join(", ");
          logs.push({ at: Date.now(), id: m.id, text: `${card.name} ${s.prepaid ? "미리 낸 " : ""}명세서 ${s.rows}건(${s.statementTotal.toLocaleString("ko-KR")}원) — ${s.added}건 넣고 카드값 ${s.billAfter.toLocaleString("ko-KR")}원으로${inst ? ` · 할부 ${inst}` : ""}${s.prepaid ? " · 이번 달 할부는 낸 것으로" : ""}${s.extra.length ? ` · 명세서에 없는 앱 기록 ${s.extra.length}건(${s.extra.map((e) => `${e.date.slice(5)} ${e.memo || ""} ${Number(e.amount).toLocaleString("ko-KR")}원`).join(", ")})` : ""}` });
          notes.push(`${card.name} 명세서를 맞췄어요(${s.added}건 넣음)`);
          done.push(m.id);
        }
        if (d !== dataRef.current) persist(d);
        markApplied(done, logs);
        if (notes.length) showToast(`Claude가 넣어 둔 ${notes.join(" · ")}`);
      } finally {
        busy = false;
      }
    };
    run();
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("passbook-native-resume", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("passbook-native-resume", run);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
    const installThisMonth = fixedCardInstallment
      .filter((f) => (f.cardId && cards.some((cc) => cc.id === f.cardId) ? f.cardId : cards[0]?.id) === c.id)
      .reduce((s, f) => s + Number(f.info.amount), 0);
    /*
      **'결제하기'로 이미 낸 이번 달 할부 몫은 뺀다**(2026-09-13).

      결제하기는 일시불(bill)과 이번 달 할부 몫을 같이 내는데, bill만 0으로 돌리고 할부 몫은
      매번 새로 계산돼서 **내자마자 그대로 다시 떴다.** 버튼이 살아 있어 또 누르면 할부가
      통장에서 두 번 빠졌고, 여유와 통장 기준 여유도 이미 낸 할부를 한 번 더 뺐다.
      낸 금액을 달별로 적어 두고(installPaid) 그만큼만 뺀다 — 낸 뒤 새 할부가 생기면 그건 남는다.
    */
    const fixedPortion = Math.max(0, installThisMonth - Number(c.installPaid?.[curKey] || 0));
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
  /*
    **월급 기준 — 이 앱을 만든 이유**(2026-09-14).

    사용자는 "다음 달 월급이 들어온다는 전제로" 카드를 쓴다. 카드는 1일~말일에 쓴 게 다음 달에
    청구되고, 월급은 말일~다음 달 3일에 들어와 그 청구와 다음 달 고정지출을 낸다. 그래서
      카드로 더 써도 되는 돈 = 곧 들어올 월급 − 다음 달 통장 고정지출 − 이번 달 카드값
    이번 달 카드값 = 이번 달 일시불(정기결제 카드반영 기록 제외 — 아래 정기결제로 센다)
                   + 이번 달 카드 할부 몫 + 이번 달 카드 정기결제.
    카드 'bill'을 안 쓰는 이유 — bill은 '결제하기'를 누를 때까지 쌓이는 한 칸이라 어느 달에
    쓴 건지 모른다. 결제일(예: 14일)에 누르면 그달 1~13일 쓴 것까지 0이 됐다.
  */
  const nextKey = monthKeyOffset(curKey, 1);
  const monthlyPay = Number(data.monthlyPay || 0);
  const payIn = findPayDeposit(data.balanceEntries, monthlyPay, curKey);
  const nextPay = payIn ? Number(payIn.amount) : monthlyPay;
  const nextFixedCash = data.fixedExpenses
    .filter((f) => (f.paymentMethod || "cash") !== "card")
    .map((f) => fixedInfo(f, nextKey))
    .filter((i) => i.active)
    .reduce((s, i) => s + Number(i.amount), 0);
  // 다음 달 카드 고정지출(할부 몫 + 정기결제). 청구는 그다음 달이지만 다음 달에 어차피 긁히는 돈이라
  // '월급 들어온 뒤 여유'에서는 미리 뺀다(2026-09-14 사용자 지적 — 빠져 있었다)
  const nextFixedCard = data.fixedExpenses
    .filter((f) => (f.paymentMethod || "cash") === "card")
    .map((f) => fixedInfo(f, nextKey))
    .filter((i) => i.active)
    .reduce((s, i) => s + Number(i.amount), 0);
  /*
    할부를 한 달 일찍 내는 카드(earlyPay — 롯데카드)는 이번 달 할부를 이번 달에 이미 통장에서 낸다. 그래서
    '통장 없이 월급만으로'에선 이번 달 몫 대신 **다음 달 몫**을 다음 달 월급이 낸다.
  */
  const earlyCardIds = new Set(cards.filter((c) => c.earlyPay).map((c) => c.id));
  const cardInstallThisMonth = fixedCardInstallment.filter((f) => !earlyCardIds.has(f.cardId)).reduce((s, f) => s + Number(f.info.amount), 0);
  const earlyNextInstall = data.fixedExpenses
    .filter((f) => (f.paymentMethod || "cash") === "card" && f.totalMonths > 0 && earlyCardIds.has(f.cardId))
    .map((f) => fixedInfo(f, nextKey)).filter((i) => i.active).reduce((s, i) => s + Number(i.amount), 0);
  const cardRecurThisMonth = fixedCardRecurring.reduce((s, f) => s + Number(f.info.amount), 0);
  const cardThisMonth = cardSpentThisCycle + cardInstallThisMonth + cardRecurThisMonth;
  const payLeft = nextPay - nextFixedCash - cardThisMonth - earlyNextInstall;
  // 이번 달 몫 월급(지난달 말~이번 달 초)이 아직 안 들어왔으면, 통장 식은 곧 들어올 그 돈을 더해서 본다
  const prevPayIn = findPayDeposit(data.balanceEntries, monthlyPay, prevKey);
  const payPending = monthlyPay > 0 && !prevPayIn && dayIntoCycle <= 5 ? monthlyPay : 0;

  /*
    **홈의 큰 숫자를 여기서 낸다**(2026-09-17). 위젯과 아침 알림도 같은 값을 써야 해서다 —
    화면 안에서 계산하면 네이티브로 넘길 때 한 벌 더 만들게 되고, 두 벌은 언젠가 반드시 갈라진다.
      지금 통장으로 다 내면(bankLeft) = 통장 + 아직 안 들어온 이번 달 월급 − 안 낸 카드값 − 안 나간 고정지출
      카드로 더 써도 되는 돈(canSpend) = bankLeft + 다음 달 월급 − 다음 달 고정지출(통장 + 카드)
  */
  const bankLeft = accountBalance + payPending - cardBillTotal - unpaidFixedSum;
  const canSpend = bankLeft + (payIn ? 0 : nextPay) - nextFixedCash - nextFixedCard;
  const daysLeft = Math.max(1, cycleLen - dayIntoCycle + 1);
  const perDay = Math.floor(Math.max(0, canSpend) / daysLeft);
  const bankKnown = accountBalance !== 0 || accountTotals.some((a) => a.bankSync);
  const hasPay = !!(monthlyPay || payIn);

  const processedSpent = spent - unpaidFixedSum;
  const realRemaining = spendingGoal - processedSpent;
  const realBudgetRatio = hasGoal ? Math.min(processedSpent / spendingGoal, 1.2) : (processedSpent > 0 ? 1.2 : 0);

  const ctx = {
    data, persist, showToast, today, todayStr, curKey, prevKey, cycleLen, dayIntoCycle,
    cycleExpenses, normalSpent, fixedActive, fixedCardActive, fixedCardInstallment, fixedCardRecurring, fixedSum, fixedSumAll, cards, cardTotals, cardBillTotal, totalSpentThisMonth, prevTotalSpent, prevTotalSpentToDate, reimbursedThisCycle,
    nextKey, monthlyPay, payIn, nextPay, nextFixedCash, nextFixedCard, cardSpentThisCycle, cardInstallThisMonth, cardRecurThisMonth, cardThisMonth, payLeft, payPending,
    bankLeft, canSpend, daysLeft, perDay, bankKnown, hasPay,
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
        <NativeSummary s={{ canSpend, perDay, daysLeft, payLeft, bankLeft, hasPay, bankKnown, month: Number(nextKey.slice(5, 7)) }} />
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
