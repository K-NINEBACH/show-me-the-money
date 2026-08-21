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

  // 대신 내준 돈(대리결제)도 그냥 평범한 지출로 기록하면 됨 — 카드/현금 그대로 반영되고,
  // 나중에 실제로 돈을 돌려받으면 내역에서 그 지출을 눌러 "정산받음"으로 표시하면 됨
  // (2026-08-21 변경: 입력 시점에 미리 "대리결제" 체크할 필요 없어짐).
  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!categoryId) return showToast("카테고리를 선택해주세요");
    if (payMethod === "card" && !cardId) return showToast("설정에서 카드를 먼저 등록해주세요");
    if (payMethod === "cash" && !accountId) return showToast("설정에서 통장을 먼저 등록해주세요");
    const catName = data.categories.find((c) => c.id === categoryId)?.name || "지출";
    const linkedBalanceId = payMethod === "cash" ? "b" + Date.now() : null;
    const expense = { id: "e" + Date.now(), amount: n, categoryId, date, memo: memo.trim(), paymentMethod: payMethod, cardId: payMethod === "card" ? cardId : null, linkedBalanceId };
    let next = { ...data, expenses: [...data.expenses, expense] };
    if (payMethod === "card") {
      next.cards = data.cards.map((c) => (c.id === cardId ? { ...c, bill: Number(c.bill || 0) + n } : c));
    } else {
      next.balanceEntries = [...(next.balanceEntries || []), { id: linkedBalanceId, type: "out", amount: n, date, memo: `${catName}${memo.trim() ? " · " + memo.trim() : ""}`, accountId }];
    }
    persist(next);
    setAmount(""); setMemo("");
    showToast(payMethod === "card" ? "카드값에 반영했어요" : "통장에서 차감했어요");
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

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>카테고리</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 9, height: 9, borderRadius: "50%", background: data.categories.find((c) => c.id === categoryId)?.color || T.muted, pointerEvents: "none" }} />
                <select value={categoryId}
                  onChange={(e) => { if (e.target.value === "__new__") setNewCatMode(true); else { setCategoryId(e.target.value); setNewCatMode(false); } }}
                  style={{ ...inputSty(T), paddingLeft: 28, appearance: "auto" }}>
                  {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new__">+ 새 카테고리</option>
                </select>
              </div>
            </div>
            {payMethod === "card" && (data.cards || []).length > 0 && (
              <div style={{ flex: 1 }}>
                <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>카드</div>
                <select value={cardId} onChange={(e) => setCardId(e.target.value)} style={inputSty(T)}>
                  {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {payMethod === "cash" && (data.accounts || []).length > 1 && (
              <div style={{ flex: 1 }}>
                <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>통장</div>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputSty(T)}>
                  {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {payMethod === "card" && (data.cards || []).length === 0 && (
            <div style={{ color: T.warn, fontSize: 14, marginTop: -10, marginBottom: 16 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
          )}

          {newCatMode && (
            <div style={{ marginTop: -8, marginBottom: 16, background: T.bg2, borderRadius: 10, padding: 12 }}>
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="표기내역" style={{ ...inputSty(T), marginBottom: 8 }} autoFocus />
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {PALETTE.map((col) => (
                  <button key={col} onClick={() => setNewCatColor(col)}
                    style={{ width: 24, height: 24, borderRadius: "50%", background: col, border: newCatColor === col ? `2px solid ${T.cream}` : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
              <button onClick={addCategory} style={primaryBtn(T)}>카테고리 추가</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>날짜</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputSty(T)} />
            </div>
            <div style={{ flex: 1.4 }}>
              <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>메모 (선택)</div>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="표기내역" style={inputSty(T)} />
            </div>
          </div>

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
  const [listOpen, setListOpen] = useState(false);
  const fixedList = data.fixedExpenses || [];

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
      {fixedList.length > 0 ? (
        <button onClick={() => setListOpen(!listOpen)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, cursor: "pointer", padding: "10px 12px", marginBottom: listOpen ? 8 : 16 }}>
          <span style={{ color: T.cream, fontSize: 15, fontWeight: 700 }}>등록된 표기내역 {fixedList.length}개</span>
          <span style={{ color: T.muted, fontSize: 13 }}>{listOpen ? "접기 ▲" : "보기 ▼"}</span>
        </button>
      ) : (
        <div style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>등록된 표기내역이 없어요. 아래에서 추가해보세요.</div>
      )}
      {listOpen && (
      <div style={{ background: T.bg2, borderRadius: 10, padding: 10, marginBottom: 16 }}>
        <FixedSortTabs sortKey={sortKey} setSortKey={setSortKey} />
        {sortFixedList(fixedList.map((f) => ({ ...f, info: fixedInfo(f, curKey) })), sortKey).map((f) => {
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
      </div>
      )}

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
            <select value={fixedCardId} onChange={(e) => setFixedCardId(e.target.value)} style={{ ...inputSty(T), marginTop: 8 }}>
              {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div style={{ color: T.warn, fontSize: 14, marginTop: 8 }}>등록된 카드가 없어요. 설정에서 먼저 카드를 등록해주세요.</div>
          )
        )}
        {fixedPaymentMethod === "card" && !isInstallment && (
          <div style={{ color: T.muted, fontSize: 12.5, marginTop: 8 }}>할부가 아닌 매달 반복 결제(구독 등)는 자동으로 카드값에 안 잡혀요. 실제 결제되면 홈에서 &lsquo;카드반영&rsquo; 버튼을 눌러야 카드값에 반영돼요.</div>
        )}
        {fixedPaymentMethod === "cash" && (data.accounts || []).length > 1 && (
          <select value={fixedAccountId} onChange={(e) => setFixedAccountId(e.target.value)} style={{ ...inputSty(T), marginTop: 8 }}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
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

