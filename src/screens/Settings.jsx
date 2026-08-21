// Settings tab: theme, monthly goal, accounts/cards, categories, backup/restore.
import { useState } from "react";
import { X } from "lucide-react";
import { useTheme, F, THEMES, THEME_ORDER, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, migrate, todayISO } from "../lib/data";
import { Field, SectionLabel, MoneyInput, QuickAmountButtons } from "../components/common";

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
  const addCard = () => {
    if (!newCardName.trim()) return showToast("카드 이름을 입력하세요");
    const card = { id: "card" + Date.now(), name: newCardName.trim(), bill: 0 };
    persist({ ...data, cards: [...(data.cards || []), card] });
    setNewCardName("");
    showToast("카드를 등록했어요");
  };
  const removeCard = (id) => {
    if (data.cards.length <= 1) return showToast("카드가 최소 1개는 있어야 해요");
    persist({ ...data, cards: data.cards.filter((c) => c.id !== id) });
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
            <div key={c.id} style={{ borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px" }}>
                <span style={{ flex: 1, color: T.cream, fontSize: 16 }}>{c.name}</span>
                <span style={{ color: T.muted, fontFamily: F.mono, fontSize: 14 }}>{fmtWon(c.bill || 0)}</span>
                <button onClick={() => { setAdjustCardId(adjustCardId === c.id ? null : c.id); setCardAddInput(""); }}
                  style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: T.muted, fontSize: 12.5 }}>조정</button>
                <button onClick={() => removeCard(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
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
              <button onClick={() => removeCategory(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger }}><X size={15} /></button>
            </div>
          ))}
          {data.categories.length === 0 && <div style={{ color: T.muted, fontSize: 15, textAlign: "center", padding: "10px 0" }}>카테고리가 없어요. &lsquo;기록&rsquo; 탭에서 추가할 수 있어요.</div>}
        </div>
      </Field>

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
      </Field>
    </div>
  );
}
