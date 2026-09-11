// History tab: one unified feed of everything money-related (card/cash expenses,
// 대리결제, 입출금), scoped by time (이번달/전체/기간) and optionally narrowed by
// category (카드/대리결제/입출금). LedgerRow renders the expense rows within that feed.
import { useState, useMemo, useEffect } from "react";
import { Pencil, Trash2, ArrowDownCircle, ArrowUpCircle, Search } from "lucide-react";
import { useTheme, F, paperCard, inputSty, primaryBtn } from "../lib/theme";
import { fmtWon, createdTime, dateStrFor, monthKeyOffset, todayISO, netAmount } from "../lib/data";
import { MoneyInput, QuickAmountButtons } from "../components/common";
import { settleReceivable } from "./Home";

/*
  내역 줄의 공용 조각. 지출·대리결제·입출금 세 종류가 한 목록에 섞이는데, 예전엔
  줄마다 틀이 달랐다 — 지출은 날짜가 아래 줄에 '2026-09-10', 입출금은 금액 옆에
  '09-10'. 한 목록 안에서 같은 정보가 다른 자리·다른 모양으로 나오면 훑어 내려갈
  때 눈이 매번 다시 찾아야 한다. 이제 셋 다 [제목·배지 / 메모 / 날짜 | 금액 | 버튼].

  흐린 글자는 T.inkMuted — 예전엔 #8A7E5E·#9A8E6E가 박혀 있어 테마를 안 따라갔고
  종이 위 대비가 2.8~3.9로 전 테마에서 기준(4.5) 미달이었다.
*/
// 제목과 배지를 한 줄에 흘려 두고, 넘치면 배지가 다음 줄 맨 앞부터 이어진다.
// 예전엔 배지마다 왼쪽 여백을 붙여서, 줄이 넘어가면 그 여백까지 같이 넘어가
// 들여쓰기처럼 보였다.
function rowTitle(T) { return { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 6, rowGap: 1, color: T.ink, fontSize: 16, fontWeight: 600 }; }
function rowSub(T) { return { color: T.inkMuted, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }; }
function rowDate(T) { return { color: T.inkMuted, fontSize: 12.5, fontFamily: F.mono }; }
function Badge({ color, children }) {
  return <span style={{ fontSize: 12, fontWeight: 700, color, whiteSpace: "nowrap" }}>{children}</span>;
}

