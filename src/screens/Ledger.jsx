// History tab: one unified feed of everything money-related (card/cash expenses,
// 대리결제, 입출금), scoped by time (이번달/전체/기간) and optionally narrowed by
// category (카드/대리결제/입출금). LedgerRow renders the expense rows within that feed.
import { useState, useMemo } from "react";
import { Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, Search } from "lucide-react";
import { useTheme, F, paperCard, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, createdTime, dateStrFor, monthKeyOffset, todayISO } from "../lib/data";
import { MoneyInput, QuickAmountButtons } from "../components/common";
import { settleReceivable } from "./Home";

export function LedgerRow({ e, cat, methodLabel, methodColor, dateNode, onEdit, onDelete }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.ink, fontSize: 16, fontWeight: 600 }}>
          {cat ? cat.name : "미분류"}
          <span style={{ fontSize: 13, marginLeft: 6, fontWeight: 700, color: methodColor }}>{methodLabel}</span>
        </div>
        {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo}</div>}
        {dateNode}
      </div>
      {!dateNode && <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 14, fontFamily: F.mono }}>{e.date.slice(5)}</div>}
      <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 16, minWidth: 74, textAlign: "right" }}>{fmtWon(e.amount)}</div>
      {onEdit && <button onClick={onEdit} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, padding: 4 }}><Pencil size={14} /></button>}
      {onDelete && <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>}
    </div>
  );
}

// 대리결제 한 줄 — 정산 상태(미정산/정산완료/부족분·초과분)를 태그로 붙여서,
// 카드/현금 어느 쪽으로 결제했든 결과가 어떻게 됐는지 한눈에 보이게 함. 미정산이면
// 여기서 바로 정산까지 할 수 있음 — 홈 화면까지 갈 필요 없이.
function ReceivableRow({ ctx, e, cat, onDelete }) {
  const T = useTheme();
  const [settling, setSettling] = useState(false);
  const [repaidInput, setRepaidInput] = useState("");
  const diff = e.settled ? Number(e.repaidAmount) - Number(e.amount) : null;
  const methodLabel = (e.paymentMethod || "cash") === "card" ? "카드" : "현금";
  const openSettle = () => { setSettling(true); setRepaidInput(String(e.amount)); };
  const confirmSettle = () => { settleReceivable(ctx, e, repaidInput); setSettling(false); setRepaidInput(""); };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.ink, fontSize: 16, fontWeight: 600 }}>
            {cat ? cat.name : "대리결제"}
            <span style={{ fontSize: 13, marginLeft: 6, fontWeight: 700, color: T.muted }}>대리결제 · {methodLabel}</span>
          </div>
          {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.memo}</div>}
          <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{e.date}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 16 }}>{fmtWon(e.amount)}</span>
          {!e.settled && <span style={{ color: T.warn, fontSize: 11, fontWeight: 700 }}>미정산</span>}
          {e.settled && diff === 0 && <span style={{ color: T.good, fontSize: 11, fontWeight: 700 }}>정산완료</span>}
          {e.settled && diff < 0 && <span style={{ color: T.danger, fontSize: 11, fontWeight: 700 }}>부족분 {fmtWon(-diff)} 카드값</span>}
          {e.settled && diff > 0 && <span style={{ color: T.good, fontSize: 11, fontWeight: 700 }}>초과분 {fmtWon(diff)} 통장</span>}
        </div>
        {!e.settled && !settling && (
          <button onClick={openSettle} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, padding: 4 }}><Pencil size={14} /></button>
        )}
        <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
      </div>
      {settling && (
        <div style={{ marginBottom: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
          <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 5 }}>실제 상환받은 금액 (부족분→카드값, 초과분→통장)</div>
          <MoneyInput value={repaidInput} onChange={setRepaidInput} autoFocus />
          <QuickAmountButtons amount={repaidInput} setAmount={setRepaidInput} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setSettling(false)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 14.5, cursor: "pointer" }}>취소</button>
            <button onClick={confirmSettle} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>정산 확정</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceRow({ b, onDelete }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      {b.type === "in" ? <ArrowDownCircle size={15} color={T.good} /> : <ArrowUpCircle size={15} color={T.danger} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.ink, fontSize: 16, fontWeight: 600 }}>{b.type === "in" ? "입금" : "출금"}{b.memo ? ` · ${b.memo}` : ""}</div>
      </div>
      <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 14, fontFamily: F.mono }}>{b.date.slice(5)}</div>
      <div style={{ color: b.type === "in" ? T.good : T.danger, fontFamily: F.mono, fontWeight: 700, fontSize: 16 }}>
        {b.type === "in" ? "+" : "-"}{fmtWon(b.amount)}
      </div>
      <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
    </div>
  );
}

