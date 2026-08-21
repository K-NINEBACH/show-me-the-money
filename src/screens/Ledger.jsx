// History tab: filterable/sortable list of expenses and balance entries,
// with inline edit. LedgerRow is the shared row renderer for two of the filters.
import { useState, useMemo } from "react";
import { Pencil, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useTheme, F, paperCard, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, createdTime, dateStrFor, monthKeyOffset, todayISO } from "../lib/data";
import { MoneyInput, QuickAmountButtons } from "../components/common";

// Shared row renderer for the ledger list — used by the default/전체/기간 view
// and the card-filtered view, which used to each carry their own copy of this markup.
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


export function LedgerView({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  const [filter, setFilter] = useState("cycle");
  const [search, setSearch] = useState("");
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
  const applyAmountSort = (arr) => {
    if (amountSort === "amountDesc") return [...arr].sort((a, b) => Number(b.amount) - Number(a.amount));
    if (amountSort === "amountAsc") return [...arr].sort((a, b) => Number(a.amount) - Number(b.amount));
    return arr;
  };

  const list = useMemo(() => {
    const byCreated = (a, b) => createdTime(b) - createdTime(a);
    let arr;
    if (filter === "receivable") arr = [...data.expenses.filter((e) => e.isReceivable)].sort((a, b) => (a.settled === b.settled ? byCreated(a, b) : a.settled ? 1 : -1));
    else if (filter === "card") arr = [...data.expenses.filter((e) => !e.isReceivable && (e.paymentMethod || "cash") === "card")].sort(byCreated);
    else if (filter === "range") {
      arr = data.expenses.filter((e) => !e.isReceivable && e.date >= rangeStart && e.date <= rangeEnd);
      arr = [...arr].sort(byCreated);
    } else {
      arr = data.expenses.filter((e) => !e.isReceivable);
      if (filter === "cycle") arr = arr.filter((e) => e.date.slice(0, 7) === curKey);
      arr = [...arr].sort(byCreated);
    }
    return arr.filter(matchesSearch);
  }, [data.expenses, filter, curKey, searchLower, rangeStart, rangeEnd]);
  const sortedList = useMemo(() => applyAmountSort(list), [list, amountSort]);

  const balanceList = useMemo(() => {
    const arr = [...(data.balanceEntries || [])].sort((a, b) => createdTime(b) - createdTime(a));
    if (!searchLower) return arr;
    return arr.filter((b) => (b.memo || "").toLowerCase().includes(searchLower));
  }, [data.balanceEntries, searchLower]);
  const sortedBalanceList = useMemo(() => applyAmountSort(balanceList), [balanceList, amountSort]);

  const remove = (id) => {
    const exp = data.expenses.find((e) => e.id === id);
    if (!exp) return;
    if (!window.confirm("이 기록을 삭제할까요? 연결된 카드값/통장 반영분도 함께 되돌아가요.")) return;
    let next = { ...data, expenses: data.expenses.filter((e) => e.id !== id) };
    if (!exp.isReceivable) {
      if ((exp.paymentMethod || "cash") === "card") {
        const cid = exp.cardId || data.cards[0]?.id;
        next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.amount)) } : c));
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
        <button onClick={() => saveEdit(e)} style={{ flex: 2, ...primaryBtn(T), padding: "9px 0" }}>저장</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700 }}>전체 내역</div>
        <div style={{ display: "flex", background: T.bg2, borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
          {[["cycle", "이번달"], ["all", "전체"], ["range", "기간"], ["card", "카드"], ["receivable", "대리결제"], ["balance", "입출금"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 14, fontWeight: 600,
                background: filter === k ? T.gold : "transparent", color: filter === k ? "#23190C" : T.muted, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="메모나 카테고리로 검색"
        style={{ ...inputSty(T), marginBottom: 14, fontSize: 16 }} />

      {filter === "range" && (
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

      {filter === "card" ? (
        <>
          <div style={{ color: T.goldSoft, fontSize: 14, marginBottom: 8 }}>결제하기는 홈 화면에서 할 수 있어요. 여기서는 기록만 확인해요.</div>
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
          {list.length === 0 ? (
            <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>카드로 기록한 지출이 없어요.</div>
          ) : (
            <div style={paperCard(T)}>
              {sortedList.map((e) => (
                <div key={e.id}>
                  <LedgerRow e={e} cat={catMap[e.categoryId]}
                    methodLabel={data.cards.find((c) => c.id === (e.cardId || data.cards[0]?.id))?.name || "카드"} methodColor={T.goldSoft}
                    onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} />
                  {editingId === e.id && renderEditForm(e)}
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
            {sortedBalanceList.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                {b.type === "in" ? <ArrowDownCircle size={15} color={T.good} /> : <ArrowUpCircle size={15} color={T.danger} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.ink, fontSize: 16, fontWeight: 600 }}>{b.type === "in" ? "입금" : "출금"}{b.memo ? ` · ${b.memo}` : ""}</div>
                </div>
                <div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 14, fontFamily: F.mono }}>{b.date.slice(5)}</div>
                <div style={{ color: b.type === "in" ? T.good : T.danger, fontFamily: F.mono, fontWeight: 700, fontSize: 16 }}>
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
            <div style={{ color: T.goldSoft, fontSize: 14, marginBottom: 8 }}>정산은 홈 화면에서 할 수 있어요. 여기서는 기록만 확인해요.</div>
            {sortedList.map((e) => (
              <div key={e.id} style={{ padding: "10px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 16, fontWeight: 600 }}>
                      {e.memo || catMap[e.categoryId]?.name || "대리결제"}
                      <span style={{ color: e.settled ? T.good : T.warn, fontSize: 13, marginLeft: 6, fontWeight: 700 }}>{e.settled ? "정산완료" : "미정산"}</span>
                    </div>
                    <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 14 }}>{e.date}{e.settled ? ` · 상환 ${fmtWon(e.repaidAmount)}` : ""}</div>
                  </div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 16 }}>{fmtWon(e.amount)}</div>
                  <button onClick={() => remove(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, padding: 4 }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : sortedList.length === 0 ? (
        <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "30px 14px" }}>기록이 없어요.</div>
      ) : (
        <div style={paperCard(T)}>
          {sortedList.map((e) => (
            <div key={e.id}>
              <LedgerRow e={e} cat={catMap[e.categoryId]}
                methodLabel={(e.paymentMethod || "cash") === "card" ? "카드" : "현금"} methodColor={(e.paymentMethod || "cash") === "card" ? T.gold : T.good}
                dateNode={<div style={{ color: T.mode === "dark" ? "#5A5138" : "#9A8E6E", fontSize: 12.5, fontFamily: F.mono }}>{e.date}</div>}
                onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} />
              {editingId === e.id && renderEditForm(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

