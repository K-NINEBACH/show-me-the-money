// Record tab: log an expense (card/cash/installment), or manage a fixed
// expense (subscriptions, installments) via InstallmentForm.
import { useState } from "react";
import { CreditCard, Wallet, Repeat, ClipboardPaste, Check, Pencil, X } from "lucide-react";
import { useTheme, F, inputSty, primaryBtn } from "../lib/theme";
import { PALETTE } from "../lib/constants";
import { fmtWon, todayISO, parsePaymentText, sortFixedList, fixedInfo } from "../lib/data";
import { Field, MoneyInput, QuickAmountButtons, FixedSortTabs } from "../components/common";

export function AddView({ ctx }) {
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
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const applyParse = () => {
    if (!pasteText.trim()) return showToast("문자 내용을 붙여넣어주세요");
    const r = parsePaymentText(pasteText);
    if (!r.amount) { showToast("금액을 못 찾았어요, 직접 입력해주세요"); }
    else setAmount(r.amount);
    if (r.merchant) setMemo(r.merchant);
    if (r.date) setDate(r.date);
    setPasteText("");
    setShowPaste(false);
    showToast(r.amount ? "문자에서 읽어왔어요 · 확인하고 등록하세요" : "일부만 읽어왔어요 · 확인해주세요");
  };


  const addCategory = () => {
    if (!newCatName.trim()) return;
    const cat = { id: "c" + Date.now(), name: newCatName.trim(), color: newCatColor };
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
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: payMethod === "card" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
            <CreditCard size={14} /> 카드
          </button>
          <button onClick={() => setPayMethod("cash")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: payMethod === "cash" ? T.good + "22" : "transparent", color: T.cream, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
            <Wallet size={14} /> 현금(통장)
          </button>
          <button onClick={() => setPayMethod("installment")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 0", borderRadius: 10, border: payMethod === "installment" ? `2px solid ${T.warn}` : `1px solid ${T.border}`, background: payMethod === "installment" ? T.warn + "22" : "transparent", color: T.cream, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
            <Repeat size={14} /> 할부(고정지출)
          </button>
        </div>
      </Field>

      {payMethod === "installment" ? (
        <InstallmentForm ctx={ctx} />
      ) : (
        <>
          <button onClick={() => setShowPaste(!showPaste)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10,
              border: `1px dashed ${T.gold}`, background: "transparent", color: T.gold, fontSize: 14.5, fontWeight: 700, cursor: "pointer", marginBottom: showPaste ? 10 : 16 }}>
            <ClipboardPaste size={14} /> 결제 문자 붙여넣기로 채우기
          </button>
          {showPaste && (
            <div style={{ marginBottom: 16 }}>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="예: [현대카드] 승인 12,000원 07/20 14:23 스타벅스"
                style={{ ...inputSty(T), height: 80, fontSize: 14.5, marginBottom: 8 }} />
              <button onClick={applyParse} style={primaryBtn(T)}>읽어오기</button>
            </div>
          )}

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
                        background: cardId === c.id ? T.gold + "22" : "transparent", color: cardId === c.id ? T.cream : T.muted, fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <div style={{ color: T.warn, fontSize: 14, marginBottom: 16 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
            )
          ) : (
            (data.accounts || []).length > 1 && (
              <Field label="통장">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.accounts.map((a) => (
                    <button key={a.id} onClick={() => setAccountId(a.id)}
                      style={{ padding: "7px 12px", borderRadius: 20, border: accountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                        background: accountId === a.id ? T.good + "22" : "transparent", color: accountId === a.id ? T.cream : T.muted, fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
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
                    fontSize: 16, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />
                  {c.name}
                </button>
              ))}
              <button onClick={() => setNewCatMode(!newCatMode)}
                style={{ padding: "8px 12px", borderRadius: 20, border: `1px dashed ${T.gold}`, background: "transparent", color: T.gold, fontSize: 16, cursor: "pointer" }}>
                + 새 카테고리
              </button>
            </div>
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
              <div style={{ color: isReceivable ? T.good : T.cream, fontSize: 16, fontWeight: 700 }}>대리결제 (추후 정산)</div>
              <div style={{ color: T.muted, fontSize: 14 }}>예산에서 빠지고 홈 화면에서 바로 정산할 수 있어요.</div>
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
  const [autoPayDay, setAutoPayDay] = useState("");
  const [overrideEditId, setOverrideEditId] = useState(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [sortKey, setSortKey] = useState("amountDesc");
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
    if (!window.confirm(`"${f.name}" 표기내역을 삭제할까요?`)) return;
    persist({ ...data, fixedExpenses: data.fixedExpenses.filter((x) => x.id !== id) });
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
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: tm, startInstallment: si, setupMonthKey: curKey, overrides: {}, paymentMethod: fixedPaymentMethod, cardId: fixedPaymentMethod === "card" ? fixedCardId : null, accountId: fixedPaymentMethod === "cash" ? fixedAccountId : null, paidMonths: {}, autoPayDay: fixedPaymentMethod === "cash" && Number(autoPayDay) >= 1 ? Number(autoPayDay) : null };
    } else {
      item = { id: "f" + Date.now(), name: fixedName.trim(), baseAmount: n, totalMonths: 0, startInstallment: 1, setupMonthKey: curKey, overrides: {}, paymentMethod: fixedPaymentMethod, cardId: fixedPaymentMethod === "card" ? fixedCardId : null, accountId: fixedPaymentMethod === "cash" ? fixedAccountId : null, paidMonths: {}, autoPayDay: fixedPaymentMethod === "cash" && Number(autoPayDay) >= 1 ? Number(autoPayDay) : null };
    }
    persist({ ...data, fixedExpenses: [...(data.fixedExpenses || []), item] });
    setFixedName(""); setFixedAmount(""); setTotalMonths(""); setStartInstallment("1"); setIsInstallment(false); setAutoPayDay("");
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
                  <div style={{ color: T.cream, fontSize: 16, fontWeight: 600 }}>
                    {f.name}{info.label ? ` · ${info.label}` : ""}{!info.active ? " · 완료" : ""}
                  </div>
                  <div style={{ color: T.muted, fontSize: 14 }}>
                    {f.totalMonths ? "할부" : "매달 반복"} · 기본 {fmtWon(f.baseAmount)} · {(f.paymentMethod || "cash") === "card" ? (data.cards.find((c) => c.id === f.cardId)?.name || "카드") : (data.accounts.find((a) => a.id === f.accountId)?.name || "통장(자동이체)")}{f.autoPayDay ? ` · 매달 ${f.autoPayDay}일 자동` : ""}
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
                  <div style={{ color: T.muted, fontSize: 13, marginBottom: 4 }}>
                    {(f.paymentMethod || "cash") === "card" ? "다른 카드로 변경" : "다른 통장으로 변경"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {((f.paymentMethod || "cash") === "card" ? data.cards : data.accounts).map((opt) => {
                      const curId = (f.paymentMethod || "cash") === "card" ? f.cardId : f.accountId;
                      const active = curId === opt.id;
                      return (
                        <button key={opt.id} onClick={() => reassignFixed(f, opt.id)}
                          style={{ padding: "6px 10px", borderRadius: 16, border: active ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                            background: active ? T.good + "22" : "transparent", color: active ? T.cream : T.muted, fontSize: 14.5, cursor: "pointer" }}>
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
          <div style={{ color: T.muted, fontSize: 15, textAlign: "center", padding: "8px 0 12px" }}>등록된 표기내역이 없어요.</div>
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
          <button onClick={() => setIsInstallment(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: !isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: !isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>매달 반복</button>
          <button onClick={() => setIsInstallment(true)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: isInstallment ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: isInstallment ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>할부</button>
        </div>
        {isInstallment && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 13, marginBottom: 3 }}>총 개월수</div>
              <input type="number" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} placeholder="0" style={{ ...inputSty(T), fontFamily: F.mono }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 13, marginBottom: 3 }}>현재 회차</div>
              <input type="number" value={startInstallment} onChange={(e) => setStartInstallment(e.target.value)} placeholder="1" style={{ ...inputSty(T), fontFamily: F.mono }} />
            </div>
          </div>
        )}
      </Field>
      <Field label="결제 방식">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setFixedPaymentMethod("cash")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: fixedPaymentMethod === "cash" ? `2px solid ${T.good}` : `1px solid ${T.border}`, background: fixedPaymentMethod === "cash" ? T.good + "22" : "transparent", color: T.cream, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            통장(자동이체)
          </button>
          <button onClick={() => setFixedPaymentMethod("card")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: fixedPaymentMethod === "card" ? `2px solid ${T.gold}` : `1px solid ${T.border}`, background: fixedPaymentMethod === "card" ? T.gold + "22" : "transparent", color: T.cream, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            카드
          </button>
        </div>
        {fixedPaymentMethod === "card" && (
          (data.cards || []).length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {data.cards.map((c) => (
                <button key={c.id} onClick={() => setFixedCardId(c.id)}
                  style={{ padding: "6px 10px", borderRadius: 16, border: fixedCardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                    background: fixedCardId === c.id ? T.gold + "22" : "transparent", color: fixedCardId === c.id ? T.cream : T.muted, fontSize: 14.5, cursor: "pointer" }}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: T.warn, fontSize: 14, marginTop: 8 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
          )
        )}
        {fixedPaymentMethod === "card" && !isInstallment && (
          <div style={{ color: T.muted, fontSize: 12.5, marginTop: 8 }}>할부가 아닌 매달 반복 결제(구독 등)는 자동으로 카드값에 안 잡혀요. 실제 결제되면 홈에서 &lsquo;카드반영&rsquo; 버튼을 눌러야 카드값에 반영돼요.</div>
        )}
        {fixedPaymentMethod === "cash" && (data.accounts || []).length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {data.accounts.map((a) => (
              <button key={a.id} onClick={() => setFixedAccountId(a.id)}
                style={{ padding: "6px 10px", borderRadius: 16, border: fixedAccountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                  background: fixedAccountId === a.id ? T.good + "22" : "transparent", color: fixedAccountId === a.id ? T.cream : T.muted, fontSize: 14.5, cursor: "pointer" }}>
                {a.name}
              </button>
            ))}
          </div>
        )}
        {fixedPaymentMethod === "cash" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 6 }}>자동 출금처리 (선택)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: T.muted, fontSize: 14 }}>매달</span>
              <input type="number" value={autoPayDay} onChange={(e) => setAutoPayDay(e.target.value)} placeholder="예: 25" min="1" max="31"
                style={{ ...inputSty(T), fontFamily: F.mono, width: 70, textAlign: "center" }} />
              <span style={{ color: T.muted, fontSize: 14 }}>일에 자동 출금</span>
            </div>
            <div style={{ color: T.muted, fontSize: 12.5, marginTop: 5 }}>비워두면 매달 홈에서 직접 &lsquo;출금처리&rsquo; 버튼을 눌러야 해요.</div>
          </div>
        )}
      </Field>
      <button onClick={addFixed} style={primaryBtn(T)}>표기내역 추가</button>
    </div>
  );
}

