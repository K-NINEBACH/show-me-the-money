// Home tab: balance card, spending-goal ring, card bills, transit quick-add,
// plus the money-moving actions (settle, reconcile, pay card, mark fixed paid).
import { useState, useEffect, useRef } from "react";
import { HandCoins, Wallet, ArrowDownCircle, ArrowUpCircle, Repeat, ClipboardPaste, ChevronRight, Check, Landmark, ShieldCheck, Sprout, AlertCircle, Plus, Minus, Equal } from "lucide-react";
import { useTheme, F, inputSty, primaryBtn, tone, card } from "../lib/theme";
import { fmtWon, monthLabel, todayISO, parsePaymentText, sortFixedList, fixedInfo, nextDayOfMonth } from "../lib/data";
import { MoneyInput, QuickAmountButtons } from "../components/common";
import { syncMoment } from "../lib/auto-record";
import { parseStatement, reconcileStatement } from "../lib/statement";

export function HomeView({ ctx }) {
  const T = useTheme();
  const { data, curKey, dayIntoCycle, cycleLen,
    fixedActive, fixedCardActive, cardTotals, receivables, accountBalance, unpaidFixed, unpaidFixedSum, todaySpent, cardBillTotal } = ctx;

  /*
    **홈의 큰 숫자는 식 두 개다**(2026-09-14, 사용자 요청으로 둘 다 크게).

    1) 다음 달 월급 기준(Hero·AssetList) — 이 앱을 만든 이유. "다음 달 월급이 들어온다는 전제로"
       카드를 쓰니, 이번 달 카드값 + 다음 달 고정지출이 그 월급을 넘지 않아야 한다.
    2) 지금 통장 기준(Hero 아래 작은 줄, 2026-09-13) — 나갈 카드값·고정지출을 지금 통장으로 다 내면.
       "통장금액보다 카드값이 더 높지만 않으면 되거든. 적어도 적자는 안 나게."
       '월급 전까지'가 아니다 — 안 낸 카드값(bill)엔 월급 뒤에 나갈 이번 달 사용분도 들어 있다.

    세 줄을 다 보여 주는 이유 — 결과만 있으면 왜 그 숫자인지 몰라서 믿기 어렵고, 틀렸을 때
    어디가 틀렸는지(잔액? 카드값?)도 못 찾는다.

    통장 기준에서
    · 카드값은 **아직 안 낸 것** 전부다(bill + 이번 달 할부 몫). 지난달 걸 아직 안 냈으면
      그것도 통장에서 나갈 돈이라 들어간다. 그래서 '이번 달 카드값'이 아니라 '안 낸 카드값'.
    · 고정지출은 **아직 안 나간 것**만이다. 이미 나간 건 통장 잔액에 이미 빠져 있다.
    · 월초(5일까지) 이번 달 몫 월급이 아직 안 들어왔으면 그 월급을 더한다(payPending) —
      안 그러면 월급 들어오기 전 며칠 동안 통장이 모자라다고 겁을 준다.
    · 통장 잔액은 은행 알림의 잔액으로 저절로 맞춰진다(auto-record.js syncBank).
  */
  // 식은 App.jsx의 ctx에 있다 — 위젯·아침 알림이 같은 숫자를 쓰기 위해서다(2026-09-17)
  const left = ctx.bankLeft;
  const short = left < 0;
  const bankKnown = ctx.bankKnown;
  const daysLeft = ctx.daysLeft;

  /*
    **맨 위 한 장 — 다음 달 월급 기준, 통장까지 합쳐서**(2026-09-14, 사용자 선택).

    사용자 요청 둘이 한 식으로 모였다 — "다음달 급여 들어오면 얼마 여유분 있는지"와 "다음달
    월급기준에 현재 내 통장잔고도 넣어야 되는 거 아닌가". 통장을 넣으려면 통장에서 먼저 나갈 돈
    (안 낸 카드값, 이번 달 안 나간 고정지출)도 같이 빼야 맞으므로, 결국 아래 통장 기준 결과에
    다음 달 월급을 더하고 다음 달 고정지출을 뺀 값이 된다.
      카드로 더 써도 되는 돈 = 통장 기준 잔여금액 + 다음 달 월급 − 다음 달 고정지출(통장 + 카드)
    · 다음 달 고정지출은 **통장 + 카드(할부 몫·정기결제)** 둘 다다. 카드 쪽은 청구가 그다음 달이라
      처음엔 뺐는데, 다음 달에 어차피 긁힐 돈이라 미리 빼는 게 맞다(사용자 지적).
    · 이번 달 카드 사용분(다음 달 청구)은 이미 '안 낸 카드값'에 들어 있어서 또 안 뺀다.
    · 월급이 이미 들어왔으면(payIn) 통장 잔액에 들어 있으니 0원으로 적고 더하지 않는다.
    · 처음 목적인 '월급만으로'(payLeft = 다음 달 월급 − 다음 달 통장 고정지출 − 이번 달 카드값)는
      작은 줄로 남긴다.
  */
  const nextM = `${Number(ctx.nextKey.slice(5, 7))}월`;
  const hasPay = ctx.hasPay;
  const top = {
    month: nextM,
    curMonth: `${Number(curKey.slice(5, 7))}월`,
    pay: ctx.payIn ? 0 : ctx.nextPay,
    tag: ctx.payIn ? `${Number(ctx.payIn.date.slice(5, 7))}/${Number(ctx.payIn.date.slice(8, 10))} 들어옴 · 통장 잔액에 포함` : "예상",
    fixedCash: ctx.nextFixedCash,
    fixedCard: ctx.nextFixedCard,
    value: ctx.canSpend,
  };
  /*
    **한눈에 — 누르지 않고 다 보이게**(2026-09-14, 사용자: "굳이 추가적인 제스처나 행동, 입력 없이
    자동으로 나의 자산(통장, 카드값, 잔여 여유분 등등)을 한눈에 쉽게 볼 수 있는 게 핵심").

    바로 전 판(컴팩트 홈)은 짧았지만 숫자를 보려면 '계산 보기'나 타일을 눌러야 했다. 이제
      · 맨 위: 카드로 더 써도 되는 돈(큰 숫자) + 하루 몫.
      · 그 아래 '한눈에' 목록(`AssetList`)이 **늘 펼쳐져 있다** — 통장(통장별), 다음 달 월급,
        안 낸 카드값(카드별), 이번 달 남은 고정지출(이름까지), 다음 달 고정지출. 목록 순서와 부호가
        곧 위 큰 숫자의 식이라 '계산 보기'가 따로 필요 없다.
      · 누르는 건 가끔 하는 조작뿐: 통장 입출금·맞추기 / 카드 결제·명세서 / 고정지출 처리.
    화면이 길어지지 않게 줄은 촘촘히, 상자 안에 상자를 넣지 않는다.
  */
  const [panel, setPanel] = useState(null);
  const [transitOpen, setTransitOpen] = useState(false);
  const panelRef = useRef(null);
  const openPanel = (k) => {
    const next = panel === k ? null : k;
    setPanel(next);
    if (next) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const hasFixed = fixedActive.length > 0 || fixedCardActive.length > 0 || receivables.length > 0 || (ctx.fixedSkipped || []).length > 0;
  // 새 디자인(2026-09-26): 가장 자주 쓰는 '입출금·맞추기'만 채운 초록, 나머지는 흰 테두리 버튼
  const actBtn = (on, primary) => ({
    flex: 1, minWidth: 0, minHeight: 46, padding: "6px 4px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
    border: primary ? "none" : `1px solid ${on ? T.gold : T.border}`,
    background: primary ? T.gold : on ? tone(T, "good").tint : T.bg2,
    color: primary ? T.onGold : T.cream, fontSize: 13.5, fontWeight: 700, boxShadow: T.shadow || "none",
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, color: T.cream, fontFamily: F.display, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          {monthLabel(curKey)} · {dayIntoCycle}일차
        </h1>
        {/* '오늘'은 아래 막대로 옮겼다(2026-09-21) — 같은 숫자가 두 군데 있으면 눈이 어디를 봐야 할지 모른다 */}
        <div style={{ textAlign: "right", lineHeight: 1.3 }}>
          <div style={{ color: T.muted, fontSize: 11.5 }}>이번 달 쓴 돈</div>
          <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtWon(ctx.totalSpentThisMonth)}</div>
        </div>
      </div>

      <Hero T={T} ctx={ctx} top={top} hasPay={hasPay} bankKnown={bankKnown} left={left} daysLeft={daysLeft} />

      <SyncNudge T={T} ctx={ctx} cardTotals={cardTotals} onOpen={() => openPanel("card")} />

      <AssetList T={T} ctx={ctx} top={top} hasPay={hasPay} accounts={ctx.accountTotals || []} cardTotals={cardTotals}
        balance={accountBalance} cardBill={cardBillTotal} unpaidFixed={unpaidFixed} unpaidFixedSum={unpaidFixedSum} pending={ctx.payPending} />

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => openPanel("bank")} aria-expanded={panel === "bank"} aria-controls="home-panel" style={actBtn(panel === "bank", true)}>입출금·맞추기</button>
        <button onClick={() => openPanel("card")} aria-expanded={panel === "card"} aria-controls="home-panel" style={actBtn(panel === "card")}>카드 결제·명세서</button>
        <button onClick={() => openPanel("fixed")} aria-expanded={panel === "fixed"} aria-controls="home-panel" style={actBtn(panel === "fixed")}>
          고정지출 처리{unpaidFixed.length ? <span style={{ color: T.warn, fontFamily: F.mono }}> {unpaidFixed.length}</span> : ""}
        </button>
      </div>

      {panel && (
        <div ref={panelRef} id="home-panel" style={{ marginTop: 10, scrollMarginTop: 12 }}>
          {panel === "bank" && (
            <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <BalanceCard ctx={ctx} accountBalance={accountBalance} compact />
            </div>
          )}
          {panel === "card" && (
            <>
              <CardsBlock ctx={ctx} cardTotals={cardTotals} />
              <button onClick={() => setTransitOpen(!transitOpen)} aria-expanded={transitOpen}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: `1px dashed ${T.border}`, borderRadius: 10, padding: "9px 12px", color: T.muted, fontSize: 13.5, cursor: "pointer", marginBottom: 10 }}>
                <span>대중교통 누적 금액 입력</span><span aria-hidden="true">{transitOpen ? "▲" : "▼"}</span>
              </button>
              {transitOpen && <TransitQuickAdd ctx={ctx} />}
            </>
          )}
          {panel === "fixed" && (
            hasFixed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(fixedActive.length > 0 || fixedCardActive.length > 0 || (ctx.fixedSkipped || []).length > 0) && (
                  <FixedDetailCard ctx={ctx} fixedActive={fixedActive} fixedCardActive={fixedCardActive} />
                )}
                {receivables.length > 0 && <ReceivablesCard ctx={ctx} receivables={receivables} catMap={catMap} />}
              </div>
            ) : (
              <div style={{ color: T.muted, fontSize: 14, textAlign: "center", padding: "14px 0" }}>고정지출이 없어요 · 기록 탭에서 등록해요</div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/*
  **맞출 때가 됐다고 앱이 먼저 말한다**(2026-09-20).

  알림이 안 오는 결제(하이패스·일부 자동결제)가 매달 몇 만 원씩 생겨서, 카드값은 가만히 두면
  점점 실제보다 적어진다(9/17~9/19 사흘에 57,000원이 그랬다). 사람이 '언제 맞춰야 하지'를
  기억할 필요가 없게, **결제일이 사흘 안으로 다가왔거나 마지막으로 맞춘 지 일주일이 넘으면**
  한 줄로 띄운다. 누르면 카드 칸이 열린다(거기서 명세서 붙여넣기·맞추기를 한다).
*/
function SyncNudge({ T, ctx, cardTotals, onOpen }) {
  const week = 7 * 86400000;
  const need = cardTotals
    .map((c) => {
      const due = nextDayOfMonth(c.payDay);
      const old = !c.syncedAtMs || Date.now() - c.syncedAtMs > week;
      if (Number(c.total || 0) <= 0) return null;          // 낼 게 없으면 맞출 것도 없다
      if (due && due.days <= 3) return { c, why: `${due.label} 결제까지 ${due.days === 0 ? "오늘" : `${due.days}일`}`, soon: true };
      if (old) return { c, why: c.syncedAtMs ? `카드 앱과 맞춘 지 ${Math.round((Date.now() - c.syncedAtMs) / 86400000)}일` : "카드 앱과 맞춘 적 없음" };
      return null;
    })
    .filter(Boolean);
  if (!need.length) return null;
  const t = tone(T, need.some((n) => n.soon) ? "warn" : "good");
  // 새 디자인(2026-09-26): 흰 카드 + 동그란 방패 아이콘 + 오른쪽 화살표 — 누르면 카드 칸이 열린다
  return (
    <button onClick={onOpen}
      style={{ ...card(T), width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", marginTop: 12, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: t.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ShieldCheck size={18} color={t.text} strokeWidth={2.2} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: T.cream, fontSize: 13.5, fontWeight: 700 }}>
          {need.map((n) => `${n.c.name} · ${n.why}`).join("  /  ")}
        </span>
        <span style={{ display: "block", color: T.muted, fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>
          카드 앱 '결제 예정 금액'과 한 번 맞춰 보세요.
        </span>
      </span>
      <ChevronRight size={18} color={T.muted} aria-hidden="true" style={{ flexShrink: 0 }} />
    </button>
  );
}

const cardBox = (T, bad) => ({ background: T.bg2, border: `1.5px solid ${(bad ? T.danger : T.good)}77`, borderRadius: 14, padding: "12px 16px 14px" });
const cardTitle = (T) => ({ color: T.goldSoft, fontSize: 13.5, fontWeight: 700, marginBottom: 4 });

/*
  **맨 위 큰 카드** — 카드로 더 써도 되는 돈(통장 + 다음 달 월급 − 나갈 돈 전부). 계산은 App.jsx ctx.

  새 디자인(2026-09-26, 사용자가 보여 준 시안): 카드 전체가 **상태 색으로 옅게 물든다** —
  여유 초록 · 빠듯 주황 · 모자람 빨강. 한 카드 안의 순서가 곧 중요도다:
    ① 제목 + 하루 몫(오른쪽 작게) ② 아주 큰 숫자 ③ 오늘 쓴 돈 / 하루 몫 + 막대
    ④ 상태 한 줄(아이콘 동그라미) ⑤ 선 아래 비교 두 칸(월급만으로 · 지금 통장으로 다 내면)
*/
function Hero({ T, ctx, top, hasPay, bankKnown, left, daysLeft }) {
  const v = top.value;
  const short = hasPay && v < 0;
  const perDay = ctx.perDay;
  const signed = (n) => `${n < 0 ? "-" : ""}${fmtWon(Math.abs(n))}`;
  /*
    하루 몫이 빠듯한지 — 남의 평균이 아니라 **내가 이번 달 실제로 쓴 하루 평균**과 견준다.
    그보다 한참(60% 아래) 적으면 지금 속도로는 못 버틴다. 3일 전엔 평균이 안 믿을 만해서 안 본다.
  */
  const usedSoFar = ctx.normalSpent + ctx.cardSpentThisCycle;
  const avgDay = ctx.dayIntoCycle >= 3 ? Math.round(usedSoFar / ctx.dayIntoCycle) : 0;
  const tight = !short && avgDay > 0 && perDay < avgDay * 0.6;
  // 오늘 쓴 돈 / 하루 몫 — 하루 단위로 쓰는 도구라 제일 자주 보는 비교
  const today = Number(ctx.todaySpent || 0);
  const over = perDay > 0 && today > perDay;
  const ratio = perDay > 0 ? Math.min(1, today / perDay) : 0;

  const state = short ? "danger" : tight || !bankKnown ? "warn" : "good";
  const t = tone(T, state);
  const bar = over || perDay === 0 ? tone(T, "danger") : t;
  const num = { fontFamily: F.mono, fontVariantNumeric: "tabular-nums" };

  const status = !bankKnown
    ? { head: "통장 잔액을 먼저 맞춰 주세요", sub: "아래 '입출금·맞추기'에서 은행 잔액을 넣으면 숫자가 맞아요" }
    : short
      ? { head: "이번 달은 월급으로도 모자라요", sub: `${top.month} 월급이 들어와도 카드값·고정지출을 다 못 내요` }
      : tight
        ? { head: "이번 달은 빠듯해요", sub: `지금까지 하루 평균 ${fmtWon(avgDay)} 썼어요` }
        : avgDay > 0
          ? { head: "이번 달은 여유 있어요!", sub: `지금까지 하루 평균 ${fmtWon(avgDay)} 썼어요` }
          : null;

  return (
    <section aria-label="카드로 더 써도 되는 돈"
      style={{ ...card(T), borderColor: `${t.fill}40`, borderRadius: 22, padding: "16px 18px 16px", background: `linear-gradient(165deg, ${t.tint} 0%, ${T.bg2} 72%)` }}>
      {!hasPay ? (
        <div style={{ color: T.warn, fontSize: 15, fontWeight: 700, padding: "6px 0" }}>설정에서 월급(실수령)을 적어 주세요</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: short ? t.text : T.cream, fontSize: 14.5, fontWeight: 700 }}>
              {short ? "월급 들어와도 모자라는 돈" : "카드로 더 써도 되는 돈"}
            </span>
            {!short && bankKnown && (
              <span style={{ color: T.muted, fontSize: 12, textAlign: "right", lineHeight: 1.4 }}>
                하루 <b style={{ ...num, color: T.cream }}>{fmtWon(perDay)}</b><br />· 말일까지 {daysLeft}일
              </span>
            )}
          </div>
          <div style={{ ...num, color: short ? t.text : T.cream, fontSize: 44, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.15, marginTop: 4 }}>
            {signed(v).replace(/원$/, "")}<span style={{ fontSize: 22, fontWeight: 700, marginLeft: 2, fontFamily: F.body }}>원</span>
          </div>

          {bankKnown && (
            <div style={{ marginTop: 10 }}>
              <div style={{ color: T.muted, fontSize: 12.5 }}>
                오늘 <b style={{ ...num, color: T.cream }}>{fmtWon(today)}</b>
                {perDay === 0
                  ? <span style={{ color: bar.text }}> · 오늘 쓸 몫이 없어요</span>
                  : <> / 하루 몫 {fmtWon(perDay)} · <b style={{ color: bar.text }}>{over ? `${fmtWon(today - perDay)} 더 썼어요` : `${fmtWon(perDay - today)} 남았어요`}</b></>}
              </div>
              {/* 쓸 몫이 없는 날엔 막대를 안 그린다 — 0을 채운 빈 막대는 '오늘은 괜찮다'로 읽힌다 */}
              {perDay > 0 && (
                <div style={{ height: 10, borderRadius: 6, background: T.paperLine || T.border, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${(over ? 1 : ratio) * 100}%`, height: "100%", background: bar.fill, borderRadius: 6 }} />
                </div>
              )}
            </div>
          )}

          {status && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, background: t.tint, borderRadius: 14, padding: "10px 12px" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: t.fill, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {state === "good" ? <Sprout size={16} color="#fff" strokeWidth={2.4} /> : <AlertCircle size={16} color="#fff" strokeWidth={2.4} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: t.text, fontSize: 13.5, fontWeight: 700 }}>{status.head}</span>
                <span style={{ display: "block", color: T.muted, fontSize: 12, marginTop: 1 }}>{status.sub}</span>
              </span>
            </div>
          )}
        </>
      )}
      {/* 비교 두 칸 — 선으로 위 숫자와 나눈다. 한 줄에 이으면 말 중간에서 끊겼다 */}
      <div style={{ display: "flex", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        {hasPay && (
          <div style={{ flex: 1, minWidth: 0, paddingRight: 10, borderRight: `1px solid ${T.border}` }}>
            <div style={{ color: T.muted, fontSize: 11.5 }}>통장 없이 {top.month} 월급만으로</div>
            <div style={{ ...num, color: ctx.payLeft < 0 ? T.danger : T.good, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{signed(ctx.payLeft)}</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, paddingLeft: hasPay ? 12 : 0, textAlign: hasPay ? "right" : "left" }}>
          <div style={{ color: T.muted, fontSize: 11.5 }}>지금 통장으로 다 내면</div>
          <div style={{ ...num, color: left < 0 ? T.danger : T.good, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{signed(left)}</div>
        </div>
      </div>
    </section>
  );
}

/*
  **한눈에 목록** — 누르지 않아도 늘 보인다. 줄 순서와 부호가 곧 위 큰 숫자의 식이다:
    통장 + 다음 달 월급 − 안 낸 카드값 − 이번 달 남은 고정지출 − 다음 달 고정지출 = 카드로 더 써도 되는 돈

  새 디자인(2026-09-26): 흰 카드 한 장 위에 묶음마다 **동그란 부호 표시**(+ 초록 · − 빨강 · 통장 아이콘)를
  달고, 묶음 사이는 여백과 옅은 선으로 끊는다. 하위 줄은 들여 쓴 흐린 글자로 금액을 세로로 맞춘다.
  (그 전 판의 교훈 — 이름을 쉼표로 줄줄이 잇지 말 것, 한 항목 한 줄, 큰 것 몇 개 + '그 밖에 N건'.)
*/
function AssetList({ T, ctx, top, hasPay, accounts, cardTotals, balance, cardBill, unpaidFixed, unpaidFixedSum, pending }) {
  const num = { fontFamily: F.mono, fontVariantNumeric: "tabular-nums" };
  const Badge = ({ kind, children }) => {
    const t = tone(T, kind);
    return (
      <span aria-hidden="true" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: t.tint, color: t.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </span>
    );
  };
  const Head = ({ icon, kind = "good", label, amount, tag, strong, sign }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <Badge kind={kind}>{icon}</Badge>
      <span style={{ flex: 1, minWidth: 0, color: T.cream, fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
        {tag && <span style={{ marginInlineStart: 6, fontSize: 11.5, color: T.muted, fontWeight: 500 }}>{tag}</span>}
      </span>
      <span style={{ ...num, flexShrink: 0, color: strong || T.cream, fontSize: 15.5, fontWeight: 700 }}>{fmtWon(amount)}</span>
    </div>
  );
  const Sub = ({ label, amount, tag, dim }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0 3px 38px" }}>
      <span style={{ flex: 1, minWidth: 0, color: dim || T.muted, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}{tag && <span style={{ marginInlineStart: 6, fontSize: 11.5, color: T.muted }}>{tag}</span>}
      </span>
      <span style={{ ...num, flexShrink: 0, color: dim || T.muted, fontSize: 13.5, fontWeight: 500 }}>{fmtWon(amount)}</span>
    </div>
  );
  const Note = ({ children, color }) => (
    <div style={{ color: color || T.muted, fontSize: 11.5, padding: "0 0 4px 38px", lineHeight: 1.5 }}>{children}</div>
  );
  const Group = ({ children, first }) => (
    <div style={{ padding: first ? "4px 0 10px" : "12px 0 10px", borderTop: first ? "none" : `1px solid ${T.paperLine || T.border}` }}>{children}</div>
  );

  /*
    고정지출 날짜 — 자동이체일(autoPayDay)이 있으면 그날, 없으면 **지난달에 며칠에 나갔는지**로 짐작.
    자동이체일이 적힌 건 그날 앱이 알아서 처리해 여기 안 남으므로, 남는 건 대개 날짜를 모르는 것들이다.
  */
  const todayDay = new Date().getDate();
  const dayOf = (f) => {
    if (f.autoPayDay) return { day: f.autoPayDay, guess: false };
    const id = f.paidMonths?.[ctx.prevKey];
    if (!id) return null;
    const e = (ctx.data.balanceEntries || []).find((b) => b.id === id) || (ctx.data.expenses || []).find((x) => x.id === id);
    const d = e?.date ? Number(String(e.date).slice(8, 10)) : 0;
    return d ? { day: d, guess: true } : null;
  };
  const days = new Map(unpaidFixed.map((f) => [f.id, dayOf(f)]));
  const overdue = unpaidFixed.filter((f) => (days.get(f.id)?.day || 99) < todayDay);
  // 날짜가 지난 것을 먼저, 그다음 큰 것부터 넷 — 홈은 한 화면에 들어와야 한다
  const unpaidSorted = [...unpaidFixed].sort((a, b) => {
    const la = (days.get(a.id)?.day || 99) < todayDay ? 0 : 1;
    const lb = (days.get(b.id)?.day || 99) < todayDay ? 0 : 1;
    return la - lb || Number(b.info.amount) - Number(a.info.amount);
  });
  const unpaidTop = unpaidSorted.slice(0, 4);
  const unpaidRest = unpaidSorted.slice(4);
  // 다음 달 고정지출 — 미리 냈거나 건너뛴 것은 빼고 큰 것부터(ctx.nextFixedCash/Card와 같은 기준)
  const nextAll = (ctx.data.fixedExpenses || [])
    .filter((f) => !(f.paidMonths && f.paidMonths[ctx.nextKey]) && !(f.skipMonths && f.skipMonths[ctx.nextKey]))
    .map((f) => ({ id: f.id, name: f.name, amount: Number(fixedInfo(f, ctx.nextKey).amount), active: fixedInfo(f, ctx.nextKey).active }))
    .filter((f) => f.active && f.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const nextTop = nextAll.slice(0, 3);
  const nextRest = nextAll.slice(3);
  const receivable = (ctx.receivables || []).reduce((a, r) => a + Number(r.amount || 0), 0);
  const resultBad = top.value < 0;

  return (
    <>
      <h2 style={{ margin: "20px 2px 8px", color: T.cream, fontSize: 16, fontWeight: 800 }}>한눈에</h2>
      <section aria-label="한눈에" style={{ ...card(T), padding: "8px 16px 6px" }}>
        <Group first>
          <Head icon={<Landmark size={15} strokeWidth={2.2} />} label="통장" amount={balance} />
          {accounts.length > 1 && accounts.map((a) => (
            <Sub key={a.id} label={`+ ${a.name}`} amount={a.balance} tag={a.bankSync ? `${agoAt(a.bankSync.at)} 맞춤` : null} />
          ))}
          {pending > 0 && <Sub label={`+ 아직 안 들어온 ${top.curMonth} 월급`} amount={pending} />}
        </Group>

        {hasPay && (
          <Group>
            <Head icon={<Plus size={15} strokeWidth={2.6} />} sign="더하기" label={`${top.month} 월급`} tag={top.tag} amount={top.pay} />
          </Group>
        )}

        <Group>
          <Head icon={<Minus size={15} strokeWidth={2.6} />} kind="danger" sign="빼기" label="안 낸 카드값" amount={cardBill} />
          {cardTotals.map((c) => {
            /*
              언제 나가는지, 언제 맞춘 숫자인지(2026-09-17). 카드값은 결제 확인·명세서·맞추기가 같은 한 칸을
              덮어써서 어긋나도 조용하다 — 통장의 '2시간 전 맞춤'처럼 기준 시각을 적고, 오래되면 색을 바꾼다.
            */
            const due = nextDayOfMonth(c.payDay);
            const old7 = c.syncedAtMs && Date.now() - c.syncedAtMs > 7 * 86400000;
            return (
              <div key={c.id}>
                <Sub label={c.name} amount={c.total}
                  tag={c.earlyPay && c.installPaid?.[ctx.curKey] ? "이번 달 할부 미리 냄" : c.fixedPortion > 0 ? `할부 ${fmtWon(c.fixedPortion)} 포함` : null} />
                {(due || c.syncedAtMs) && (
                  <Note>
                    {due && <span style={{ color: due.days <= 3 ? T.warn : T.muted }}>{due.label} 결제 · {due.days === 0 ? "오늘" : `${due.days}일 뒤`}</span>}
                    {due && c.syncedAtMs && " · "}
                    {c.syncedAtMs && <span style={{ color: old7 ? T.warn : T.muted }}>카드 앱과 {agoAt(c.syncedAtMs)} 맞춤</span>}
                  </Note>
                )}
              </div>
            );
          })}
          {/* 대리결제로 돌려받을 돈 — 카드값엔 들어 있지만 내 돈이 아니다. 식은 안 흔들고 설명 한 줄로 */}
          {receivable > 0 && <Note>이 중 정산받을 돈 {fmtWon(receivable)} — 돌려받으면 통장으로 들어와요</Note>}
        </Group>

        <Group>
          <Head icon={<Minus size={15} strokeWidth={2.6} />} kind={unpaidFixed.length ? "warn" : "good"} sign="빼기"
            label={`${top.curMonth} 남은 고정지출`} amount={unpaidFixedSum} strong={unpaidFixed.length ? T.warn : null} />
          {unpaidTop.map((f) => {
            const d = days.get(f.id);
            const late = d && d.day < todayDay;
            return <Sub key={f.id} label={`${f.name}${d ? ` · ${d.guess ? "지난달 " : ""}${d.day}일` : ""}`} amount={f.info.amount} dim={late ? T.warn : null} />;
          })}
          {unpaidRest.length > 0 && <Sub label={`그 밖에 ${unpaidRest.length}건`} amount={unpaidRest.reduce((a, f) => a + Number(f.info.amount), 0)} />}
          {overdue.length > 0 && <Note color={T.warn}>날짜가 지난 것 {overdue.length}건 — 냈으면 아래 '고정지출 처리'에서 눌러 주세요</Note>}
        </Group>

        {hasPay && (
          <>
            <Group>
              <Head icon={<Minus size={15} strokeWidth={2.6} />} kind="danger" sign="빼기" label={`${top.month} 고정지출`} amount={top.fixedCash + top.fixedCard} />
              {/*
                다음 달 것도 무엇이 들었는지(2026-09-21) — 300만 원이 덩어리로만 뜨면 왜 큰지 모른다.
                큰 것 셋 + 그 밖에. 미리 냈거나 건너뛴 것은 금액에서 이미 빠졌으니 여기서도 뺀다.
              */}
              {nextTop.map((f) => <Sub key={f.id} label={f.name} amount={f.amount} />)}
              {nextRest.length > 0 && <Sub label={`그 밖에 ${nextRest.length}건`} amount={nextRest.reduce((a, f) => a + f.amount, 0)} />}
              <Note>통장 {fmtWon(top.fixedCash)} · 카드 할부·정기결제 {fmtWon(top.fixedCard)}</Note>
            </Group>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 10px", borderTop: `1.5px solid ${T.border}` }}>
              <Badge kind={resultBad ? "danger" : "good"}><Equal size={15} strokeWidth={2.6} /></Badge>
              <span style={{ flex: 1, color: T.cream, fontSize: 15, fontWeight: 800 }}>{resultBad ? "월급 들어와도 모자라는 돈" : "카드로 더 써도 되는 돈"}</span>
              <span style={{ ...num, color: resultBad ? T.danger : T.good, fontSize: 18, fontWeight: 700 }}>{fmtWon(top.value)}</span>
            </div>
          </>
        )}
      </section>
    </>
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
              <MoneyInput value={repaidInput} onChange={setRepaidInput} autoFocus ariaLabel="실제 상환받은 금액" />
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
// Sort UI was dropped here — this list is usually short, so a fixed "큰 금액 먼저"
// order is enough and it saves a whole row of sort buttons every time you open it.
function FixedDetailCard({ ctx, fixedActive, fixedCardActive }) {
  const T = useTheme();
  const { data, curKey, persist, showToast } = ctx;
  /*
    **이번 달은 그냥 안 내고 넘어가기**(2026-09-19, 사용자: "모임회비 같은 건 가끔 여유가 없어서
    모른척 넘어갈 때도 있어"). 누르면 그 달 계산에서 통째로 빠지고(남은 고정지출·여유),
    다음 달엔 저절로 다시 나온다. 못 낸 돈이 쌓이지 않는다 — 안 낸 건 안 낸 것으로 끝.
    할부는 안 된다(내 마음대로 거를 수 있는 돈이 아니다).
  */
  const setSkip = (f, on) => {
    persist({ ...data, fixedExpenses: data.fixedExpenses.map((x) => (x.id === f.id
      ? { ...x, skipMonths: { ...(x.skipMonths || {}), [curKey]: on || undefined } } : x)) });
    showToast(on ? `${f.name}은 이번 달 건너뛰어요` : `${f.name}을 다시 셀게요`);
  };
  const combined = [...fixedActive, ...fixedCardActive];
  const sorted = sortFixedList(combined, "amountDesc");
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ color: T.muted, fontSize: 14, marginBottom: 4 }}>이번달 고정지출 상세내역</div>
      {(ctx.fixedSkipped || []).map((f) => (
        <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: T.muted, padding: "3px 0" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "line-through" }}>{f.name} <span style={{ fontSize: 12.5 }}>· 이번 달 건너뜀</span></span>
          <button onClick={() => setSkip(f, false)}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "0 8px", minHeight: 32, cursor: "pointer", color: T.muted, fontSize: 12.5, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 6 }}>
            되돌리기
          </button>
        </div>
      ))}
      {sorted.map((f) => {
        const isCard = (f.paymentMethod || "cash") === "card";
        const isRealInstallment = isCard && f.totalMonths > 0;
        const needsAction = !isRealInstallment;
        const paidId = f.paidMonths?.[curKey];
        /*
          **다음 달 몫을 미리 낸 상태**(2026-09-20, 사용자: "모임 회비 같은 건 저번 달 월말에
          미리 내는 경우도 있는데 그럴 땐 어떻게?"). 이번 달 것을 이미 처리했는데 또 냈다면
          그건 다음 달 몫이다 — 적어 두면 다음 달 고정지출·여유에서 빠져 두 번 안 빠진다.
          은행 알림으로 들어오면 앱이 알아서 그렇게 적는다(auto-record). 이 버튼은 현금으로 냈을 때용.
        */
        const nextPaid = !!f.paidMonths?.[ctx.nextKey];
        const nextInfo = fixedInfo(f, ctx.nextKey);
        const sourceName = isCard ? (data.cards.find((c) => c.id === (f.cardId || data.cards[0]?.id))?.name || "카드") : (data.accounts.find((a) => a.id === f.accountId)?.name || "통장");
        return (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14.5, color: T.cream, padding: "3px 0" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.name}{f.info.label ? ` ${f.info.label}` : ""} <span style={{ color: T.muted, fontSize: 12.5 }}>· {sourceName}</span>
              {f.info.isLast && <span style={{ color: T.warn, fontSize: 11.5, fontWeight: 700, marginLeft: 4 }}>마지막</span>}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 6 }}>
              <span style={{ fontFamily: F.mono, color: T.muted, fontSize: 13.5 }}>{fmtWon(f.info.amount)}</span>
              {needsAction && nextPaid && (
                <button onClick={() => { if (window.confirm(`${f.name} ${Number(ctx.nextKey.slice(5, 7))}월 몫을 미리 낸 걸 취소할까요?`)) unmarkFixedPaid(ctx, f, ctx.nextKey); }}
                  aria-label={`${f.name} 다음 달 몫 미리 냄 · 누르면 취소`}
                  style={{ background: "none", border: `1px solid ${T.good}`, borderRadius: 8, padding: "0 8px", minHeight: 32, cursor: "pointer", color: T.good, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  다음 달 미리 냄
                </button>
              )}
              {needsAction && paidId && !nextPaid && nextInfo.active && (
                <button onClick={() => markFixedPaid(ctx, f, nextInfo, ctx.nextKey)}
                  aria-label={`${f.name} 다음 달 몫 미리 내기`}
                  style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "0 8px", minHeight: 32, cursor: "pointer", color: T.muted, fontSize: 12.5, whiteSpace: "nowrap" }}>
                  다음 달 미리
                </button>
              )}
              {needsAction && (
                /*
                  '완료'는 상태처럼 보이지만 누르면 처리를 되돌린다 — 딸린 출금 기록
                  (알림에서 자동으로 들어온 것 포함)이 지워지고 카드값도 빠진다.
                  예전엔 확인 없이 바로 지워서, 목록을 훑다 스치기만 해도 기록이
                  사라졌고 되살릴 길이 없었다. 이제 무엇이 지워지는지 묻는다.
                  버튼도 손가락 크기로 키웠다(예전 높이 20px 남짓, 글자 11px).
                */
                paidId ? (
                  <button
                    onClick={() => {
                      // 알림으로 들어온 기록이면 지우지 않고 연결만 푼다 — 확인창도 그대로 말한다
                      const linked = (isCard ? data.expenses : data.balanceEntries || []).find((x) => x.id === paidId);
                      const what = isCard ? "카드 기록" : "출금 기록";
                      const msg = linked?.auto
                        ? `${f.name} ${isCard ? "카드반영" : "출금처리"}를 취소할까요?\n알림으로 들어온 ${what}은 그대로 두고 연결만 풀어요.`
                        : `${f.name} ${isCard ? "카드반영" : "출금처리"}를 취소할까요?\n함께 적힌 ${what}도 지워져요.`;
                      if (window.confirm(msg)) unmarkFixedPaid(ctx, f);
                    }}
                    aria-label={`${f.name} ${isCard ? "카드반영" : "출금처리"} 완료 · 누르면 취소`}
                    style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: `1px solid ${T.good}`, borderRadius: 8, padding: "0 10px", minHeight: 32, cursor: "pointer", color: T.good, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    <Check size={13} strokeWidth={2.5} aria-hidden="true" />완료
                  </button>
                ) : (
                  <>
                    <button onClick={() => setSkip(f, true)} aria-label={`${f.name} 이번 달 안 냄`}
                      style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "0 8px", minHeight: 32, cursor: "pointer", color: T.muted, fontSize: 12.5, whiteSpace: "nowrap" }}>
                      안 냄
                    </button>
                    <button onClick={() => markFixedPaid(ctx, f, f.info)}
                      style={{ background: T.good, border: "none", borderRadius: 8, padding: "0 10px", minHeight: 32, cursor: "pointer", color: T.mode === "dark" ? "#000000" : "#FFFFFF", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {isCard ? "카드반영" : "출금처리"}
                    </button>
                  </>
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Exported so Ledger.jsx can offer the same 정산 action inline from the 내역 화면,
// instead of making the user come to 홈 → 예산 관리 every time.
export function settleReceivable(ctx, exp, repaidAmount) {
  const { data, persist, showToast } = ctx;
  const repaid = Number(repaidAmount);
  if (repaidAmount === "" || Number.isNaN(repaid) || repaid < 0) { showToast("상환받은 금액을 입력해주세요"); return; }
  const diff = repaid - exp.amount;
  let settlementCardDelta = 0, settlementCardId = null, settlementBalanceId = null;
  let next = { ...data };
  if (diff < 0) {
    settlementCardDelta = Math.abs(diff);
    // exp.cardId가 그 사이에 삭제된 카드를 가리킬 수 있음 — 확인 안 하면 부족분이
    // 어느 카드값에도 안 반영된 채로 "카드값에 반영됐어요" 토스트만 뜨는 유령 처리가 됨.
    settlementCardId = exp.cardId && data.cards.some((c) => c.id === exp.cardId) ? exp.cardId : data.cards[0]?.id;
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

/** "2026-09-13 10:02" → "3분 전" */
function agoAt(at) {
  // 숫자(ms)로 오는 것도 있다 — 카드의 syncedAtMs. 문자열만 받으면 Invalid Date라 빈 글자가 됐다(2026-09-19)
  const t = typeof at === "number" ? at : new Date(String(at).replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function reconcileAccount(ctx, account, actualBalance) {
  const { data, persist, showToast } = ctx;
  const actual = Number(actualBalance);
  if (Number.isNaN(actual)) { showToast("올바른 금액을 입력해주세요"); return; }
  const diff = actual - account.balance;
  if (diff === 0) { showToast("이미 실제 잔액과 같아요"); return; }
  const entry = { id: "b" + Date.now(), type: diff > 0 ? "in" : "out", amount: Math.abs(diff), date: todayISO(), memo: "잔액 조정", accountId: account.id, isAdjustment: true };
  // 은행 알림으로 맞춘 것과 같은 표시를 남긴다 — 이보다 앞선 거래 알림이 뒤늦게 와도 잔액을 안 흔든다
  const accounts = (data.accounts || []).map((a) => (a.id === account.id ? { ...a, bankSync: { at: syncMoment(), balance: actual } } : a));
  persist({ ...data, accounts, balanceEntries: [...(data.balanceEntries || []), entry] });
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

/*
  **이미 알림으로 들어온 같은 거래가 있으면 새로 만들지 않고 거기에 잇는다**(2026-09-11).

  금액이 같은 고정지출이 여럿이면(10만 원짜리 셋) 은행 알림만으로는 어느 건지 못 가려서
  그냥 '출금'으로 들어간다. 그 뒤 사람이 '주택청약 출금처리'를 누르면 예전엔 출금을
  하나 더 만들어 **통장에서 두 번 빠졌다.** 이제 이번 달·같은 통장(카드)·같은 금액의
  자동 기록 중 아직 어느 고정지출에도 안 이어진 게 있으면 그걸 이 항목에 잇는다.
  이름 조각이 메모에 든 것을 먼저 고른다.
*/
function findAutoMatch(list, f, amount, curKey, same) {
  const name = String(f.name || "").replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 4);
  // 잔액 맞춤(isAdjustment)도 auto지만 거래가 아니다 — 잇는 대상에서 뺀다
  const cands = (list || []).filter((x) => x.auto && !x.isAdjustment && Number(x.amount) === Number(amount) && String(x.date).slice(0, 7) === curKey && same(x));
  return cands.find((x) => name.length >= 2 && String(x.memo || "").includes(name)) || cands[0] || null;
}

/*
  `mKey`는 **어느 달 몫을 낸 것인지**다(2026-09-20). 보통 이번 달이지만, 월말에 다음 달 회비를
  미리 내는 경우가 있어서 다음 달로도 적을 수 있다. 짝을 찾을 때(이미 들어온 출금 기록)는
  **돈이 나간 이번 달**에서 찾고, 표시만 그 달(mKey)로 한다.
*/
function markFixedPaid(ctx, f, info, mKey) {
  const { data, persist, showToast } = ctx;
  const curKey = mKey || ctx.curKey;
  const isCard = (f.paymentMethod || "cash") === "card";
  let next = { ...data };
  let marker;
  if (isCard) {
    const cidOk = f.cardId && data.cards.some((c) => c.id === f.cardId) ? f.cardId : data.cards[0]?.id;
    const hit = findAutoMatch(data.expenses, f, info.amount, ctx.curKey,
      (e) => (e.paymentMethod || "cash") === "card" && e.cardId === cidOk && !e.isCardAdjustment && e.reimbursedAmount == null);
    if (hit) {
      // 카드값에는 이미 들어가 있다. 정기결제로 표시만 바꿔 예산에서 두 번 안 세게 한다.
      next.expenses = data.expenses.map((e) => (e.id === hit.id ? { ...e, isCardAdjustment: true, memoBefore: e.memo, memo: `${f.name} · 정기결제 카드반영` } : e));
      next.fixedExpenses = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, paidMonths: { ...(x.paidMonths || {}), [curKey]: hit.id } } : x));
      persist(next);
      showToast(`카드 알림으로 이미 들어온 ${fmtWon(info.amount)}에 연결했어요`);
      return;
    }
  } else {
    const aidOk = f.accountId && data.accounts.some((a) => a.id === f.accountId) ? f.accountId : data.accounts[0]?.id;
    const hit = findAutoMatch(data.balanceEntries, f, info.amount, ctx.curKey,
      (b) => b.type === "out" && !b.linkedFixedId && !b.transferId && (b.accountId || data.accounts[0]?.id) === aidOk);
    if (hit) {
      next.balanceEntries = data.balanceEntries.map((b) => (b.id === hit.id ? { ...b, linkedFixedId: f.id, linkedFixedMonth: curKey, memoBefore: b.memo, memo: `${f.name} 자동이체` } : b));
      next.fixedExpenses = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, paidMonths: { ...(x.paidMonths || {}), [curKey]: hit.id } } : x));
      persist(next);
      showToast(`은행 알림으로 이미 들어온 ${fmtWon(info.amount)} 출금에 연결했어요`);
      return;
    }
  }
  if (isCard) {
    // f.cardId가 그 사이에 삭제된 카드를 가리킬 수 있음(카드 삭제는 fixedExpenses를
    // 안 건드림) — 확인 안 하면 어느 카드값도 안 늘어나는데 반영됐다고 뜸.
    const cid = f.cardId && data.cards.some((c) => c.id === f.cardId) ? f.cardId : data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Number(c.bill || 0) + Number(info.amount) } : c));
    // "카드반영"은 예전엔 bill만 조용히 늘리고 아무 기록도 안 남겼음 — 그래서 내역
    // 탭에서 카드값이 어디서 늘었는지 추적이 안 됐음. 이제 카드 지출 항목을 하나
    // 남겨서 내역에 보이게 하되, isCardAdjustment로 표시해 예산 집계(fixedSumAll이
    // 이미 매달 이 금액을 미리 반영하고 있음)에서는 이중 계산되지 않게 함.
    const adjId = "e" + Date.now();
    const adjExpense = { id: adjId, amount: Number(info.amount), categoryId: null, date: todayISO(), memo: `${f.name} · 정기결제 카드반영`, isReceivable: false, settled: false, repaidAmount: null, paymentMethod: "card", cardId: cid, linkedBalanceId: null, isCardAdjustment: true };
    next.expenses = [...data.expenses, adjExpense];
    marker = adjId;
  } else {
    // 같은 이유로 f.accountId도 삭제된 통장을 가리킬 수 있음 — 그러면 새 입출금
    // 기록이 존재하지 않는 통장에 붙어서 어느 통장 잔액에도 안 잡히는 유령 데이터가 됨.
    const aid = f.accountId && data.accounts.some((a) => a.id === f.accountId) ? f.accountId : data.accounts[0]?.id;
    const entry = { id: "b" + Date.now(), type: "out", amount: info.amount, date: todayISO(), memo: `${f.name} 자동이체`, accountId: aid, linkedFixedId: f.id, linkedFixedMonth: curKey };
    next.balanceEntries = [...(data.balanceEntries || []), entry];
    marker = entry.id;
  }
  next.fixedExpenses = data.fixedExpenses.map((x) => (x.id === f.id ? { ...x, paidMonths: { ...(x.paidMonths || {}), [curKey]: marker } } : x));
  persist(next);
  showToast(isCard ? `${fmtWon(info.amount)} 카드값에 반영했어요 · 내역에서 확인할 수 있어요` : `${fmtWon(info.amount)} 출금 처리했어요`);
}
function unmarkFixedPaid(ctx, f, mKey) {
  const { data, persist, showToast } = ctx;
  const curKey = mKey || ctx.curKey;
  const isCard = (f.paymentMethod || "cash") === "card";
  const marker = f.paidMonths?.[curKey];
  let next = { ...data };
  /*
    **알림으로 들어온 기록은 지우지 않고 연결만 푼다**(2026-09-11).

    카드·은행 알림으로 들어온 기록은 실제로 돈이 움직였다는 증거다. 예전엔 '완료'를
    취소하면 그것까지 지웠는데, 사람이 뜻하는 건 "이건 그 고정지출이 아니다"이지
    "이 결제가 없었다"가 아니다. 보통 결제·출금으로 되돌려 둔다.
  */
  const linked = typeof marker === "string"
    ? (isCard ? data.expenses : data.balanceEntries || []).find((x) => x.id === marker)
    : null;
  if (linked && linked.auto) {
    if (isCard) {
      next.expenses = data.expenses.map((x) => {
        if (x.id !== marker) return x;
        const { isCardAdjustment, memoBefore, ...rest } = x;
        return { ...rest, memo: memoBefore ?? x.memo };
      });
    } else {
      next.balanceEntries = data.balanceEntries.map((b) => {
        if (b.id !== marker) return b;
        const { linkedFixedId, linkedFixedMonth, memoBefore, ...rest } = b;
        return { ...rest, memo: memoBefore ?? b.memo };
      });
    }
    next.fixedExpenses = data.fixedExpenses.map((x) => {
      if (x.id !== f.id) return x;
      const pm = { ...(x.paidMonths || {}) };
      delete pm[curKey];
      return { ...x, paidMonths: pm };
    });
    persist(next);
    showToast("연결을 풀었어요 · 알림으로 들어온 기록은 그대로예요");
    return;
  }
  if (isCard) {
    const adjExpense = typeof marker === "string" ? data.expenses.find((x) => x.id === marker && x.isCardAdjustment) : null;
    // adjExpense가 있으면(2026-08-21 이후 반영분) 그 금액 그대로 되돌리고 기록도 지움.
    // 없으면(그 이전에 반영해서 marker가 true뿐인 옛 데이터) 예전 방식대로 다시 계산.
    const amt = adjExpense ? Number(adjExpense.amount) : Number(fixedInfo(f, curKey).amount);
    const cid = f.cardId || data.cards[0]?.id;
    next.cards = data.cards.map((c) => (c.id === cid ? { ...c, bill: Math.max(0, Number(c.bill || 0) - amt) } : c));
    if (adjExpense) next.expenses = data.expenses.filter((x) => x.id !== marker);
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
  const { curKey } = ctx;
  // 이번 달 할부 몫을 냈다고 적는다 — 안 적으면 내자마자 카드값에 다시 뜬다(App.jsx cardTotals)
  const nextCards = data.cards.map((c) => (c.id === card.id
    ? { ...c, bill: 0, paidAtMs: Date.now(), ...(fixedPortion > 0 ? { installPaid: { [curKey]: Number(c.installPaid?.[curKey] || 0) + fixedPortion } } : {}) }
    : c));
  const aid = data.accounts?.[0]?.id;

  /*
    은행 알림이 먼저 들어와 이미 출금이 적혀 있으면 또 만들지 않는다.

    카드값을 은행 앱에서 먼저 내고 나중에 이 버튼을 누르는 순서가 있다.
    그때 출금을 하나 더 만들면 통장에서 같은 돈이 두 번 빠지는데, 잔액이
    조금 틀린 것보다 나쁘다 — 어느 쪽이 진짜인지 나중에 알 수가 없다.
    같은 날·같은 금액의 출금이 있으면 그게 이 결제라고 본다.
  */
  const already = (data.balanceEntries || []).some(
    (b) => b.type === "out" && !b.isAdjustment && Number(b.amount) === total && b.date === todayISO(),
  );

  const nextEntries = already
    ? (data.balanceEntries || [])
    : [...(data.balanceEntries || []), { id: "b" + Date.now(), type: "out", amount: total, date: todayISO(), memo: `${card.name} 카드값 결제`, accountId: aid }];

  persist({ ...data, cards: nextCards, balanceEntries: nextEntries });
  showToast(
    already
      ? `${fmtWon(total)} 결제 처리 · 통장 출금은 이미 적혀 있어요`
      : `${fmtWon(total)} 결제 처리 · 통장에서 출금됐어요`,
  );
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
              style={{ padding: "0 12px", minHeight: 40, borderRadius: 8, border: `1px solid ${T.field}`, background: "transparent", color: T.muted, fontSize: 13.5, cursor: "pointer" }}>
              맞추기
            </button>
            <button onClick={() => payCard(ctx, c)} disabled={!c.total}
              style={{ padding: "0 14px", minHeight: 40, borderRadius: 8, border: "none", background: c.total ? T.gold : T.border, color: c.total ? T.onGold : T.muted, fontSize: 14.5, fontWeight: 700, cursor: c.total ? "pointer" : "default" }}>
              결제하기
            </button>
          </div>
          {reconcileId === c.id && (
            <div style={{ marginTop: 8, background: T.mode === "dark" ? "#00000022" : "#00000008", borderRadius: 8, padding: 8 }}>
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>카드 앱에 찍힌 이번 달 청구 총액(할부 포함)을 그대로 입력하면 맞춰요.</div>
              <MoneyInput value={reconcileInput} onChange={setReconcileInput} ariaLabel="맞출 금액" />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => setReconcileId(null)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.cream, fontSize: 13, cursor: "pointer" }}>취소</button>
                <button onClick={() => { reconcileCard(ctx, c, reconcileInput); setReconcileId(null); }} style={{ flex: 2, ...primaryBtn(T), padding: "7px 0" }}>맞추기</button>
              </div>
              <StatementSync ctx={ctx} card={c} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/*
  카드 앱의 '결제 예정' 이용내역을 붙여 넣어 한 줄씩 대조한다(lib/statement.js 설명 참고).
  먼저 무엇이 바뀌는지 보여 주고 '적용'을 눌러야 바뀐다 — 한꺼번에 여러 건을 넣고 카드값을 덮어쓰는
  일이라 되돌리기 어렵다. 적용 뒤엔 명세서에 없는 앱 기록을 목록으로 보여 주고 하나씩 지울 수 있다.
*/
function StatementSync({ ctx, card }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [extras, setExtras] = useState(null);
  const rows = text.trim() ? parseStatement(text) : [];
  const plan = rows.length ? reconcileStatement(data, card.id, rows) : null;
  const s = plan?.summary;
  const apply = () => {
    const fresh = reconcileStatement(data, card.id, rows);
    if (!fresh) return;
    persist(fresh.next);
    setExtras(fresh.summary.extra);
    setText("");
    showToast(`명세서로 맞췄어요 · ${fresh.summary.added}건 넣고 카드값 ${fmtWon(fresh.summary.billAfter)}`);
  };
  // 명세서에 없는 기록 지우기 — 카드값은 이미 명세서로 맞춰서 건드리지 않는다
  const dropExtra = (id) => {
    persist({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });
    setExtras((list) => list.filter((e) => e.id !== id));
  };
  const small = { color: T.muted, fontSize: 12.5, lineHeight: 1.55 };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ width: "100%", marginTop: 8, padding: "8px 0", borderRadius: 6, border: `1px dashed ${T.field}`, background: "transparent", color: T.cream, fontSize: 13.5, cursor: "pointer" }}>
        카드 앱 이용내역 붙여 넣어 한 줄씩 맞추기
      </button>
    );
  }
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${T.border}` }}>
      <label htmlFor={`stmt-${card.id}`} style={{ ...small, display: "block", marginBottom: 5 }}>
        카드 앱 '결제 예정' 이용내역을 한 줄에 하나씩 — <span style={{ fontFamily: F.mono }}>09/13 가맹점 86,491</span>. 그 전 청구는 이미 낸 걸로 봐요.
      </label>
      <textarea id={`stmt-${card.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5}
        style={{ ...inputSty(T), width: "100%", boxSizing: "border-box", fontFamily: F.mono, fontSize: 13, resize: "vertical" }} />
      {text.trim() && !s && <div style={{ ...small, color: T.warn, marginTop: 6 }}>읽을 수 있는 줄이 없어요. "09/13 가맹점 86,491" 모양인지 봐 주세요.</div>}
      {s && (
        <div style={{ ...small, color: T.cream, marginTop: 6 }}>
          <div>명세서 {s.rows}건 · {fmtWon(s.statementTotal)}{s.installTotal ? ` (할부 ${fmtWon(s.installTotal)} 포함)` : ""} · {s.from.slice(5).replace("-", "/")}~{s.to.slice(5).replace("-", "/")}</div>
          <div>앱에 이미 있음 {s.matched}건 · 새로 넣을 것 {s.added}건 {fmtWon(s.addedSum)}</div>
          <div>명세서에 없는 앱 기록 {s.extra.length}건{s.extra.length ? " — 적용 뒤에 목록으로 보여 드려요" : ""}</div>
          <div style={{ fontWeight: 700 }}>카드값(일시불) {fmtWon(s.billBefore)} → {fmtWon(s.billAfter)}</div>
          {s.installFixes.map((f) => (
            <div key={f.name + f.month} style={{ fontWeight: 700 }}>
              {f.name} {Number(f.month.slice(5))}월({f.label}) {fmtWon(f.before)} → {fmtWon(f.after)}
              {f.nextAmt != null && <span style={{ fontWeight: 400, color: T.muted }}> · 다음 달 {fmtWon(f.nextAmt)}{f.projected ? "(수수료 줄어드는 대로)" : ""}</span>}
            </div>
          ))}
          {s.installMissing.length > 0 && (
            <div style={{ color: T.warn }}>앱에서 못 찾은 할부 {s.installMissing.length}건 — {s.installMissing.map((r) => `${r.merchant} ${fmtWon(r.amount)}`).join(", ")}. 할부로 등록해 두면 다음부터 맞춰요.</div>
          )}
          {(s.afterEndSum > 0 || s.pendingAdjSum > 0) && (
            <div style={{ color: T.muted }}>
              명세서 뒤 앱 기록 {fmtWon(s.afterEndSum)}{s.pendingAdjSum ? ` · 아직 청구 전 정기결제 ${fmtWon(s.pendingAdjSum)}` : ""} 포함
            </div>
          )}
          <button onClick={apply} style={{ ...primaryBtn(T), marginTop: 8, padding: "9px 0", fontSize: 14.5 }}>이대로 적용</button>
        </div>
      )}
      {extras && extras.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...small, color: T.warn, fontWeight: 700 }}>명세서에 없는 앱 기록 {extras.length}건 — 중복이거나 잘못 들어간 것이면 지우세요</div>
          {extras.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px dashed ${T.border}` }}>
              <span style={{ flex: 1, minWidth: 0, color: T.cream, fontSize: 13.5 }}>{e.date.slice(5).replace("-", "/")} {e.memo || "(메모 없음)"}</span>
              <span style={{ fontFamily: F.mono, color: T.cream, fontSize: 13.5 }}>{fmtWon(e.amount)}</span>
              <button onClick={() => dropExtra(e.id)} aria-label={`${e.memo || ""} ${fmtWon(e.amount)} 지우기`}
                style={{ minHeight: 32, padding: "0 10px", borderRadius: 6, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger, fontSize: 12.5, cursor: "pointer" }}>지우기</button>
            </div>
          ))}
        </div>
      )}
      {extras && extras.length === 0 && <div style={{ ...small, color: T.good, marginTop: 8 }}>앱 기록이 명세서와 다 맞아요.</div>}
    </div>
  );
}

function TransitQuickAdd({ ctx }) {
  const T = useTheme();
  const { data, persist, showToast, curKey } = ctx;
  if (!data.cards || data.cards.length === 0) return null;

  const transitCat = data.categories.find((c) => c.name.includes("교통")) || data.categories[0];
  const existing = data.expenses.find((e) => e.linkedTransitMonth === curKey);
  // existing.cardId를 쓰던 카드가 그 사이에 설정에서 삭제됐을 수 있음 — 그 상태로
  // 그냥 두면 선택창엔 아무것도 안 골라진 것처럼 보이는데 제출은 되면서, 어느 카드값도
  // 실제로는 안 바뀌었는데 "반영했어요" 토스트만 뜨는 조용한 실패가 생김.
  const existingCardValid = existing && (data.cards || []).some((c) => c.id === existing.cardId);

  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [cardId, setCardId] = useState(existingCardValid ? existing.cardId : (data.cards?.[0]?.id || ""));

  useEffect(() => {
    setAmount(existing ? String(existing.amount) : "");
    setCardId(existingCardValid ? existing.cardId : (data.cards?.[0]?.id || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, existing?.amount, existing?.cardId, existingCardValid]);

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
      <MoneyInput value={amount} onChange={setAmount} placeholder="이번 달 누적 금액" ariaLabel="대중교통비 이번 달 누적 금액" />
      {data.cards.length > 1 && (
        <select value={cardId} onChange={(e) => setCardId(e.target.value)} aria-label="대중교통비 결제 카드" style={{ ...inputSty(T), marginTop: 8 }}>
          {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <button onClick={submit} style={{ ...primaryBtn(T), marginTop: 8, padding: "9px 0", fontSize: 14.5 }}>{existing ? "누적 금액 갱신" : "카드값에 반영"}</button>
    </div>
  );
}

function BalanceCard({ ctx, accountBalance, compact }) {
  const T = useTheme();
  const { data, persist, showToast } = ctx;
  const accountTotals = ctx.accountTotals || [];
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [accountId, setAccountId] = useState(data.accounts?.[0]?.id || "");
  const [expandedState, setExpanded] = useState(false);
  // 홈 타일 안(compact)에선 합계를 타일이 이미 보여 주므로 통장별 목록을 늘 편다
  const expanded = compact || expandedState;
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [reconcileId, setReconcileId] = useState(null);
  const [reconcileInput, setReconcileInput] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const lastSync = accountTotals.map((a) => a.bankSync?.at).filter(Boolean).sort().slice(-1)[0];

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
    <div style={compact ? {} : { background: T.bg2, border: `1.5px solid ${T.good}77`, borderRadius: 14, padding: "14px 16px" }}>
      {compact ? (
        <div style={{ color: T.muted, fontSize: 12.5, marginBottom: 8 }}>
          {lastSync ? `은행 알림으로 ${agoAt(lastSync)} 맞춤 · 그 뒤 입출금은 실시간 반영` : "입출금·현금결제만 실시간 반영"}
        </div>
      ) : (
      <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", padding: 0, cursor: accountTotals.length > 1 ? "pointer" : "default", width: "100%", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Wallet size={14} color={T.good} />
          <span style={{ color: T.good, fontSize: 14, fontWeight: 700 }}>통장 잔액 (총합){accountTotals.length > 1 ? (expanded ? " ▲" : " ▼") : ""}</span>
        </div>
        <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 26, fontWeight: 700, marginBottom: 2 }}>{fmtWon(accountBalance)}</div>
        <div style={{ color: T.good, fontSize: 12, marginBottom: 10 }}>
          {lastSync ? `은행 알림으로 ${agoAt(lastSync)} 맞춤 · 그 뒤 입출금은 실시간 반영` : "실제로 계좌에 있는 돈 · 입출금·현금결제만 실시간 반영"}
        </div>
      </button>
      )}
      {expanded && accountTotals.length > 1 && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {accountTotals.map((a) => (
            <div key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, color: T.cream, padding: "3px 0", borderBottom: `1px dashed ${T.border}` }}>
                <span>{a.name}{a.bankSync && <span style={{ color: T.muted, fontSize: 12 }}> · 은행과 {agoAt(a.bankSync.at)} 맞춤</span>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: F.mono, color: T.muted }}>{fmtWon(a.balance)}</span>
                  <button onClick={() => { setReconcileId(reconcileId === a.id ? null : a.id); setReconcileInput(String(a.balance)); }} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", color: T.muted, fontSize: 11.5 }}>맞추기</button>
                </span>
              </div>
              {reconcileId === a.id && (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ color: T.muted, fontSize: 12, marginBottom: 5 }}>통장 앱에 찍힌 실제 잔액을 입력하면 차액을 자동으로 맞춰요</div>
                  <MoneyInput value={reconcileInput} onChange={setReconcileInput} ariaLabel="맞출 금액" />
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
              <MoneyInput value={reconcileInput} onChange={setReconcileInput} ariaLabel="맞출 금액" />
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
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="예: 국민은행 입금 500,000원 07/20 14:23" aria-label="입출금 문자"
                    style={{ ...inputSty(T), height: 70, fontSize: 14, marginBottom: 6 }} />
                  <button onClick={applyParse} style={primaryBtn(T)}>읽어오기</button>
                </div>
              )}
            </>
          )}
          {(data.accounts || []).length > 1 && (
            mode === "transfer" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="통장" style={inputSty(T)}>
                  {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span style={{ color: T.muted, fontSize: 13 }}>→</span>
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} aria-label="받는 통장" style={inputSty(T)}>
                  <option value="" disabled>받는 통장</option>
                  {data.accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="통장" style={inputSty(T)}>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )
          )}
          <MoneyInput value={amount} onChange={setAmount} placeholder="금액" autoFocus ariaLabel="금액" />
          <QuickAmountButtons amount={amount} setAmount={setAmount} />
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="표기내역" aria-label="메모" style={{ ...inputSty(T), marginTop: 4 }} />
          <button onClick={submit} style={{ ...primaryBtn(T), background: mode === "in" ? T.good : mode === "transfer" ? T.gold : T.danger, color: mode === "transfer" ? T.onGold : "#fff", marginTop: 4 }}>
            {mode === "in" ? "입금 기록" : mode === "transfer" ? "이체 기록" : "출금 기록"}
          </button>
        </div>
      )}
    </div>
  );
}