export function LedgerView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [timeScope, setTimeScope] = useState("cycle"); // cycle | all | range
  const [category, setCategory] = useState("all"); // all | card | receivable | balance
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [amountSort, setAmountSort] = useState("date"); // date | amountDesc | amountAsc
  const [rangeStart, setRangeStart] = useState(dateStrFor(monthKeyOffset(curKey, -2), 1));
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (e) => {
    if (!searchLower) return true;
    const catName = (catMap[e.categoryId]?.name || "").toLowerCase();
    return (e.memo || "").toLowerCase().includes(searchLower) || catName.includes(searchLower);
  };
  const dateInScope = (d) => {
    if (timeScope === "cycle") return d.slice(0, 7) === curKey;
    if (timeScope === "range") return d >= rangeStart && d <= rangeEnd;
    return true; // "all"
  };

  // 세 종류(카드·현금 지출/대리결제/입출금)를 시간 범위로 먼저 거르고,
  const scopedExpenses = useMemo(() => data.expenses.filter((e) => !e.isReceivable && dateInScope(e.date)).filter(matchesSearch),
    [data.expenses, timeScope, curKey, rangeStart, rangeEnd, searchLower]);
  const scopedReceivables = useMemo(() => data.expenses.filter((e) => e.isReceivable && dateInScope(e.date)).filter(matchesSearch),
    [data.expenses, timeScope, curKey, rangeStart, rangeEnd, searchLower]);
  const scopedBalance = useMemo(() => (data.balanceEntries || []).filter((b) => dateInScope(b.date)).filter((b) => !searchLower || (b.memo || "").toLowerCase().includes(searchLower)),
    [data.balanceEntries, timeScope, curKey, rangeStart, rangeEnd, searchLower]);

  // ...그다음 카테고리로 좁힘. "전체 흐름"이면 셋 다, 아니면 해당하는 것만.
  let categoryExpenses = [], categoryReceivables = [], categoryBalance = [];
  if (category === "all") {
    categoryExpenses = scopedExpenses; categoryReceivables = scopedReceivables; categoryBalance = scopedBalance;
  } else if (category === "card") {
    categoryExpenses = scopedExpenses.filter((e) => (e.paymentMethod || "cash") === "card");
    categoryReceivables = scopedReceivables.filter((e) => (e.paymentMethod || "cash") === "card");
  } else if (category === "receivable") {
    categoryReceivables = scopedReceivables;
  } else if (category === "balance") {
    categoryBalance = scopedBalance;
  }

  const combined = useMemo(() => {
    const items = [
      ...categoryExpenses.map((e) => ({ kind: "expense", item: e, sortTime: createdTime(e), sortAmt: Number(e.amount) })),
      ...categoryReceivables.map((e) => ({ kind: "receivable", item: e, sortTime: createdTime(e), sortAmt: Number(e.amount) })),
      ...categoryBalance.map((b) => ({ kind: "balance", item: b, sortTime: createdTime(b), sortAmt: Number(b.amount) })),
    ];
    if (amountSort === "amountDesc") items.sort((a, b) => b.sortAmt - a.sortAmt);
    else if (amountSort === "amountAsc") items.sort((a, b) => a.sortAmt - b.sortAmt);
    else items.sort((a, b) => b.sortTime - a.sortTime);
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryExpenses, categoryReceivables, categoryBalance, amountSort]);

  const totalSpent = categoryExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const receivableTotal = categoryReceivables.reduce((s, e) => s + Number(e.amount), 0);
  // 카드값 실제 구성 = 카드로 기록된 지출 전액 + 대리결제 정산에서 모자라게 받아 카드값에
  // 얹힌 부분만(초과분·정산 전·정확히 받은 건은 카드값에 안 잡히므로 제외).
  const cardSettledShortfall = categoryReceivables.reduce((s, e) => {
    if (!e.settled) return s;
    const diff = Number(e.repaidAmount) - Number(e.amount);
    return s + (diff < 0 ? -diff : 0);
  }, 0);
  const cardListTotal = categoryExpenses.reduce((s, e) => s + Number(e.amount), 0) + cardSettledShortfall;
  const balanceInTotal = categoryBalance.filter((b) => b.type === "in").reduce((s, b) => s + Number(b.amount), 0);
  const balanceOutTotal = categoryBalance.filter((b) => b.type === "out").reduce((s, b) => s + Number(b.amount), 0);

  // Returns whether the delete actually happened, so callers (like the edit-form's
  // 삭제 button) know whether to also close the form or leave it open on cancel.
  const remove = (id) => {
    const exp = data.expenses.find((e) => e.id === id);
    if (!exp) return false;
    if (!window.confirm("이 기록을 삭제할까요? 연결된 카드값/통장 반영분도 함께 되돌아가요.")) return false;
    let next = { ...data, expenses: data.expenses.filter((e) => e.id !== id) };
    if (!exp.isReceivable) {
      if ((exp.paymentMethod || "cash") === "card") {
        const cid = exp.cardId || data.cards[0]?.id;
        next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.amount)) } : c));
        // "정기결제 카드반영" 항목을 홈의 완료취소 대신 여기서 바로 지우면, 원래 고정지출의
        // paidMonths가 이미 없어진 이 항목을 계속 가리키게 됨 — 그 연결을 같이 끊어줌.
        if (exp.isCardAdjustment) {
          next.fixedExpenses = data.fixedExpenses.map((x) => {
            if (!(x.paidMonths && x.paidMonths[curKey] === id)) return x;
            const pm = { ...x.paidMonths };
            delete pm[curKey];
            return { ...x, paidMonths: pm };
          });
        }
      } else if (exp.linkedBalanceId) {
        next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
      }
    } else if (exp.settled) {
      if (exp.settlementCardDelta && exp.settlementCardId) {
        next.cards = data.cards.map((c) => (c.id === exp.settlementCardId ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.settlementCardDelta)) } : c));
      } else if (exp.settlementBalanceId) {
        next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.settlementBalanceId);
      }
    }
    persist(next);
    showToast("삭제했어요");
    return true;
  };
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editCardId, setEditCardId] = useState("");
  const [editAccountId, setEditAccountId] = useState("");

  const startEdit = (e) => {
    setEditingId(e.id);
    setEditAmount(String(e.amount));
    setEditCategoryId(e.categoryId);
    setEditDate(e.date);
    setEditMemo(e.memo || "");
    setEditPaymentMethod(e.paymentMethod || "cash");
    setEditCardId(e.cardId || data.cards[0]?.id || "");
    const linked = e.linkedBalanceId ? (data.balanceEntries || []).find((b) => b.id === e.linkedBalanceId) : null;
    setEditAccountId(linked?.accountId || data.accounts[0]?.id || "");
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = (exp) => {
    const n = Number(editAmount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!editCategoryId) return showToast("카테고리를 선택해주세요");
    if (editPaymentMethod === "card" && !editCardId) return showToast("카드를 선택해주세요");
    if (editPaymentMethod === "cash" && !editAccountId) return showToast("통장을 선택해주세요");

    let next = { ...data };
    if ((exp.paymentMethod || "cash") === "card") {
      const oldCid = exp.cardId || data.cards[0]?.id;
      next.cards = data.cards.map((c) => (c.id === oldCid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.amount)) } : c));
    } else if (exp.linkedBalanceId) {
      next.balanceEntries = (data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
    }

    const catName = data.categories.find((c) => c.id === editCategoryId)?.name || "지출";
    let newLinkedBalanceId = null;
    if (editPaymentMethod === "card") {
      next.cards = (next.cards || data.cards).map((c) => (c.id === editCardId ? { ...c, bill: Number(c.bill || 0) + n } : c));
    } else {
      newLinkedBalanceId = "b" + Date.now();
      next.balanceEntries = [...(next.balanceEntries || data.balanceEntries || []), { id: newLinkedBalanceId, type: "out", amount: n, date: editDate, memo: `${catName}${editMemo.trim() ? " · " + editMemo.trim() : ""}`, accountId: editAccountId }];
    }

    next.expenses = data.expenses.map((e) =>
      e.id === exp.id
        ? { ...e, amount: n, categoryId: editCategoryId, date: editDate, memo: editMemo.trim(), paymentMethod: editPaymentMethod, cardId: editPaymentMethod === "card" ? editCardId : null, linkedBalanceId: editPaymentMethod === "cash" ? newLinkedBalanceId : null }
        : e
    );
    persist(next);
    setEditingId(null);
    showToast("수정했어요 · 카드값/통장에 바로 반영됐어요");
  };

  const removeBalance = (id) => {
    const b = data.balanceEntries.find((x) => x.id === id);
    if (!b) return;
    if (b.transferId) {
      if (!window.confirm("이체 기록을 삭제할까요? 양쪽 통장 기록이 함께 삭제돼요.")) return;
      persist({ ...data, balanceEntries: data.balanceEntries.filter((x) => x.transferId !== b.transferId) });
      showToast("이체 기록을 삭제했어요");
      return;
    }
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    persist({ ...data, balanceEntries: data.balanceEntries.filter((x) => x.id !== id) });
    showToast("삭제했어요");
  };

  const renderEditForm = (e) => (
    <div style={{ marginTop: 8, marginBottom: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 10, padding: 10 }}>
      <div style={{ marginBottom: 8 }}>
        <MoneyInput value={editAmount} onChange={setEditAmount} />
        <QuickAmountButtons amount={editAmount} setAmount={setEditAmount} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {data.categories.map((c) => (
          <button key={c.id} onClick={() => setEditCategoryId(c.id)}
            style={{ padding: "6px 10px", borderRadius: 16, border: editCategoryId === c.id ? `2px solid ${c.color}` : `1px solid ${T.border}`,
              background: editCategoryId === c.id ? c.color + "22" : "transparent", color: T.ink, fontSize: 13.5, cursor: "pointer" }}>
            {c.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={() => setEditPaymentMethod("card")} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: editPaymentMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: editPaymentMethod === "card" ? T.gold + "22" : "transparent", color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>카드</button>
        <button onClick={() => setEditPaymentMethod("cash")} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: editPaymentMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: editPaymentMethod === "cash" ? T.good + "22" : "transparent", color: T.ink, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>현금(통장)</button>
      </div>
      {editPaymentMethod === "card" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {data.cards.map((c) => (
            <button key={c.id} onClick={() => setEditCardId(c.id)} style={{ padding: "5px 9px", borderRadius: 14, border: editCardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: editCardId === c.id ? T.gold + "22" : "transparent", color: T.ink, fontSize: 13, cursor: "pointer" }}>{c.name}</button>
          ))}
        </div>
      ) : (
        data.accounts.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {data.accounts.map((a) => (
              <button key={a.id} onClick={() => setEditAccountId(a.id)} style={{ padding: "5px 9px", borderRadius: 14, border: editAccountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: editAccountId === a.id ? T.good + "22" : "transparent", color: T.ink, fontSize: 13, cursor: "pointer" }}>{a.name}</button>
            ))}
          </div>
        )
      )}
      <input type="date" value={editDate} onChange={(ev) => setEditDate(ev.target.value)} style={{ ...inputSty(T), background: "#fff", color: T.ink, border: `1px solid ${T.paperLine}`, marginBottom: 8 }} />
      <input value={editMemo} onChange={(ev) => setEditMemo(ev.target.value)} placeholder="표기내역" style={{ ...inputSty(T), background: "#fff", color: T.ink, border: `1px solid ${T.paperLine}`, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={cancelEdit} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.ink, fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => { if (remove(e.id)) setEditingId(null); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger, fontSize: 14, cursor: "pointer" }}>삭제</button>
        <button onClick={() => saveEdit(e)} style={{ flex: 2, ...primaryBtn(T), padding: "9px 0" }}>저장</button>
      </div>
    </div>
  );

  let totalsLine = null;
  if (category === "card") totalsLine = <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>카드값에 반영된 지출 합계 {fmtWon(cardListTotal)} · {categoryExpenses.length}건</div>;
  else if (category === "receivable") totalsLine = <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>합계 {fmtWon(receivableTotal)} · {categoryReceivables.length}건</div>;
  else if (category === "balance") totalsLine = (
    <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>
      <span style={{ color: T.good }}>입금 합계 {fmtWon(balanceInTotal)}</span> · <span style={{ color: T.danger }}>출금 합계 {fmtWon(balanceOutTotal)}</span>
    </div>
  );
  else totalsLine = <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>총 지출 {fmtWon(totalSpent)} · {combined.length}건</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700 }}>전체 내역</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", background: T.bg2, borderRadius: 8, padding: 3 }}>
            {[["cycle", "이번달"], ["all", "전체"], ["range", "기간"]].map(([k, l]) => (
              <button key={k} onClick={() => setTimeScope(k)}
                style={{ border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 14, fontWeight: 600,
                  background: timeScope === k ? T.gold : "transparent", color: timeScope === k ? "#23190C" : T.muted, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{ border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              background: category === "all" ? T.bg2 : T.gold, color: category === "all" ? T.muted : "#23190C" }}>
            <option value="all">전체 흐름</option>
            <option value="card">카드</option>
            <option value="receivable">대리결제</option>
            <option value="balance">입출금</option>
          </select>
          <button onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(""); }}
            style={{ border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", background: searchOpen ? T.gold : T.bg2, color: searchOpen ? "#23190C" : T.muted, display: "flex" }}>
            <Search size={16} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="메모나 카테고리로 검색" autoFocus
          style={{ ...inputSty(T), marginBottom: 14, fontSize: 16 }} />
      )}

      {timeScope === "range" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={{ ...inputSty(T), fontSize: 14, padding: "8px 10px" }} />
          <span style={{ color: T.muted, fontSize: 13.5 }}>~</span>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={{ ...inputSty(T), fontSize: 14, padding: "8px 10px" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["date", "최신순"], ["amountDesc", "높은금액순"], ["amountAsc", "낮은금액순"]].map(([k, l]) => (
          <button key={k} onClick={() => setAmountSort(k)}
            style={{ border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: amountSort === k ? T.gold : T.bg2, color: amountSort === k ? "#23190C" : T.muted }}>
            {l}
          </button>
        ))}
      </div>

      {category === "card" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {ctx.cardTotals.map((c) => (
              <div key={c.id} style={{ ...paperCard(T), display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                <div>
                  <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontSize: 18.5, fontWeight: 700 }}>{fmtWon(c.total)}</div>
                  {c.fixedPortion > 0 && <div style={{ color: T.goldSoft, fontSize: 13 }}>할부 {fmtWon(c.fixedPortion)} 포함</div>}
                </div>
              </div>
            ))}
          </div>
          {ctx.fixedCardActive.length > 0 && (
            <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ color: T.muted, fontSize: 14, marginBottom: 6 }}>카드별 정기결제(할부)</div>
              {ctx.fixedCardActive.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: T.cream, padding: "2px 0" }}>
                  <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""} · {data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드"}</span>
                  <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(f.info.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {combined.length === 0 ? (
        <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>기록이 없어요.</div>
      ) : (
        <div style={paperCard(T)}>
          {totalsLine}
          {combined.map(({ kind, item }) => {
            if (kind === "balance") return <BalanceRow key={item.id} b={item} onDelete={() => removeBalance(item.id)} />;
            if (kind === "receivable") return <ReceivableRow key={item.id} ctx={ctx} e={item} cat={catMap[item.categoryId]} onDelete={() => remove(item.id)} />;
            return (
              <div key={item.id}>
                <LedgerRow e={item} cat={catMap[item.categoryId]}
                  methodLabel={(item.paymentMethod || "cash") === "card" ? (data.cards.find((c) => c.id === (item.cardId || data.cards[0]?.id))?.name || "카드") : "현금"}
                  methodColor={(item.paymentMethod || "cash") === "card" ? T.gold : T.good}
                  dateNode={<div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{item.date}</div>}
                  onEdit={() => startEdit(item)} />
                {editingId === item.id && renderEditForm(item)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
