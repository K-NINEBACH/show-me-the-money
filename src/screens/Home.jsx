// Home tab: balance card, spending-goal ring, card bills, transit quick-add,
// plus the money-moving actions (settle, reconcile, pay card, mark fixed paid).
import { useState, useEffect } from "react";
import { HandCoins, Wallet, ArrowDownCircle, ArrowUpCircle, Repeat, ClipboardPaste } from "lucide-react";
import { useTheme, F, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, monthLabel, todayISO, parsePaymentText, sortFixedList, fixedInfo } from "../lib/data";
import { MoneyInput, QuickAmountButtons, FixedSortTabs } from "../components/common";

export function HomeView({ ctx }) {
  const T = useTheme();
  const { data, curKey, dayIntoCycle, cycleLen, remaining, budgetRatio,
    fixedActive, fixedCardActive, cardTotals, receivables, accountBalance, hasGoal, unpaidFixed, unpaidFixedSum, realRemaining, todaySpent } = ctx;
  const over = remaining < 0;
  const ringColor = budgetRatio < 0.7 ? T.good : budgetRatio < 1 ? T.warn : T.danger;
  const dashArray = 2 * Math.PI * 54;
  const dashOffset = dashArray * (1 - Math.min(budgetRatio, 1));
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const [budgetOpen, setBudgetOpen] = useState(false);

  return (
    <div>
      <BalanceCard ctx={ctx} accountBalance={accountBalance} />

      {unpaidFixed.length > 0 && (
        <div style={{ marginTop: 10, background: T.warn + "18", border: `1px solid ${T.warn}66`, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: T.warn, fontSize: 14, fontWeight: 700 }}>출금처리 안 한 고정지출 {unpaidFixed.length}건</span>
          <span style={{ color: T.muted, fontSize: 13, flex: 1 }}>실제로 빠져나갔으면 아래에서 출금처리 하세요</span>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 4, marginTop: 22 }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 21.5, fontWeight: 700 }}>
          {monthLabel(curKey)} · {dayIntoCycle}일차
        </div>
        <div style={{ color: T.goldSoft, fontSize: 13, marginTop: 4 }}>오늘 지출 {fmtWon(todaySpent)}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}>
        <div style={{ position: "relative", width: 176, height: 176 }}>
          <svg width="176" height="176" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke={T.mode === "dark" ? "#2A2F4C" : "#DCCBA0"} strokeWidth="10" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={ringColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={dashArray} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 2 }}>{over ? "목표 초과" : "이번 달 운용 가능"}</div>
            <div style={{ color: over ? T.danger : T.cream, fontFamily: F.mono, fontWeight: 600, fontSize: 19.5, lineHeight: 1.15, textAlign: "center" }}>
              {over ? "-" : ""}{fmtWon(Math.abs(remaining))}
            </div>
            <div style={{ color: T.goldSoft, fontSize: 13, marginTop: 4 }}>
              {cycleLen - dayIntoCycle >= 0 ? `${cycleLen - dayIntoCycle}일 남음` : ""}
            </div>
          </div>
        </div>
      </div>
      {!hasGoal && (
        <div style={{ textAlign: "center", color: T.warn, fontSize: 14, marginTop: -4, marginBottom: 6 }}>
          설정에서 이번 달 목표 지출액을 정해주세요
        </div>
      )}
      {unpaidFixedSum > 0 ? (
        <div style={{ textAlign: "center", color: T.muted, fontSize: 12.5, marginBottom: 14 }}>
          미처리 {fmtWon(unpaidFixedSum)} · 반영 전 여유 {fmtWon(Math.abs(realRemaining))}{realRemaining < 0 ? " 초과" : ""}
        </div>
      ) : (
        <div style={{ marginBottom: 14 }} />
      )}

      <SummaryCard ctx={ctx} />

      <CardsBlock ctx={ctx} cardTotals={cardTotals} />

      <TransitQuickAdd ctx={ctx} />

      {(fixedActive.length > 0 || fixedCardActive.length > 0 || receivables.length > 0) && (
        <>
          <button onClick={() => setBudgetOpen(!budgetOpen)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "8px 2px", marginBottom: budgetOpen ? 8 : 4 }}>
            <span style={{ color: T.goldSoft, fontSize: 13, fontWeight: 700 }}>예산 관리</span>
            <span style={{ color: T.muted, fontSize: 12 }}>{budgetOpen ? "접기 ▲" : "펼치기 ▼"}</span>
          </button>
          {budgetOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {(fixedActive.length > 0 || fixedCardActive.length > 0) && (
                <FixedDetailCard ctx={ctx} fixedActive={fixedActive} fixedCardActive={fixedCardActive} />
              )}
              {receivables.length > 0 && <ReceivablesCard ctx={ctx} receivables={receivables} catMap={catMap} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReceivablesCard({ ctx, receivables, catMap }) {
  const T = useTheme();
  const [settlingId, setSettlingId] = useState(null);
  const [repaidInput, setRepaidInput] = useState("");
  const open = (r) => { setSettlingId(r.id); setRepaidInput(String(r.amount)); };
  const confirm = (r) => { settleReceivable(ctx, r, repaidInput); setSettlingId(null); setRepaidInput(""); };
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.good}55`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <HandCoins size={13} color={T.good} />
        <span style={{ color: T.good, fontSize: 14, fontWeight: 700 }}>대리결제(추후 정산)</span>
      </div>
      {receivables.map((r) => (
        <div key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, color: T.cream, padding: "3px 0" }}>
            <span>{r.memo || catMap[r.categoryId]?.name || "대리결제"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: F.mono, color: T.good }}>{fmtWon(r.amount)}</span>
              {settlingId !== r.id && (
                <button onClick={() => open(r)} style={{ background: T.good, border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "#fff", fontSize: 13.5, fontWeight: 700 }}>정산</button>
              )}
            </span>
          </div>
          {settlingId === r.id && (
            <div style={{ marginTop: 4, marginBottom: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
              <div style={{ color: T.muted, fontSize: 13.5, marginBottom: 5 }}>실제 상환받은 금액 (부족분→카드값, 초과분→통장)</div>
              <MoneyInput value={repaidInput} onChange={setRepaidInput} autoFocus />
              <QuickAmountButtons amount={repaidInput} setAmount={setRepaidInput} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setSettlingId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 14.5, cursor: "pointer" }}>취소</button>
                <button onClick={() => confirm(r)} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>정산 확정</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Combines what used to be two separate cards (월 요약 + 고정지출/현금지출 스탯카드) into
// one, since they were just restating the same month's spend in different shapes.
function SummaryCard({ ctx }) {
  const T = useTheme();
  const { curKey, totalSpentThisMonth, prevTotalSpent, fixedSumAll, normalSpent } = ctx;
  const hasPrev = prevTotalSpent > 0;
  const pct = hasPrev ? Math.round(((totalSpentThisMonth - prevTotalSpent) / prevTotalSpent) * 100) : null;
  const up = pct != null && pct > 0;
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ color: T.muted, fontSize: 14, marginBottom: 4 }}>{monthLabel(curKey)} 요약</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 16.5, fontWeight: 700 }}>총 지출 {fmtWon(totalSpentThisMonth)}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: pct == null ? T.muted : up ? T.danger : T.good }}>
          {pct == null ? "지난달 비교 데이터 없음" : `지난달 대비 ${up ? "+" : ""}${pct}%`}
        </div>
      </div>
      <div style={{ color: T.muted, fontSize: 13.5, marginTop: 4 }}>고정지출 {fmtWon(fixedSumAll)} · 현금지출 {fmtWon(normalSpent)}</div>
    </div>
  );
}


function FixedDetailCard({ ctx, fixedActive, fixedCardActive }) {
  const T = useTheme();
  const { data, curKey } = ctx;
  const [sortKey, setSortKey] = useState("amountDesc");
  const combined = [...fixedActive, ...fixedCardActive];
  const sorted = sortFixedList(combined, sortKey);
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: T.muted, fontSize: 14, marginBottom: 6 }}>이번달 고정지출 상세내역</div>
      <FixedSortTabs sortKey={sortKey} setSortKey={setSortKey} />
      {sorted.map((f) => {
        const isCard = (f.paymentMethod || "cash") === "card";
        const isRealInstallment = isCard && f.totalMonths > 0;
        const needsAction = !isRealInstallment;
        const paidId = f.paidMonths?.[curKey];
        return (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, color: T.cream, padding: "4px 0" }}>
            <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""}
              <span style={{ color: isCard ? T.gold : T.muted, fontSize: 13 }}>
                {" · "}{isCard ? (data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드") : (data.accounts.find((a) => a.id === f.accountId)?.name || "통장")}
              </span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(f.info.amount)}</span>
              {needsAction && (
                paidId ? (
                  <button onClick={() => unmarkFixedPaid(ctx, f)} style={{ background: "none", border: `1px solid ${T.good}`, borderRadius: 6, padding: "3px 6px", cursor: "pointer", color: T.good, fontSize: 11.5, fontWeight: 700 }}>{isCard ? "반영완료" : "출금완료"}</button>
                ) : (
                  <button onClick={() => markFixedPaid(ctx, f, f.info)} style={{ background: T.good, border: "none", borderRadius: 6, padding: "3px 7px", cursor: "pointer", color: "#fff", fontSize: 11.5, fontWeight: 700 }}>{isCard ? "카드반영" : "출금처리"}</button>
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function settleReceivable(ctx, exp, repaidAmount) {
  const { data, persist, showToast } = ctx;
  const repaid = Number(repaidAmount);
  if (repaidAmount === "" || Number.isNaN(repaid) || repaid < 0) { showToast("상환받은 금액을 입력해주세요"); return; }
  const diff = repaid - exp.amount;
  let settlementCardDelta = 0, settlementCardId = null, settlementBalanceId = null;
  let next = { ...data };
  if (diff < 0) {
    settlementCardDelta = Math.abs(diff);
    settlementCardId = exp.cardId || data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === settlementCardId ? { ...c, bill: Number(c.bill || 0) + settlementCardDelta } : c));
  } else if (diff > 0) {
    settlementBalanceId = "b" + Date.now();
    const aid = data.accounts[0]?.id;
    next.balanceEntries = [...(data.balanceEntries || []), { id: settlementBalanceId, type: "in", amount: diff, date: todayISO(), memo: "대리결제 정산 차액", accountId: aid }];
  }
  next.expenses = data.expenses.map((e) => (e.id === exp.id ? { ...e, settled: true, repaidAmount: repaid, settledAt: todayISO(), settlementCardDelta, settlementCardId, settlementBalanceId } : e));
  persist(next);
  if (diff < 0) showToast(`부족분 ${fmtWon(Math.abs(diff))}이 카드값에 반영됐어요`);
  else if (diff > 0) showToast(`초과분 ${fmtWon(diff)}이 통장 잔액에 반영됐어요`);
  else showToast("정산 완료했어요");
}

function reconcileAccount(ctx, account, actualBalance) {
  const { data, persist, showToast } = ctx;
  const actual = Number(actualBalance);
  if (Number.isNaN(actual)) { showToast("올바른 금액을 입력해주세요"); return; }
  const diff = actual - account.balance;
  if (diff === 0) { showToast("이미 실제 잔액과 같아요"); return; }
  const entry = { id: "b" + Date.now(), type: diff > 0 ? "in" : "out", amount: Math.abs(diff), date: todayISO(), memo: "잔액 조정", accountId: account.id, isAdjustment: true };
  persist({ ...data, balanceEntries: [...(data.balanceEntries || []), entry] });
  showToast(`${account.name} 잔액을 실제와 맞췄어요 (${diff > 0 ? "+" : "-"}${fmtWon(Math.abs(diff))})`);
}

function reconcileCard(ctx, card, actualTotal) {
  const { data, persist, showToast } = ctx;
  const actual = Number(actualTotal);
  if (Number.isNaN(actual) || actual < 0) { showToast("올바른 금액을 입력해주세요"); return; }
  const fixedPortion = Number(card.fixedPortion || 0);
  const newBill = Math.max(0, actual - fixedPortion);
  const next = data.cards.map((c) => (c.id === card.id ? { ...c, bill: newBill } : c));
  persist({ ...data, cards: next });
  showToast(`${card.name} 카드값을 ${fmtWon(actual)}로 맞췄어요`);
}

function markFixedPaid(ctx, f, info) {
  const { data, persist, showToast, curKey } = ctx;
  const isCard = (f.paymentMethod || "cash") === "card";
  let next = { ...data };
  let marker;
  if (isCard) {
    const cid = f.cardId || data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Number(c.bill || 0) + Number(info.amount) } : c));
    marker = true;
  } else {
    const aid = f.accountId || data.accounts[0]?.id;
    const entry = { id: "b" + Date.now(), type: "out", amount: info.amount, date: todayISO(), memo: `${f.name} 자동이체`, accountId: aid, linkedFixedId: f.id, linkedFixedMonth: curKey };
    next.balanceEntries = [...(data.balanceEntries || []), entry];
    marker = entry.id;
  }
  next.fixedExpenses = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, paidMonths: { ...(x.paidMonths || {}), [curKey]: marker } } : x));
  persist(next);
  showToast(isCard ? `${fmtWon(info.amount)} 카드값에 반영했어요` : `${fmtWon(info.amount)} 출금 처리했어요`);
}
function unmarkFixedPaid(ctx, f) {
  const { data, persist, showToast, curKey } = ctx;
  const isCard = (f.paymentMethod || "cash") === "card";
  const marker = f.paidMonths?.[curKey];
  let next = { ...data };
  if (isCard) {
    const info = fixedInfo(f, curKey);
    const cid = f.cardId || data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(info.amount)) } : c));
  } else if (marker) {
    next.balanceEntries = (data.balanceEntries || []).filter((b) => b.id !== marker);
  }
  const updatedFixed = data.fixedExpenses.map((x) => {
    if (x.id !== f.id) return x;
    const pm = { ...(x.paidMonths || {}) };
    delete pm[curKey];
    return { ...x, paidMonths: pm };
  });
  next.fixedExpenses = updatedFixed;
  persist(next);
  showToast("처리를 취소했어요");
}

function payCard(ctx, card) {
  const { data, persist, showToast } = ctx;
  const billOnly = Number(card.bill || 0);
  const fixedPortion = Number(card.fixedPortion || 0);
  const total = billOnly + fixedPortion;
  if (!total || total <= 0) return showToast("결제할 금액이 없어요");
  const nextCards = data.cards.map((c) => (c.id === card.id ? { ...c, bill: 0 } : c));
  const aid = data.accounts?.[0]?.id;
  persist({ ...data, cards: nextCards, balanceEntries: [...(data.balanceEntries || []), { id: "b" + Date.now(), type: "out", amount: total, date: todayISO(), memo: `${card.name} 카드값 결제`, accountId: aid }] });
  showToast(`${fmtWon(total)} 결제 처리 · 통장에서 출금됐어요`);
}

function CardsBlock({ ctx, cardTotals }) {
  const T = useTheme();
  const [reconcileId, setReconcileId] = useState(null);
  const [reconcileInput, setReconcileInput] = useState("");
  if (!cardTotals || cardTotals.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      {cardTotals.map((c) => (
        <div key={c.id} style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.muted, fontSize: 14 }}>{c.name}</div>
              <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 15.5, fontWeight: 700 }}>{fmtWon(c.total)}</div>
              {c.fixedPortion > 0 && <div style={{ color: T.goldSoft, fontSize: 13 }}>이번 달 할부 {fmtWon(c.fixedPortion)} 포함</div>}
            </div>
            <button onClick={() => { setReconcileId(reconcileId === c.id ? null : c.id); setReconcileInput(String(c.total || "")); }}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 13.5, cursor: "pointer" }}>
              맞추기
            </button>
            <button onClick={() => payCard(ctx, c)} disabled={!c.total}
              style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: c.total ? T.gold : T.border, color: c.total ? "#23190C" : T.muted, fontSize: 14.5, fontWeight: 700, cursor: c.total ? "pointer" : "default" }}>
              결제하기
            </button>
          </div>
          {reconcileId === c.id && (
            <div style={{ marginTop: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>카드 앱에 찍힌 이번 달 청구 총액(할부 포함)을 그대로 입력하면 맞춰요.</div>
              <MoneyInput value={reconcileInput} onChange={setReconcileInput} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setReconcileId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 13, cursor: "pointer" }}>취소</button>
                <button onClick={() => { reconcileCard(ctx, c, reconcileInput); setReconcileId(null); }} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>맞추기</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TransitQuickAdd({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  if (!data.cards || data.cards.length === 0) return null;

  const transitCat = data.categories.find((c) => c.name.includes("교통")) || data.categories[0];
  const existing = data.expenses.find((e) => e.linkedTransitMonth === curKey);

  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [cardId, setCardId] = useState(existing ? existing.cardId : (data.cards?.[0]?.id || ""));

  useEffect(() => {
    setAmount(existing ? String(existing.amount) : "");
    setCardId(existing ? existing.cardId : (data.cards?.[0]?.id || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, existing?.amount, existing?.cardId]);

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!cardId) return showToast("카드를 선택해주세요");
    let next = { ...data };
    if (existing) {
      const oldAmount = Number(existing.amount);
      const oldCardId = existing.cardId;
      next.expenses = data.expenses.map((e) => (e.id === existing.id ? { ...e, amount: n, cardId, date: todayISO() } : e));
      if (oldCardId === cardId) {
        const delta = n - oldAmount;
        next.cards = data.cards.map((c) => (c.id === cardId ? { ...c, bill: Math.max(0, Number(c.bill || 0) + delta) } : c));
      } else {
        next.cards = data.cards.map((c) => {
          if (c.id === oldCardId) return { ...c, bill: Math.max(0, Number(c.bill || 0) - oldAmount) };
          if (c.id === cardId) return { ...c, bill: Number(c.bill || 0) + n };
          return c;
        });
      }
      showToast(`이번 달 대중교통 누적을 ${fmtWon(n)}으로 갱신했어요`);
    } else {
      const expense = { id: "e" + Date.now(), amount: n, categoryId: transitCat?.id || null, date: todayISO(), memo: "대중교통", isReceivable: false, settled: false, repaidAmount: null, paymentMethod: "card", cardId, linkedBalanceId: null, linkedTransitMonth: curKey };
      next.expenses = [...data.expenses, expense];
      next.cards = data.cards.map((c) => (c.id === cardId ? { ...c, bill: Number(c.bill || 0) + n } : c));
      showToast(`대중교통비 ${fmtWon(n)}을 카드값에 반영했어요`);
    }
    persist(next);
  };

  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ color: T.muted, fontSize: 14, marginBottom: 2 }}>대중교통비 빠른입력</div>
      <div style={{ color: T.muted, fontSize: 12, marginBottom: 8 }}>계기판에 뜨는 이번 달 누적 금액을 그대로 입력하면, 이전 값을 대체해서 갱신돼요 (더해지지 않아요).</div>
      <MoneyInput value={amount} onChange={setAmount} placeholder="이번 달 누적 금액" />
      {data.cards.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {data.cards.map((c) => (
            <button key={c.id} onClick={() => setCardId(c.id)}
              style={{ padding: "6px 10px", borderRadius: 16, border: cardId === c.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                background: cardId === c.id ? T.gold + "22" : "transparent", color: cardId === c.id ? T.cream : T.muted, fontSize: 14, cursor: "pointer" }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <button onClick={submit} style={{ ...primaryBtn(T), marginTop: 8, padding: "9px 0", fontSize: 14.5 }}>{existing ? "누적 금액 갱신" : "카드값에 반영"}</button>
    </div>
  );
}

function BalanceCard({ ctx, accountBalance }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const accountTotals = ctx.accountTotals || [];
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [accountId, setAccountId] = useState(data.accounts?.[0]?.id || "");
  const [expanded, setExpanded] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [reconcileId, setReconcileId] = useState(null);
  const [reconcileInput, setReconcileInput] = useState("");
  const [toAccountId, setToAccountId] = useState("");

  const submit = () => {
    const n = Number(amount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!accountId) return showToast("통장을 먼저 선택해주세요");
    if (mode === "transfer") {
      if (!toAccountId) return showToast("받는 통장을 선택해주세요");
      if (toAccountId === accountId) return showToast("보내는 통장과 받는 통장이 같아요");
      const fromName = data.accounts.find((a) => a.id === accountId)?.name || "통장";
      const toName = data.accounts.find((a) => a.id === toAccountId)?.name || "통장";
      const tid = "t" + Date.now();
      const memoText = memo.trim();
      const outEntry = { id: "b" + Date.now(), type: "out", amount: n, date: todayISO(), memo: memoText || `${toName}(으)로 이체`, accountId, transferId: tid };
      const inEntry = { id: "b" + (Date.now() + 1), type: "in", amount: n, date: todayISO(), memo: memoText || `${fromName}에서 이체`, accountId: toAccountId, transferId: tid };
      persist({ ...data, balanceEntries: [...(data.balanceEntries || []), outEntry, inEntry] });
      setAmount(""); setMemo(""); setMode(null); setToAccountId("");
      showToast(`${fromName} → ${toName} ${fmtWon(n)} 이체했어요`);
      return;
    }
    const entry = { id: "b" + Date.now(), type: mode, amount: n, date: todayISO(), memo: memo.trim(), accountId };
    persist({ ...data, balanceEntries: [...(data.balanceEntries || []), entry] });
    setAmount(""); setMemo(""); setMode(null);
    showToast(mode === "in" ? "입금을 기록했어요" : "출금을 기록했어요");
  };

  const applyParse = () => {
    if (!pasteText.trim()) return showToast("문자 내용을 붙여넣어주세요");
    const r = parsePaymentText(pasteText);
    if (r.amount) setAmount(r.amount);
    if (r.merchant) setMemo(r.merchant);
    if (r.type === "in" || r.type === "out") setMode(r.type);
    setPasteText("");
    setShowPaste(false);
    showToast(r.amount ? "문자에서 읽어왔어요 · 확인하고 등록하세요" : "일부만 읽어왔어요 · 확인해주세요");
  };

  return (
    <div style={{ background: T.bg2, border: `1.5px solid ${T.good}77`, borderRadius: 14, padding: "14px 16px" }}>
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", padding: 0, cursor: accountTotals.length > 1 ? "pointer" : "default", width: "100%", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Wallet size={14} color={T.good} />
          <span style={{ color: T.good, fontSize: 14, fontWeight: 700 }}>통장 잔액 (총합){accountTotals.length > 1 ? (expanded ? " ▲" : " ▼") : ""}</span>
        </div>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 26, fontWeight: 700, marginBottom: 2 }}>{fmtWon(accountBalance)}</div>
        <div style={{ color: T.good, fontSize: 12, marginBottom: 10 }}>실제로 계좌에 있는 돈 · 입출금·현금결제만 실시간 반영</div>
      </button>
      {expanded && accountTotals.length > 1 && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {accountTotals.map((a) => (
            <div key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, color: T.cream, padding: "3px 0", borderBottom: `1px dashed ${T.border}` }}>
                <span>{a.name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(a.balance)}</span>
                  <button onClick={() => { setReconcileId(reconcileId === a.id ? null : a.id); setReconcileInput(String(a.balance)); }} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", color: T.muted, fontSize: 11.5 }}>맞추기</button>
                </span>
              </div>
              {reconcileId === a.id && (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>통장 앱에 찍힌 실제 잔액을 입력하면 차액을 자동으로 맞춰요</div>
                  <MoneyInput value={reconcileInput} onChange={setReconcileInput} />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={() => setReconcileId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 13, cursor: "pointer" }}>취소</button>
                    <button onClick={() => { reconcileAccount(ctx, a, reconcileInput); setReconcileId(null); }} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>맞추기</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {accountTotals.length === 1 && (
        <div style={{ marginBottom: 10 }}>
          {reconcileId === accountTotals[0].id ? (
            <div style={{ background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>통장 앱에 찍힌 실제 잔액을 입력하면 차액을 자동으로 맞춰요</div>
              <MoneyInput value={reconcileInput} onChange={setReconcileInput} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setReconcileId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 13, cursor: "pointer" }}>취소</button>
                <button onClick={() => { reconcileAccount(ctx, accountTotals[0], reconcileInput); setReconcileId(null); }} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>맞추기</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setReconcileId(accountTotals[0].id); setReconcileInput(String(accountTotals[0].balance)); }}
              style={{ width: "100%", padding: "7px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 13.5, cursor: "pointer" }}>
              실제 잔액으로 맞추기
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setMode(mode === "in" ? null : "in")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.good}`, background: mode === "in" ? T.good + "22" : "transparent", color: T.good, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
          <ArrowDownCircle size={14} /> 입금
        </button>
        <button onClick={() => setMode(mode === "out" ? null : "out")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.danger}`, background: mode === "out" ? T.danger + "22" : "transparent", color: T.danger, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
          <ArrowUpCircle size={14} /> 출금
        </button>
        {(data.accounts || []).length > 1 && (
          <button onClick={() => setMode(mode === "transfer" ? null : "transfer")}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 8, border: `1px solid ${T.gold}`, background: mode === "transfer" ? T.gold + "22" : "transparent", color: T.gold, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>
            <Repeat size={14} /> 이체
          </button>
        )}
      </div>
      {mode && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {mode !== "transfer" && (
            <>
              <button onClick={() => setShowPaste(!showPaste)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 8,
                  border: `1px dashed ${T.gold}`, background: "transparent", color: T.gold, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                <ClipboardPaste size={13} /> 입출금 문자 붙여넣기로 채우기
              </button>
              {showPaste && (
                <div>
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="예: 국민은행 입금 500,000원 07/20 14:23"
                    style={{ ...inputSty(T), height: 70, fontSize: 14, marginBottom: 6 }} />
                  <button onClick={applyParse} style={primaryBtn(T)}>읽어오기</button>
                </div>
              )}
            </>
          )}
          {(data.accounts || []).length > 1 && (
            <div>
              {mode === "transfer" && <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 4 }}>보내는 통장</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.accounts.map((a) => (
                  <button key={a.id} onClick={() => setAccountId(a.id)}
                    style={{ padding: "6px 10px", borderRadius: 16, border: accountId === a.id ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                      background: accountId === a.id ? T.gold + "22" : "transparent", color: accountId === a.id ? T.cream : T.muted, fontSize: 14.5, cursor: "pointer" }}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "transfer" && (
            <div>
              <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 4 }}>받는 통장</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.accounts.filter((a) => a.id !== accountId).map((a) => (
                  <button key={a.id} onClick={() => setToAccountId(a.id)}
                    style={{ padding: "6px 10px", borderRadius: 16, border: toAccountId === a.id ? `2px solid ${T.good}` : `1px solid ${T.border}`,
                      background: toAccountId === a.id ? T.good + "22" : "transparent", color: toAccountId === a.id ? T.cream : T.muted, fontSize: 14.5, cursor: "pointer" }}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <MoneyInput value={amount} onChange={setAmount} placeholder="금액" autoFocus />
          <QuickAmountButtons amount={amount} setAmount={setAmount} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="표기내역" style={{ ...inputSty(T), marginTop: 4 }} />
          <button onClick={submit} style={{ ...primaryBtn(T), background: mode === "in" ? T.good : mode === "transfer" ? T.gold : T.danger, color: mode === "transfer" ? "#23190C" : "#fff", marginTop: 4 }}>
            {mode === "in" ? "입금 기록" : mode === "transfer" ? "이체 기록" : "출금 기록"}
          </button>
        </div>
      )}
    </div>
  );
}

