// Settings tab: theme, monthly goal, accounts/cards, categories, backup/restore.
import { useState } from "react";
import { X } from "lucide-react";
import { useTheme, F, THEMES, THEME_ORDER, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, migrate, todayISO } from "../lib/data";
import { inNativeApp, listBackups, readBackup, hasNotificationAccess, pendingCount, openNotificationSettings, diagnostics, openBatterySettings } from "../lib/native";
import { ALERT_LOG_KEY } from "../lib/constants";
import { parsePaymentText } from "../lib/data";
import { Field, SectionLabel, MoneyInput, QuickAmountButtons } from "../components/common";

/** "3분 전", "2시간 전", "어제" — 진단 화면용 */
function ago(ms) {
  if (!ms) return "없음";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

/*
  **최근 결제 알림이 각각 어떻게 됐는지.** 껍데기가 본 기록(1.1부터)과 웹의 처리 기록을
  문구로 이어 붙인다. 결제가 안 들어왔을 때 어디서 끊겼는지 — 껍데기가 결제로 안 봤는지,
  앱으로 아직 안 왔는지, 웹이 받아서 넘겼는지 — 한눈에 갈린다.
*/
function recentAlerts(diag) {
  let web = [];
  try { web = JSON.parse(localStorage.getItem(ALERT_LOG_KEY) || "[]"); } catch { web = []; }
  const lastOutcome = (text) => [...web].reverse().find((w) => w.text === text)?.outcome;
  if (diag?.log?.length) {
    return [...diag.log].reverse().slice(0, 10).map((l) => ({
      text: l.text, at: l.at,
      result: !l.accepted ? "결제로 안 봄(껍데기에서 걸러짐)" : lastOutcome(l.text) || "아직 앱으로 안 가져옴",
      bad: !l.accepted,
    }));
  }
  // 옛 껍데기(진단 없음) — 웹이 받은 것만
  const seen = new Set();
  return [...web].reverse().filter((w) => (seen.has(w.text) ? false : seen.add(w.text))).slice(0, 10)
    .map((w) => ({ text: w.text, at: w.at, result: w.outcome }));
}

/** "가계부-백업-2026-09-09.json" → "2026-09-09". 못 읽으면 파일 이름 그대로. */
function backupDay(name) {
  const m = String(name || "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(name || "");
}
function fmtSize(bytes) {
  const n = Number(bytes || 0);
  return n >= 1024 ? `${Math.round(n / 1024)}KB` : `${n}B`;
}

export function SettingsView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const [newCardName, setNewCardName] = useState("");
  const [adjustCardId, setAdjustCardId] = useState(null);
  const [cardAddInput, setCardAddInput] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [spendingGoalInput, setSpendingGoalInput] = useState(String(data.spendingGoal || ""));
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showBackups, setShowBackups] = useState(false);
  const [backups, setBackups] = useState([]);
  /*
    결제 알림이 어디까지 왔는지 보여주는 값.

    이게 없으면 알림이 안 들어올 때 볼 수 있는 게 아무것도 없다. 권한이 꺼진
    건지, 껍데기가 못 잡은 건지, 잡았는데 앱이 안 가져간 건지 구분이 안 돼서
    어디를 고쳐야 할지도 모른다.
  */
  const [noti, setNoti] = useState(() => ({ access: hasNotificationAccess(), pending: pendingCount(), diag: diagnostics() }));
  const refreshNoti = () => setNoti({ access: hasNotificationAccess(), pending: pendingCount(), diag: diagnostics() });
  const exportJson = JSON.stringify(data, null, 2);
  const doExport = () => {
    setShowExport(true); setShowImport(false);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(exportJson).then(() => showToast("클립보드에 복사했어요")).catch(() => {});
    }
  };
  const doImport = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch {
      return showToast("올바른 JSON 형식이 아니에요");
    }
    // 앱에서 제일 되돌리기 어려운 동작인데(지금 있는 데이터를 통째로 덮어씀) 유일하게
    // 확인창이 없었음 — 카드/통장/카테고리 삭제는 전부 confirm이 있는데 여긴 빠져있었음.
    const expenseCount = Array.isArray(parsed?.expenses) ? parsed.expenses.length : 0;
    if (!window.confirm(`가져온 데이터(지출 기록 ${expenseCount}건 포함)로 지금 데이터를 전부 덮어쓸까요? 되돌릴 수 없어요.`)) return;
    const migrated = migrate(parsed);
    persist(migrated);
    // spendingGoalInput은 마운트 시점 data로 한 번만 초기화되는 값이라, 가져오기로
    // data.spendingGoal이 바뀌어도 이 화면을 벗어났다 오기 전까진 안 갱신됐음.
    setSpendingGoalInput(String(migrated.spendingGoal || ""));
    setImportText(""); setShowImport(false);
    showToast("데이터를 불러왔어요");
  };
  /*
    껍데기가 매일 남기는 백업을 앱 안에서 바로 되돌리는 자리.

    이게 없으면 백업 파일이 있어도 파일 관리자로 찾아 열어서 본문을 복사해
    '가져오기'에 붙여넣어야 했다. 정작 복구가 필요한 순간(기기를 바꿨거나 앱을
    지웠다 깐 직후)에 그 과정을 해내기 어렵다 — 백업은 되돌릴 수 있어야 백업이다.

    **덮어쓰기는 되돌릴 수 없어서** 가져오기와 똑같이 확인창을 한 번 거친다.
  */
  const openBackups = () => {
    const next = !showBackups;
    setShowBackups(next);
    setShowExport(false); setShowImport(false);
    if (next) {
      const list = listBackups();
      setBackups(list);
      if (list.length === 0) showToast("저장된 백업이 없어요");
    }
  };
  const restoreBackup = (name) => {
    const parsed = readBackup(name);
    if (!parsed) return showToast("백업 파일을 읽지 못했어요");
    const expenseCount = Array.isArray(parsed?.expenses) ? parsed.expenses.length : 0;
    const day = backupDay(name);
    if (!window.confirm(`${day} 백업(지출 기록 ${expenseCount}건 포함)으로 지금 데이터를 전부 덮어쓸까요? 되돌릴 수 없어요.`)) return;
    const migrated = migrate(parsed);
    persist(migrated);
    // doImport와 같은 이유 — 입력창은 마운트 때 값에 멈춰 있어서 직접 맞춰줘야 함
    setSpendingGoalInput(String(migrated.spendingGoal || ""));
    setShowBackups(false);
    showToast(`${day} 백업으로 되돌렸어요`);
  };

  const addCard = () => {
    if (!newCardName.trim()) return showToast("카드 이름을 입력하세요");
    const card = { id: "card" + Date.now(), name: newCardName.trim(), bill: 0 };
    persist({ ...data, cards: [...(data.cards || []), card] });
    setNewCardName("");
    showToast("카드를 등록했어요");
  };
  const removeCard = (id) => {
    if (data.cards.length <= 1) return showToast("카드가 최소 1개는 있어야 해요");
    const card = data.cards.find((c) => c.id === id);
    const bill = Number(card?.bill || 0);
    const linkedFixedCount = (data.fixedExpenses || []).filter((f) => (f.paymentMethod || "cash") === "card" && f.cardId === id).length;
    const notes = [];
    if (bill > 0) notes.push(`아직 남은 카드값 ${fmtWon(bill)}은 그대로 사라져요`);
    if (linkedFixedCount > 0) notes.push(`이 카드로 연결된 고정지출 ${linkedFixedCount}건은 남은 카드로 옮겨져요`);
    const msg = notes.length ? `"${card?.name}" 카드를 삭제할까요? ${notes.join(", ")}.` : `"${card?.name}" 카드를 삭제할까요?`;
    if (!window.confirm(msg)) return;
    const remainingCards = data.cards.filter((c) => c.id !== id);
    const fallbackCardId = remainingCards[0]?.id;
    persist({
      ...data,
      cards: remainingCards,
      // f.cardId가 삭제된 카드를 계속 가리키면, 할부/카드반복 고정지출의 이번달 몫이
      // 어느 카드의 fixedPortion에도 안 잡혀서(App.jsx cardTotals 집계는 카드ID로
      // 매칭) 예산 계산에서 그 금액이 통째로 조용히 빠지게 됨 — 남은 첫 카드로 옮겨서
      // 계속 정상 집계되게 함.
      fixedExpenses: (data.fixedExpenses || []).map((f) => (
        (f.paymentMethod || "cash") === "card" && f.cardId === id ? { ...f, cardId: fallbackCardId } : f
      )),
    });
  };
  const addCardBill = (cardId) => {
    const n = Number(cardAddInput);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    // 그냥 bill만 늘리면 이 추가분이 내역 어디에도 안 남아서 나중에 "왜 카드값이
    // 이렇게 됐지" 싶을 때 확인할 방법이 없었음. 카드 지출 하나로 남겨서 내역·이번
    // 달 총 지출에도 정상적으로 잡히게 함(기록 탭에서 카드로 등록한 것과 동일하게).
    const card = data.cards.find((c) => c.id === cardId);
    const expense = { id: "e" + Date.now(), amount: n, categoryId: null, date: todayISO(), memo: "카드값 수동 추가", isReceivable: false, settled: false, repaidAmount: null, paymentMethod: "card", cardId, linkedBalanceId: null };
    persist({ ...data, expenses: [...data.expenses, expense], cards: data.cards.map((c) => (c.id === cardId ? { ...c, bill: Number(c.bill || 0) + n } : c)) });
    setCardAddInput("");
    showToast(`${card?.name || "카드"}값에 더했어요 · 내역에서 확인할 수 있어요`);
  };
  const resetCardBill = (cardId) => {
    const card = data.cards.find((c) => c.id === cardId);
    if (!window.confirm(`"${card?.name}" 카드값 ${fmtWon(card?.bill || 0)}을 0원으로 초기화할까요? 결제 처리한 걸로 간주하는 거라 되돌릴 수 없어요.`)) return;
    persist({ ...data, cards: data.cards.map((c) => (c.id === cardId ? { ...c, bill: 0 } : c)) });
    setAdjustCardId(null);
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
    const acc = data.accounts.find((a) => a.id === id);
    const linkedFixedCount = (data.fixedExpenses || []).filter((f) => (f.paymentMethod || "cash") === "cash" && f.accountId === id).length;
    const note = linkedFixedCount > 0 ? ` 이 통장으로 연결된 고정지출 ${linkedFixedCount}건은 남은 통장으로 옮겨져요.` : "";
    if (!window.confirm(`"${acc?.name}" 통장을 삭제할까요? 이 통장의 입출금 기록도 같이 사라져요.${note}`)) return;
    const linkedBalanceIds = new Set((data.balanceEntries || []).filter((b) => b.accountId === id).map((b) => b.id));
    const remainingAccounts = data.accounts.filter((a) => a.id !== id);
    const fallbackAccountId = remainingAccounts[0]?.id;
    persist({
      ...data,
      accounts: remainingAccounts,
      balanceEntries: (data.balanceEntries || []).filter((b) => b.accountId !== id),
      // 이 통장으로 낸 현금 지출이 가리키던 balanceEntry가 방금 같이 지워졌으니,
      // 그 연결도 끊어줌 — 안 그러면 존재하지 않는 balanceEntry를 계속 참조하게 됨.
      expenses: data.expenses.map((e) => (e.linkedBalanceId && linkedBalanceIds.has(e.linkedBalanceId) ? { ...e, linkedBalanceId: null } : e)),
      // 카드 삭제 때와 같은 이유 — 삭제되는 통장을 계속 가리키는 통장형 고정지출이 있으면
      // 자동이체 대상 통장 표시가 빈 이름으로 보이거나, autoProcessFixed/출금처리가 매번
      // 남은 첫 통장으로 조용히 대체되는 게 반복되는 대신 여기서 한 번에 정리해줌.
      fixedExpenses: (data.fixedExpenses || []).map((f) => (
        (f.paymentMethod || "cash") === "cash" && f.accountId === id ? { ...f, accountId: fallbackAccountId } : f
      )),
    });
  };
  const saveSpendingGoal = () => { const n = Number(spendingGoalInput); if (Number.isNaN(n) || n < 0) return showToast("올바른 금액을 입력해주세요"); persist({ ...data, spendingGoal: n }); showToast("목표 지출액을 저장했어요"); };
  const setTheme = (mode) => persist({ ...data, theme: mode });
  const removeCategory = (id) => {
    const cat = data.categories.find((c) => c.id === id);
    const usageCount = data.expenses.filter((e) => e.categoryId === id).length;
    const msg = usageCount > 0
      ? `"${cat?.name}" 카테고리를 삭제할까요? 이 카테고리로 기록된 지출 ${usageCount}건은 "미분류"로 남아요.`
      : `"${cat?.name}" 카테고리를 삭제할까요?`;
    if (!window.confirm(msg)) return;
    persist({ ...data, categories: data.categories.filter((c) => c.id !== id) });
  };

  return (
    <div>
      <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700, marginBottom: 16 }}>설정</div>

      <SectionLabel>화면</SectionLabel>
      <Field label="화면 테마">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: 16, columnGap: 4 }}>
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
                <span style={{ color: active ? T.gold : T.muted, fontSize: 12, fontWeight: active ? 700 : 500 }}>{th.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ color: T.muted, fontSize: 13.5, marginTop: 10 }}>현재 테마: {THEMES[data.theme]?.label || "검정"}</div>
      </Field>

      <SectionLabel>예산</SectionLabel>
      <Field label="이번 달 목표 지출액">
        <div style={{ display: "flex", gap: 8 }}>
          <MoneyInput value={spendingGoalInput} onChange={setSpendingGoalInput} />
          <button onClick={saveSpendingGoal} style={{ ...primaryBtn(T), width: 72 }}>저장</button>
        </div>
        <QuickAmountButtons amount={spendingGoalInput} setAmount={setSpendingGoalInput} />
        <div style={{ color: T.muted, fontSize: 14, marginTop: 6 }}>홈 화면의 원형 게이지는 이 금액에서 고정지출·카드값·대출 등 총지출을 뺀 값을 보여줘요.</div>
      </Field>

      <SectionLabel>계좌 · 카드</SectionLabel>
      <Field label="통장 관리">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6, marginBottom: 10 }}>
          {(data.accounts || []).map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ flex: 1, color: T.cream, fontSize: 16 }}>{a.name}</span>
              <button onClick={() => removeAccount(a.id)} aria-label={`${a.name} 통장 삭제`} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, width: 40, height: 40, marginInline: -8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, }}><X size={15} aria-hidden="true" /></button>
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
            <div key={c.id} style={{ borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px" }}>
                <span style={{ flex: 1, color: T.cream, fontSize: 16 }}>{c.name}</span>
                <span style={{ color: T.muted, fontFamily: F.mono, fontSize: 14 }}>{fmtWon(c.bill || 0)}</span>
                <button onClick={() => { setAdjustCardId(adjustCardId === c.id ? null : c.id); setCardAddInput(""); }}
                  style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: T.muted, fontSize: 12.5 }}>조정</button>
                <button onClick={() => removeCard(c.id)} aria-label={`${c.name} 카드 삭제`} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, width: 40, height: 40, marginInline: -8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, }}><X size={15} aria-hidden="true" /></button>
              </div>
              {adjustCardId === c.id && (
                <div style={{ padding: "0 8px 10px" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <MoneyInput value={cardAddInput} onChange={setCardAddInput} placeholder="새로 결제한 금액" />
                    <button onClick={() => addCardBill(c.id)} style={{ ...primaryBtn(T), width: 66 }}>추가</button>
                  </div>
                  <button onClick={() => resetCardBill(c.id)} style={{ width: "100%", background: "transparent", border: `1px solid ${T.danger}`, color: T.danger, borderRadius: 8, padding: "6px 0", fontSize: 13.5, cursor: "pointer" }}>
                    카드값 초기화 (결제 처리)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
          <button onClick={addCard} style={{ ...primaryBtn(T), width: 72 }}>추가</button>
        </div>
      </Field>

      <SectionLabel>카테고리</SectionLabel>
      <Field label="카테고리 관리">
        <div style={{ background: T.bg2, borderRadius: 10, padding: 6 }}>
          {data.categories.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
              <span style={{ flex: 1, color: T.cream, fontSize: 16 }}>{c.name}</span>
              <button onClick={() => removeCategory(c.id)} aria-label={`${c.name} 카테고리 삭제`} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, width: 40, height: 40, marginInline: -8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, }}><X size={15} aria-hidden="true" /></button>
            </div>
          ))}
          {data.categories.length === 0 && <div style={{ color: T.muted, fontSize: 15, textAlign: "center", padding: "10px 0" }}>카테고리가 없어요. &lsquo;기록&rsquo; 탭에서 추가할 수 있어요.</div>}
        </div>
      </Field>

      {/*
        껍데기 앱 안에서만 보인다. 크롬에는 알림을 읽을 방법이 없어서,
        여기 스위치가 있어 봐야 눌러도 아무 일이 안 일어난다.
      */}
      {inNativeApp() && (
        <>
          <SectionLabel>결제 알림</SectionLabel>
          {/*
            제목이 예전엔 '카드 결제를 자동으로 기록'이었는데, 이 스위치 하나가 은행
            입출금·결제 취소·할부 등록까지 전부 켜고 끈다. 라벨이 말하는 것보다 하는
            일이 넓었다 — 이 저장소에서 여러 번 나온 '라벨과 실제가 어긋남'이다.
          */}
          <Field label="결제 알림을 자동으로 기록">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                role="switch" aria-checked={!!data.autoRecord} aria-label="결제 알림을 자동으로 기록"
                onClick={() => persist({ ...data, autoRecord: !data.autoRecord })}
                style={{
                  width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
                  background: data.autoRecord ? T.gold : T.border,
                  position: "relative", flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: data.autoRecord ? 25 : 3,
                  width: 24, height: 24, borderRadius: "50%", background: "#fff",
                  transition: "left .15s",
                }} />
              </button>
              <span style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5 }}>
                {data.autoRecord
                  ? "카드·은행 알림이 오면 확인 없이 바로 기록해요. 자동으로 들어간 줄에는 내역에서 '자동' 표시가 붙어요."
                  : "알림을 모아만 두고, 기록 탭에서 확인하고 등록해요."}
              </span>
            </div>
          </Field>
          {data.autoRecord && (
            <div style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.6, marginTop: -4, marginBottom: 10 }}>
              결제를 취소하면 기록에서 빼고, 할부는 할부(고정지출)로 등록해요. 이미 적어 둔 거래와 겹치면
              새로 넣지 않고 그 기록을 은행이 알려 준 날짜·통장으로 바로잡아요. 어느 카드·통장인지 모를 때만 기록 탭 알림함에 남아요.
            </div>
          )}

          <Field label="알림이 잘 들어오고 있나">
            <div style={{ color: T.cream, fontSize: 14.5, lineHeight: 1.9, fontFamily: F.mono }}>
              <div>
                알림 읽기 권한 ·{" "}
                <span style={{ color: noti.access === true ? T.good : noti.access === false ? T.danger : T.muted, fontWeight: 700 }}>
                  {noti.access === true ? "켜짐" : noti.access === false ? "꺼짐" : "알 수 없음"}
                </span>
              </div>
              {noti.diag && (
                <>
                  <div>
                    알림 받는 중 ·{" "}
                    <span style={{ color: noti.diag.connected ? T.good : T.danger, fontWeight: 700 }}>{noti.diag.connected ? "연결됨" : "끊김"}</span>
                  </div>
                  <div>
                    마지막으로 본 알림 · <span style={{ fontWeight: 700 }}>{ago(noti.diag.last?.at)}</span>
                  </div>
                  <div>
                    배터리 최적화 ·{" "}
                    <span style={{ color: noti.diag.batteryOptimized ? T.warn : T.good, fontWeight: 700 }}>{noti.diag.batteryOptimized ? "켜짐(알림을 놓칠 수 있어요)" : "꺼짐"}</span>
                  </div>
                </>
              )}
              <div>
                아직 안 가져온 알림 ·{" "}
                <span style={{ fontWeight: 700 }}>{noti.pending === null ? "알 수 없음" : `${noti.pending}건`}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  window.dispatchEvent(new Event("passbook-native-resume"));
                  setTimeout(refreshNoti, 300);
                  showToast("지금 확인했어요");
                }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 15, cursor: "pointer" }}
              >
                지금 가져오기
              </button>
              {noti.diag?.batteryOptimized && (
                <button
                  onClick={() => { openBatterySettings(); setTimeout(refreshNoti, 1500); }}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: T.gold, color: T.onGold, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                >
                  배터리 최적화 끄기
                </button>
              )}
              {noti.access !== true && (
                <button
                  onClick={openNotificationSettings}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: T.gold, color: T.onGold, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                >
                  권한 설정 열기
                </button>
              )}
            </div>
            <div style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>
              {noti.diag && !noti.diag.connected
                ? "알림 받기가 끊겨 있어요. 앱을 다시 열면 다시 이어요. 계속 끊기면 배터리 최적화를 끄거나, 알림 읽기 권한을 껐다 켜 주세요."
                : "권한이 꺼져 있으면 알림을 아예 못 봐요. 결제했는데 아래 목록에 안 보이면, 알림 읽기 권한을 껐다 다시 켜 주세요."}
            </div>
          </Field>

          {/* 결제가 안 들어왔을 때 어디서 끊겼는지 — 이 목록 한 장이면 갈린다 */}
          <Field label="최근 결제 알림">
            {(() => {
              const rows = recentAlerts(noti.diag);
              if (!rows.length) {
                return <div style={{ color: T.muted, fontSize: 13.5 }}>아직 받은 결제 알림이 없어요.</div>;
              }
              return rows.map((row, i) => {
                const r = parsePaymentText(row.text || "");
                return (
                  <div key={`${row.at}-${i}`} style={{ padding: "7px 0", borderTop: i ? `1px dashed ${T.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: T.cream, fontSize: 14 }}>
                      <span style={{ fontFamily: F.mono, fontWeight: 700 }}>{r.amount ? fmtWon(Number(r.amount)) : "금액 못 읽음"}</span>
                      <span style={{ color: T.muted, fontSize: 12.5 }}>{ago(row.at)}</span>
                    </div>
                    <div style={{ color: T.muted, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.text}</div>
                    <div style={{ color: row.bad ? T.danger : T.good, fontSize: 12.5, fontWeight: 700 }}>{row.result}</div>
                  </div>
                );
              });
            })()}
          </Field>
        </>
      )}

      <SectionLabel>데이터</SectionLabel>
      <Field label="데이터 백업">
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 15.5, cursor: "pointer" }}>내보내기</button>
          <button onClick={() => { setShowImport(!showImport); setShowExport(false); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 15.5, cursor: "pointer" }}>가져오기</button>
        </div>
        {showExport && (
          <div>
            <div style={{ color: T.muted, fontSize: 14, marginBottom: 6 }}>클립보드에 복사됐어요. 안 됐다면 아래 텍스트를 직접 복사해서 보관하세요.</div>
            <textarea readOnly value={exportJson} onFocus={(e) => e.target.select()} style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 13 }} />
          </div>
        )}
        {showImport && (
          <div>
            <div style={{ color: T.muted, fontSize: 14, marginBottom: 6 }}>백업해둔 JSON 텍스트를 붙여넣고 불러오기를 누르세요. 현재 데이터를 덮어써요.</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="여기에 백업 JSON 붙여넣기" style={{ ...inputSty(T), height: 120, fontFamily: F.mono, fontSize: 13, marginBottom: 8 }} />
            <button onClick={doImport} style={primaryBtn(T)}>불러오기</button>
          </div>
        )}

        {/*
          껍데기 앱 안에서만 보인다. 크롬에는 이 파일들에 닿을 방법이 없다.
        */}
        {inNativeApp() && (
          <>
            <button
              onClick={openBackups}
              style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 15.5, cursor: "pointer", marginTop: 8 }}
            >
              휴대폰에 저장된 백업{showBackups ? " 닫기" : ""}
            </button>
            {showBackups && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>
                  앱이 하루에 하나씩 자동으로 남긴 것이고 30일치까지 있어요.
                  누르면 그날 상태로 되돌아가요 — 지금 데이터는 없어져요.
                </div>
                {backups.length === 0 && (
                  <div style={{ color: T.muted, fontSize: 14, textAlign: "center", padding: "10px 0" }}>아직 저장된 백업이 없어요.</div>
                )}
                {backups.map((b) => (
                  <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.paperLine}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.cream, fontSize: 15, fontWeight: 700 }}>{backupDay(b.name)}</div>
                      <div style={{ color: T.muted, fontSize: 12.5, fontFamily: F.mono }}>{fmtSize(b.size)}</div>
                    </div>
                    <button
                      onClick={() => restoreBackup(b.name)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 14, cursor: "pointer", flexShrink: 0 }}
                    >
                      되돌리기
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Field>
    </div>
  );
}