/*
  아이콘만 있는 버튼. 예전엔 이름이 없어 스크린리더가 "버튼"이라고만 읽었고,
  누르는 영역이 22px 남짓이라 금액 옆 휴지통을 스치듯 잘못 누르기 쉬웠다.
  보이는 아이콘 크기는 그대로 두고 누르는 영역만 40px로 넓힌다.
*/
function IconBtn({ label, color, onClick, children }) {
  return (
    <button onClick={onClick} aria-label={label}
      style={{ background: "none", border: "none", cursor: "pointer", color, width: 36, height: 40, marginInline: -4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </button>
  );
}

export function LedgerRow({ e, cat, methodLabel, methodColor, dateNode, onEdit, onDelete }) {
  const T = useTheme();
  const title = cat ? cat.name : "미분류";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitle(T)}>
          {title}
          <Badge color={methodColor}>{methodLabel}</Badge>
          {e.reimbursedAmount != null && <Badge color={T.good}>정산받음 {fmtWon(e.reimbursedAmount)}</Badge>}
          {/* 알림에서 확인 없이 들어온 줄 — 이상하면 이것만 훑어 지울 수 있게 */}
          {e.auto && <Badge color={T.inkMuted}>자동</Badge>}
        </div>
        {e.memo && <div style={rowSub(T)}>{e.memo}</div>}
        {dateNode || <div style={rowDate(T)}>{e.date}</div>}
      </div>
      <div style={{ color: T.ink, fontFamily: F.mono, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 16, textAlign: "right", whiteSpace: "nowrap" }}>{fmtWon(e.amount)}</div>
      {onEdit && <IconBtn label={`${title} ${fmtWon(e.amount)} 수정`} color={T.gold} onClick={onEdit}><Pencil size={15} aria-hidden="true" /></IconBtn>}
      {onDelete && <IconBtn label={`${title} ${fmtWon(e.amount)} 삭제`} color={T.danger} onClick={onDelete}><Trash2 size={15} aria-hidden="true" /></IconBtn>}
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
        <div aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: cat ? cat.color : T.muted, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={rowTitle(T)}>
            {cat ? cat.name : "대리결제"}
            <Badge color={T.inkMuted}>대리결제 · {methodLabel}</Badge>
          </div>
          {e.memo && <div style={rowSub(T)}>{e.memo}</div>}
          <div style={rowDate(T)}>{e.date}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span style={{ color: T.ink, fontFamily: F.mono, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 16 }}>{fmtWon(e.amount)}</span>
          {!e.settled && <span style={{ color: T.warn, fontSize: 11, fontWeight: 700 }}>미정산</span>}
          {e.settled && diff === 0 && <span style={{ color: T.good, fontSize: 11, fontWeight: 700 }}>정산완료</span>}
          {e.settled && diff < 0 && <span style={{ color: T.danger, fontSize: 11, fontWeight: 700 }}>부족분 {fmtWon(-diff)} 카드값</span>}
          {e.settled && diff > 0 && <span style={{ color: T.good, fontSize: 11, fontWeight: 700 }}>초과분 {fmtWon(diff)} 통장</span>}
        </div>
        {!e.settled && !settling && (
          <IconBtn label={`${e.memo || "대리결제"} 정산`} color={T.gold} onClick={openSettle}><Pencil size={15} aria-hidden="true" /></IconBtn>
        )}
        <IconBtn label={`${e.memo || "대리결제"} ${fmtWon(e.amount)} 삭제`} color={T.danger} onClick={onDelete}><Trash2 size={15} aria-hidden="true" /></IconBtn>
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

/*
  입출금 한 줄. 지출 줄과 같은 틀로 맞췄다 — 예전엔 메모를 제목에 이어 붙여서
  '입금 · 코스트코코리아 대리결제 정산'이 세 줄로 접히고 금액 칸을 밀어냈다.

  '자동' 배지를 여기에도 붙인다. 은행 알림으로 들어온 입출금에 auto 표시가 있는데
  이 줄은 그걸 안 그려서, 지출과 달리 무엇이 자동으로 들어왔는지 안 보였다.
  통장이 여럿이라 어느 통장인지도 같이 적는다.
*/
function BalanceRow({ b, accountName, onDelete }) {
  const T = useTheme();
  const kind = b.type === "in" ? "입금" : "출금";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
      {b.type === "in" ? <ArrowDownCircle size={15} color={T.good} aria-hidden="true" style={{ flexShrink: 0, marginInline: -3.5 }} /> : <ArrowUpCircle size={15} color={T.danger} aria-hidden="true" style={{ flexShrink: 0, marginInline: -3.5 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitle(T)}>
          {kind}
          {accountName && <Badge color={T.inkMuted}>{accountName}</Badge>}
          {b.auto && <Badge color={T.inkMuted}>자동</Badge>}
        </div>
        {b.memo && <div style={rowSub(T)}>{b.memo}</div>}
        <div style={rowDate(T)}>{b.date}</div>
      </div>
      <div style={{ color: b.type === "in" ? T.good : T.danger, fontFamily: F.mono, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
        {b.type === "in" ? "+" : "-"}{fmtWon(b.amount)}
      </div>
      <IconBtn label={`${kind} ${b.memo || ""} ${fmtWon(b.amount)} 삭제`} color={T.danger} onClick={onDelete}><Trash2 size={15} aria-hidden="true" /></IconBtn>
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
    else {
      // "최신순"은 실제 거래 날짜(date) 기준으로 최근 날짜가 위로 오는 게 맞는데, 예전엔
      // createdTime(=이 기록이 앱에 실제로 만들어진 시각)로만 정렬했음 — 자동이체처럼
      // 결제일과 앱에 실제로 반영된 시각이 어긋나는 항목이나, 나중에 지난 날짜로 수정한
      // 기록이 날짜 순서를 무시하고 계속 위쪽(또는 엉뚱한 자리)에 떠 있는 것처럼 보였음.
      // date는 항상 "YYYY-MM-DD"라 문자열 비교로 날짜순 정렬이 되고, 같은 날짜끼리는
      // 기존처럼 등록 시각으로 순서를 정함.
      items.sort((a, b) => {
        const byDate = b.item.date.localeCompare(a.item.date);
        return byDate !== 0 ? byDate : b.sortTime - a.sortTime;
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryExpenses, categoryReceivables, categoryBalance, amountSort]);

  /*
    합계는 내가 부담한 금액(netAmount)으로 낸다. 줄마다 보이는 숫자는 실제
    결제액이라 단순히 더하면 이 합계와 다른데, 그 차이가 곧 돌려받은 돈이다.
    그래서 아래 총계 옆에 얼마를 뺐는지 적어 준다 — 안 적으면 '이 줄들을
    더하면 이 금액이 아닌데?'가 된다. 이 저장소에서 세 번 나온 병이다.
  */
  const totalSpent = categoryExpenses.reduce((s, e) => s + netAmount(e), 0);
  const reimbursedInView = categoryExpenses.reduce((s, e) => s + Number(e.reimbursedAmount || 0), 0);
  const receivableTotal = categoryReceivables.reduce((s, e) => s + Number(e.amount), 0);
  // 카드값 실제 구성 = 카드로 기록된 지출 전액 + 대리결제 정산에서 모자라게 받아 카드값에
  // 얹힌 부분만(초과분·정산 전·정확히 받은 건은 카드값에 안 잡히므로 제외).
  const cardShortfallReceivables = categoryReceivables.filter((e) => e.settled && Number(e.repaidAmount) - Number(e.amount) < 0);
  const cardSettledShortfall = cardShortfallReceivables.reduce((s, e) => s + (Number(e.amount) - Number(e.repaidAmount)), 0);
  const cardListTotal = categoryExpenses.reduce((s, e) => s + netAmount(e), 0) + cardSettledShortfall;
  // "카드값에 반영된 지출 합계"에 카드 지출뿐 아니라 부족분이 카드값에 얹힌 대리결제도
  // 금액으로는 들어가 있는데, 옆의 건수는 카드 지출 개수만 세고 있어서 "전체 흐름"에서
  // 있었던 것과 같은 건수·금액 불일치가 있었음 — 부족분에 걸린 대리결제 건수도 같이 셈.
  const cardListCount = categoryExpenses.length + cardShortfallReceivables.length;
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
      if (exp.reimbursementBalanceId) {
        next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.reimbursementBalanceId);
      }
      if ((exp.paymentMethod || "cash") === "card") {
        const cid = exp.cardId || data.cards[0]?.id;
        next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.amount)) } : c));
        // "정기결제 카드반영" 항목을 홈의 완료취소 대신 여기서 바로 지우면, 원래 고정지출의
        // paidMonths가 이미 없어진 이 항목을 계속 가리키게 됨 — 그 연결을 같이 끊어줌.
        // 이번 달만 보면 안 된다(2026-09-11): 자동 등록은 결제가 일어난 달에 표시를
        // 적으므로(12/31 결제를 1/1에 읽으면 12월), 지난달 표시가 남아 그 달이 계속
        // 처리된 것으로 보였다. 이 기록을 가리키는 표시면 달과 상관없이 푼다.
        if (exp.isCardAdjustment) {
          next.fixedExpenses = data.fixedExpenses.map((x) => {
            const months = Object.keys(x.paidMonths || {}).filter((k) => x.paidMonths[k] === id);
            if (!months.length) return x;
            const pm = { ...x.paidMonths };
            months.forEach((k) => delete pm[k]);
            return { ...x, paidMonths: pm };
          });
        }
      } else if (exp.linkedBalanceId) {
        // 은행 알림으로 들어온 출금(auto)에 이어 둔 지출이면 그 출금은 남긴다 — 은행이
        // 알려 준 실제 돈의 움직임이라, 지출 기록을 지운다고 없던 일이 되지 않는다
        const linkedB = (data.balanceEntries || []).find((b) => b.id === exp.linkedBalanceId);
        if (!linkedB?.auto) {
          next.balanceEntries = (next.balanceEntries || data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
        }
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
  const [reimburseInput, setReimburseInput] = useState("");
  const [reimburseOpen, setReimburseOpen] = useState(false);

  // 수정 폼을 켠 채로 기간/카테고리 필터를 바꾸면 그 항목이 목록에서 잠깐 사라졌다가,
  // 필터를 원래대로 되돌렸을 때 editingId가 그대로 남아있어서 수정 폼이 예고 없이 다시
  // 열려 있는 것처럼 보였음 — 필터가 바뀌면 수정 중이던 상태를 닫아버림.
  useEffect(() => { setEditingId(null); }, [timeScope, category, search]);

  // 대신 내준 돈을 나중에 돌려받았을 때 여기서 바로 기록 — 카드/현금 상관없이 아무
  // 지출에나 쓸 수 있음. 원래 지출 금액은 그대로 두고(카드값/통장 차감은 실제로 있었던
  // 일이니까), 돌려받은 돈만 순수 입금으로 남김. 그래서 부족분/초과분 나눌 필요가 없음 —
  // 얼마를 돌려받든 그냥 그만큼 입금.
  const confirmReimburse = (exp) => {
    const n = Number(reimburseInput);
    if (!n || n <= 0) return showToast("받은 금액을 입력해주세요");
    const aid = data.accounts?.[0]?.id;
    const entryId = "b" + Date.now();
    const catName = data.categories.find((c) => c.id === exp.categoryId)?.name || "지출";
    const entry = { id: entryId, type: "in", amount: n, date: todayISO(), memo: `${exp.memo || catName} 대리결제 정산`, accountId: aid };
    persist({
      ...data,
      balanceEntries: [...(data.balanceEntries || []), entry],
      expenses: data.expenses.map((x) => (x.id === exp.id ? { ...x, reimbursedAmount: n, reimbursedAt: todayISO(), reimbursementBalanceId: entryId } : x)),
    });
    setReimburseInput("");
    setReimburseOpen(false);
    showToast(`${fmtWon(n)} 받은 걸로 기록했어요`);
  };
  const cancelReimburse = (exp) => {
    if (!window.confirm("정산 기록을 취소할까요? 통장에 들어온 입금 기록도 같이 삭제돼요.")) return;
    persist({
      ...data,
      balanceEntries: (data.balanceEntries || []).filter((b) => b.id !== exp.reimbursementBalanceId),
      expenses: data.expenses.map((x) => (x.id === exp.id ? { ...x, reimbursedAmount: null, reimbursedAt: null, reimbursementBalanceId: null } : x)),
    });
    showToast("정산 기록을 취소했어요");
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setEditAmount(String(e.amount));
    setEditCategoryId(e.categoryId);
    setEditDate(e.date);
    setEditMemo(e.memo || "");
    setEditPaymentMethod(e.paymentMethod || "cash");
    // e.cardId가 그 사이에 삭제된 카드를 가리키고 있으면(설정에서 카드 삭제 가능)
    // 셀렉트가 아무것도 안 고른 것처럼 보이다가, 안 건드리고 저장하면 어느 카드에도
    // 실제로는 반영이 안 되는데 "반영됐어요" 토스트만 뜨는 조용한 실패로 이어짐.
    const cardStillExists = data.cards.some((c) => c.id === e.cardId);
    setEditCardId(cardStillExists ? e.cardId : data.cards[0]?.id || "");
    const linked = e.linkedBalanceId ? (data.balanceEntries || []).find((b) => b.id === e.linkedBalanceId) : null;
    setEditAccountId(linked?.accountId || data.accounts[0]?.id || "");
    setReimburseInput(String(e.amount));
    setReimburseOpen(false);
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = (exp) => {
    const n = Number(editAmount);
    if (!n || n <= 0) return showToast("금액을 입력해주세요");
    if (!editCategoryId) return showToast("카테고리를 선택해주세요");
    if (editPaymentMethod === "card" && !editCardId) return showToast("카드를 선택해주세요");
    if (editPaymentMethod === "cash" && !editAccountId) return showToast("통장을 선택해주세요");

    let next = { ...data };
    // 은행 알림으로 들어온 출금(auto)에 이어 둔 지출이면 그 출금은 건드리지 않는다.
    // 예전엔 수정할 때마다 딸린 출금을 지우고 새로 만들어서, 은행이 알려 준 기록이
    // 앱이 만든 기록으로 바뀌어 버렸다(자동 표시도, 은행 날짜·금액도 사라짐).
    const linkedB = exp.linkedBalanceId ? (data.balanceEntries || []).find((b) => b.id === exp.linkedBalanceId) : null;
    const keepBank = !!linkedB?.auto;
    if ((exp.paymentMethod || "cash") === "card") {
      const oldCid = exp.cardId || data.cards[0]?.id;
      next.cards = data.cards.map((c) => (c.id === oldCid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - Number(exp.amount)) } : c));
    } else if (exp.linkedBalanceId && !keepBank) {
      next.balanceEntries = (data.balanceEntries || []).filter((b) => b.id !== exp.linkedBalanceId);
    }

    const catName = data.categories.find((c) => c.id === editCategoryId)?.name || "지출";
    let newLinkedBalanceId = null;
    if (editPaymentMethod === "card") {
      next.cards = (next.cards || data.cards).map((c) => (c.id === editCardId ? { ...c, bill: Number(c.bill || 0) + n } : c));
    } else if (keepBank) {
      newLinkedBalanceId = linkedB.id;   // 은행 기록은 그대로, 연결만 유지
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

  // 자동이체/출금처리로 생긴 balanceEntry는 linkedFixedId·linkedFixedMonth로 원래
  // 고정지출의 paidMonths를 가리킴 — 여기서 지워도 그쪽 마커는 안 지워지면(홈에서
  // "완료" 표시가 실제로는 없는 기록을 계속 가리키게 됨) 카드반영 삭제 때와 같은
  // 문제라 똑같이 정리해줌.
  const clearLinkedFixedMarker = (b, next) => {
    if (!b.linkedFixedId || !b.linkedFixedMonth) return next;
    return {
      ...next,
      fixedExpenses: (next.fixedExpenses || data.fixedExpenses).map((x) => {
        if (x.id !== b.linkedFixedId || x.paidMonths?.[b.linkedFixedMonth] !== b.id) return x;
        const pm = { ...x.paidMonths };
        delete pm[b.linkedFixedMonth];
        return { ...x, paidMonths: pm };
      }),
    };
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
    let next = { ...data, balanceEntries: data.balanceEntries.filter((x) => x.id !== id) };
    next = clearLinkedFixedMarker(b, next);
    persist(next);
    showToast("삭제했어요");
  };

  // 셀렉트 하나로 눈에 잘 안 띄지만 다크 배경에서도 읽히게 최소한의 스타일만 입힌 것 —
  // 원래 있던 카테고리/카드/통장 칩 버튼들을 이걸로 바꿔서 편집 폼 세로 길이를 크게 줄임.
  const editSelectSty = { flex: 1, background: "#fff", border: `1px solid ${T.paperLine}`, borderRadius: 10, padding: "10px 12px", color: T.ink, fontSize: 15, outline: "none" };

  const renderEditForm = (e) => (
    <div style={{ marginTop: 8, marginBottom: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <MoneyInput value={editAmount} onChange={setEditAmount} />
        <select value={editPaymentMethod} disabled={e.isCardAdjustment} onChange={(ev) => setEditPaymentMethod(ev.target.value)}
          style={{ ...editSelectSty, flex: "0 0 84px", opacity: e.isCardAdjustment ? 0.6 : 1 }}>
          <option value="card">카드</option>
          <option value="cash">현금</option>
        </select>
      </div>
      {e.isCardAdjustment && (
        <div style={{ color: T.ink, fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          정기결제 카드반영으로 생긴 항목이라 결제수단은 못 바꿔요. 금액·메모는 고칠 수 있어요.
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <select value={editCategoryId} onChange={(ev) => setEditCategoryId(ev.target.value)} style={editSelectSty}>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {editPaymentMethod === "card" ? (
          <select value={editCardId} disabled={e.isCardAdjustment} onChange={(ev) => setEditCardId(ev.target.value)} style={{ ...editSelectSty, opacity: e.isCardAdjustment ? 0.6 : 1 }}>
            {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : data.accounts.length > 1 ? (
          <select value={editAccountId} onChange={(ev) => setEditAccountId(ev.target.value)} style={editSelectSty}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input type="date" value={editDate} onChange={(ev) => setEditDate(ev.target.value)} style={{ ...inputSty(T), flex: "0 0 132px", background: "#fff", color: T.ink, border: `1px solid ${T.paperLine}` }} />
        <input value={editMemo} onChange={(ev) => setEditMemo(ev.target.value)} placeholder="표기내역" style={{ ...inputSty(T), background: "#fff", color: T.ink, border: `1px solid ${T.paperLine}` }} />
      </div>

      {e.reimbursedAmount != null ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: T.good, fontSize: 13, fontWeight: 700 }}>정산받음 {fmtWon(e.reimbursedAmount)}</span>
          <button onClick={() => cancelReimburse(e)} style={{ background: "none", border: "none", cursor: "pointer", color: T.ink, fontSize: 12, textDecoration: "underline" }}>취소</button>
        </div>
      ) : !reimburseOpen ? (
        <button onClick={() => setReimburseOpen(true)}
          style={{ width: "100%", padding: "7px 0", borderRadius: 8, border: `1px dashed ${T.good}`, background: "transparent", color: T.good, fontSize: 13, fontWeight: 700, marginBottom: 8, cursor: "pointer" }}>
          미리정산하기
        </button>
      ) : (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <MoneyInput value={reimburseInput} onChange={setReimburseInput} placeholder="받은 금액" />
          <button onClick={() => confirmReimburse(e)} style={{ ...primaryBtn(T), width: 60, background: T.good, color: T.mode === "dark" ? "#000000" : "#FFFFFF" }}>확인</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={cancelEdit} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.ink, fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => saveEdit(e)} style={{ flex: 2, ...primaryBtn(T), padding: "9px 0" }}>저장</button>
        <button onClick={() => { if (remove(e.id)) setEditingId(null); }} aria-label="이 기록 삭제" style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, width: 40, height: 40, marginInline: -8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, }}><Trash2 size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );

  let totalsLine = null;
  if (category === "card") totalsLine = (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700 }}>카드값에 반영된 지출 합계 {fmtWon(cardListTotal)} · {cardListCount}건</div>
      {reimbursedInView > 0 && <div style={{ color: T.good, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>정산받은 {fmtWon(reimbursedInView)}은 뺐어요</div>}
    </div>
  );
  else if (category === "receivable") totalsLine = <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>합계 {fmtWon(receivableTotal)} · {categoryReceivables.length}건</div>;
  else if (category === "balance") totalsLine = (
    <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>
      <span style={{ color: T.good }}>입금 합계 {fmtWon(balanceInTotal)}</span> · <span style={{ color: T.danger }}>출금 합계 {fmtWon(balanceOutTotal)}</span>
    </div>
  );
  else totalsLine = (
    // totalSpent는 순수 지출(kind:"expense")만 더한 값인데, 예전엔 옆의 건수를
    // combined.length(대리결제·입출금까지 섞인 전체 표시 줄 수)로 보여줘서 "이 N건을
    // 더하면 이 금액"처럼 보이는 게 실제로는 성립 안 했음(예: 67건인데 그중 일부만
    // 지출 합계에 들어감) — 건수도 실제로 더해진 지출 개수로 맞춤.
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: T.goldSoft, fontSize: 14.5, fontWeight: 700 }}>총 지출 {fmtWon(totalSpent)} · {categoryExpenses.length}건</div>
      {reimbursedInView > 0 && <div style={{ color: T.good, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>정산받은 {fmtWon(reimbursedInView)}은 뺐어요</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0, color: T.cream, fontFamily: F.display, fontSize: 20.5, fontWeight: 700 }}>전체 내역</h1>
        {/* 좁은 화면(320px)에서 검색 버튼이 화면 밖으로 잘렸다 — 이제 '전체 흐름' 칸이 줄어든다 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", minWidth: 0 }}>
          <div role="group" aria-label="기간" style={{ display: "flex", flexShrink: 0, background: T.bg2, borderRadius: 8, padding: 3 }}>
            {[["cycle", "이번달"], ["all", "전체"], ["range", "기간"]].map(([k, l]) => (
              <button key={k} onClick={() => setTimeScope(k)} aria-pressed={timeScope === k}
                style={{ border: "none", borderRadius: 6, padding: "0 10px", minHeight: 32, fontSize: 14, fontWeight: 600,
                  background: timeScope === k ? T.gold : "transparent", color: timeScope === k ? T.onGold : T.muted, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="보기"
            style={{ flex: "1 1 auto", minWidth: 0, border: "none", borderRadius: 8, padding: "0 8px", minHeight: 38, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              background: category === "all" ? T.bg2 : T.gold, color: category === "all" ? T.muted : T.onGold }}>
            <option value="all">전체 흐름</option>
            <option value="card">카드</option>
            <option value="receivable">대리결제</option>
            <option value="balance">입출금</option>
          </select>
          <button onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(""); }}
            aria-label={searchOpen ? "검색 닫기" : "검색"} aria-expanded={searchOpen}
            style={{ flexShrink: 0, border: "none", borderRadius: 8, width: 38, height: 38, cursor: "pointer", background: searchOpen ? T.gold : T.bg2, color: searchOpen ? T.onGold : T.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Search size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="메모나 카테고리로 검색" aria-label="검색어" type="search" autoFocus
          style={{ ...inputSty(T), marginBottom: 14, fontSize: 16 }} />
      )}

      {timeScope === "range" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} aria-label="시작 날짜" style={{ ...inputSty(T), fontSize: 14, padding: "8px 10px" }} />
          <span aria-hidden="true" style={{ color: T.muted, fontSize: 13.5 }}>~</span>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} aria-label="끝 날짜" style={{ ...inputSty(T), fontSize: 14, padding: "8px 10px" }} />
        </div>
      )}

      <div role="group" aria-label="정렬" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["date", "최신순"], ["amountDesc", "높은금액순"], ["amountAsc", "낮은금액순"]].map(([k, l]) => (
          <button key={k} onClick={() => setAmountSort(k)} aria-pressed={amountSort === k}
            style={{ border: "none", borderRadius: 8, padding: "0 12px", minHeight: 32, fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: amountSort === k ? T.gold : T.bg2, color: amountSort === k ? T.onGold : T.muted }}>
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
                  <div style={{ color: T.inkMuted, fontSize: 14 }}>{c.name}</div>
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
                  <span>{f.name}{f.info.label ? ` · ${f.info.label}` : ""} · {data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드"}{f.info.isLast && <span style={{ color: T.warn, fontSize: 12, fontWeight: 700, marginLeft: 4 }}>마지막</span>}</span>
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
            if (kind === "balance") return <BalanceRow key={item.id} b={item} accountName={data.accounts.length > 1 ? data.accounts.find((a) => a.id === (item.accountId || data.accounts[0]?.id))?.name : null} onDelete={() => removeBalance(item.id)} />;
            if (kind === "receivable") return <ReceivableRow key={item.id} ctx={ctx} e={item} cat={catMap[item.categoryId]} onDelete={() => remove(item.id)} />;
            return (
              <div key={item.id}>
                <LedgerRow e={item} cat={catMap[item.categoryId]}
                  methodLabel={(item.paymentMethod || "cash") === "card" ? (data.cards.find((c) => c.id === (item.cardId || data.cards[0]?.id))?.name || "카드") : "현금"}
                  methodColor={(item.paymentMethod || "cash") === "card" ? T.gold : T.good}
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
