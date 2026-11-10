// 진단 탭(2026-11-09): 월급을 한계치까지 쓰는 이유를 내 숫자로 짚는다.
// 사용자: "요즘 급여를 한계치까지 쓰고 있는데 급여 컨설팅 같은 걸 해 주는 기능을 넣는 건 어때?" → "한 번에 다 ㄱㄱ"
// 계산은 새로 만들지 않고 ctx 값(다음 달 월급·고정지출·더 써도 되는 돈)을 그대로 쓴다 — 홈과 숫자가 갈라지면 안 된다.
import { useMemo } from "react";
import { useTheme, F, tone } from "../lib/theme";
import { fmtWon, netAmount, fixedInfo, monthKeyOffset, daysInMonthKey } from "../lib/data";

const num = { fontFamily: F.mono, fontVariantNumeric: "tabular-nums" };
const ym = (k) => `${k.slice(0, 4)}년 ${Number(k.slice(5, 7))}월`;
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

export function ConsultView({ ctx }) {
  const T = useTheme();
  const { data, curKey, nextKey, dayIntoCycle } = ctx;
  const good = tone(T, "good"), warn = tone(T, "warn"), bad = tone(T, "danger");

  /* ---------- 1) 고정비 진단 — 홈 '12월 고정지출'(nextFixedCash + nextFixedCard)과 같은 항목·같은 기준 ---------- */
  const income = Number(ctx.nextPay || 0) + Number(ctx.incomeNextSum || 0);
  const nextDone = (f) => !!(f.paidMonths && f.paidMonths[nextKey]) || !!(f.skipMonths && f.skipMonths[nextKey]);
  const nextFixed = (data.fixedExpenses || [])
    .filter((f) => !nextDone(f))
    .map((f) => ({ f, info: fixedInfo(f, nextKey) }))
    .filter((x) => x.info.active && Number(x.info.amount) > 0)
    .map(({ f, info }) => ({ id: f.id, name: f.name, amount: Number(info.amount), card: (f.paymentMethod || "cash") === "card", inst: f.totalMonths > 0, f }))
    .sort((a, b) => b.amount - a.amount);
  const fixedTotal = nextFixed.reduce((s, x) => s + x.amount, 0);
  const ratio = income > 0 ? fixedTotal / income : 0;
  const ratioTone = ratio >= 0.7 ? bad : ratio >= 0.5 ? warn : good;
  /*
    **마지막 '결제' 달**(2026-11-10, 사용자: "10월에 3개월 할부로 결제했으면 12월 카드 사용분까지 포함이니 1월 중순이 실질적으로
    마지막 결제일 아니야?"). 앱의 할부 달(fixedInfo)은 '그 카드 사용분에 들어가는 달'이라 10·11·12월이고, 카드는 1~말일 사용분을
    다음 달 결제일에 내므로 실제로 돈이 나가는 건 11·12·1월이다 → 카드 할부는 마지막 할부 달 + 1개월의 결제일.
    한 달 일찍 내는 카드(earlyPay — 롯데)는 그 달에 내고, 통장 할부(K9)는 그 달에 통장에서 나간다 → 그대로.
    다음 달 고정지출에 안 잡혀도(사용분은 이번 달이 마지막) 결제가 남았으면 목록에 둔다.
  */
  const cardOf = (f) => (data.cards || []).find((c) => c.id === f.cardId);
  const instList = (data.fixedExpenses || []).filter((f) => f.totalMonths > 0).map((f) => {
    const isCard = (f.paymentMethod || "cash") === "card";
    const card = isCard ? cardOf(f) : null;
    const lastKey = monthKeyOffset(f.setupMonthKey, f.totalMonths - f.startInstallment);
    const lastPayKey = isCard && !card?.earlyPay ? monthKeyOffset(lastKey, 1) : lastKey;
    const payDay = isCard ? Number(card?.payDay) || null : Number(f.autoPayDay) || null;
    // 이번 달 몫을 이미 냈는지 — 카드는 결제일이 지났는지(한 달 일찍 내는 카드는 installPaid), 통장은 처리 완료 표시
    const paidNow = isCard
      ? (card?.earlyPay ? !!card?.installPaid?.[curKey] : !!payDay && dayIntoCycle > payDay)
      : !!f.paidMonths?.[curKey];
    const left = monthsBetween(curKey, lastPayKey) + (paidNow ? 0 : 1);
    return { id: f.id, name: f.name, amount: Number(fixedInfo(f, lastKey).amount), lastPayKey, payDay, left };
  }).filter((x) => x.left > 0 && x.amount > 0).sort((a, b) => a.lastPayKey.localeCompare(b.lastPayKey));
  // 다음 달 고정지출 안의 할부 몫(위 비율과 같은 기준) — 할부가 다 끝난 뒤 비율도 이것으로
  const instTotal = nextFixed.filter((x) => x.inst).reduce((s, x) => s + x.amount, 0);
  const afterInst = income > 0 ? (fixedTotal - instTotal) / income : 0;

  /* ---------- 2) 카테고리 비교 — 이번 달 1~오늘 vs 지난 3달의 같은 날짜 구간(기간 길이를 맞춘다 — 2026-08-24 버그 교훈) ---------- */
  const catRows = useMemo(() => {
    const catName = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
    // 정기결제 카드반영은 고정지출로 이미 센 돈이라 생활비 비교에서 뺀다. 대리결제도 내 돈이 아니라 뺀다
    const spend = (e) => !e.isReceivable && !e.isCardAdjustment;
    const sumBy = (key, upto) => {
      const m = {};
      (data.expenses || []).filter((e) => spend(e) && e.date.slice(0, 7) === key && Number(e.date.slice(8, 10)) <= upto)
        .forEach((e) => { const n = catName[e.categoryId] || "미분류"; m[n] = (m[n] || 0) + netAmount(e); });
      return m;
    };
    const now = sumBy(curKey, dayIntoCycle);
    const prevKeys = [1, 2, 3].map((i) => monthKeyOffset(curKey, -i))
      .filter((k) => (data.expenses || []).some((e) => spend(e) && e.date.slice(0, 7) === k));
    const prev = prevKeys.map((k) => sumBy(k, Math.min(dayIntoCycle, daysInMonthKey(k))));
    const names = new Set([...Object.keys(now), ...prev.flatMap((m) => Object.keys(m))]);
    const rows = [...names].map((n) => {
      const avg = prev.length ? Math.round(prev.reduce((s, m) => s + (m[n] || 0), 0) / prev.length) : null;
      const cur = now[n] || 0;
      return { name: n, cur, avg, diff: avg == null ? null : cur - avg };
    }).filter((r) => r.cur > 0 || (r.avg || 0) > 0).sort((a, b) => b.cur - a.cur);
    return { rows, months: prevKeys.length, total: rows.reduce((s, r) => s + r.cur, 0), avgTotal: prevKeys.length ? rows.reduce((s, r) => s + (r.avg || 0), 0) : null };
  }, [data.expenses, data.categories, curKey, dayIntoCycle]);
  const hot = catRows.rows.filter((r) => r.diff != null && r.diff >= 20000 && r.cur >= (r.avg || 0) * 1.3);

  /* ---------- 3) 정기결제 모아 보기 ---------- */
  const subs = useMemo(() => {
    // 카드 매달반복 고정지출(할부 아님) — 계산에 이미 들어 있는 것
    const fixedSubs = nextFixed.filter((x) => x.card && !x.inst).map((x) => ({ key: "f" + x.id, name: x.name, amount: x.amount, registered: true }));
    // '정기결제' 카테고리로 들어왔는데 고정지출로는 안 적힌 것(예: 구글 결제) — 최근 60일, 이름+금액마다 하나
    const subCat = data.categories.find((c) => /정기/.test(c.name));
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const seen = new Set(fixedSubs.map((s) => s.amount));
    const extra = [];
    (data.expenses || []).filter((e) => subCat && e.categoryId === subCat.id && !e.isCardAdjustment && !e.isReceivable && e.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((e) => {
        const k = `${String(e.memo || "").replace(/\s+/g, "")}|${Number(e.amount)}`;
        if (extra.some((x) => x.k === k) || seen.has(Number(e.amount))) return;
        // 구글 결제는 이름이 다 같아서 사용자가 알려 준 금액으로 이름을 붙인다(data.js GOOGLE_SUBS와 같은 값)
        const g = /구글페이먼트/.test(String(e.memo || "").replace(/\s+/g, "")) ? { 9900: "유튜브", 30000: "클로드" }[Number(e.amount)] : null;
        extra.push({ k, key: e.id, name: g ? `${g} · 구글 결제` : e.memo || "정기결제", amount: Number(e.amount), registered: false, last: e.date });
      });
    return [...fixedSubs, ...extra].sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.fixedExpenses, data.expenses, data.categories, nextKey]);
  const subsTotal = subs.reduce((s, x) => s + x.amount, 0);

  /* ---------- 4) 이 속도면 말일에 — 더 써도 되는 돈(canSpend)에서 내일부터 말일까지 하루 평균만큼 뺀다 ---------- */
  const usedSoFar = Number(ctx.normalSpent || 0) + Number(ctx.cardSpentThisCycle || 0);
  const avgDay = dayIntoCycle > 0 ? Math.round(usedSoFar / dayIntoCycle) : 0;
  const restDays = Math.max(0, Number(ctx.daysLeft || 1) - 1);
  const projected = Number(ctx.canSpend || 0) - avgDay * restDays;
  const safeDay = restDays > 0 ? Math.floor(Math.max(0, ctx.canSpend) / Number(ctx.daysLeft || 1)) : 0;

  const Box = ({ title, sub, children }) => (
    <section style={{ background: T.bg2, borderRadius: 20, padding: "16px 16px 14px", marginBottom: 14 }}>
      <div style={{ color: T.cream, fontSize: 16, fontWeight: 800 }}>{title}</div>
      {sub && <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
  const Row = ({ left, right, sub, color, strong }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: T.cream, fontSize: 14, fontWeight: strong ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
        {sub && <span style={{ display: "block", color: T.muted, fontSize: 11.5, marginTop: 1 }}>{sub}</span>}
      </span>
      <span style={{ ...num, color: color || T.cream, fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
  const Say = ({ t, children }) => (
    <div style={{ background: T.bg, borderRadius: 12, padding: "10px 12px", marginTop: 10, color: (t || T).text || T.cream, fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>{children}</div>
  );
  const pct = (r) => `${Math.round(r * 100)}%`;

  if (!ctx.hasPay) {
    return (
      <div>
        <h1 style={{ margin: "0 0 14px", color: T.cream, fontSize: 22, fontWeight: 800 }}>진단</h1>
        <div style={{ color: T.warn, fontSize: 15, fontWeight: 700 }}>설정에서 월급(실수령)을 먼저 적어 주세요</div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 4px", color: T.cream, fontSize: 22, fontWeight: 800 }}>진단</h1>
      <div style={{ color: T.muted, fontSize: 13, marginBottom: 16 }}>내 기록으로 본 이번 달 돈 흐름</div>

      {/* 1) 고정비 */}
      <Box title="고정비가 월급의 얼마인가" sub={`${Number(nextKey.slice(5, 7))}월 들어올 돈 ${fmtWon(income)} 기준`}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ color: T.muted, fontSize: 13.5 }}>{Number(nextKey.slice(5, 7))}월 고정지출 {fmtWon(fixedTotal)}</span>
          <span style={{ ...num, color: ratioTone.text, fontSize: 26, fontWeight: 700 }}>{pct(ratio)}</span>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: T.bg, overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", background: ratioTone.fill }} />
        </div>
        <div style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>고정비 빼고 남는 돈 {fmtWon(Math.max(0, income - fixedTotal))} · 흔히 50% 아래를 권해요</div>
        <div style={{ marginTop: 10 }}>
          {nextFixed.slice(0, 6).map((x) => (
            <Row key={x.id} left={x.name} sub={`${x.inst ? "할부" : x.card ? "카드" : "통장"} · 월급의 ${pct(income ? x.amount / income : 0)}`} right={fmtWon(x.amount)} />
          ))}
          {nextFixed.length > 6 && <Row left={`그 밖에 ${nextFixed.length - 6}건`} right={fmtWon(nextFixed.slice(6).reduce((s, x) => s + x.amount, 0))} />}
        </div>
        {ratio >= 0.5 && (
          <Say t={ratioTone}>
            고정비가 월급의 {pct(ratio)}라 생활비로 쓸 수 있는 몫이 {fmtWon(Math.max(0, income - fixedTotal))}뿐이에요.
            {instTotal > 0 && ` 그중 할부가 ${fmtWon(instTotal)}(${pct(instTotal / income)})예요.`}
          </Say>
        )}
      </Box>

      {/* 1-2) 할부 끝나는 때 */}
      {instList.length > 0 && (
        <Box title="할부가 끝나면 풀리는 돈" sub="끝나는 순서대로">
          {instList.map((x) => (
            <Row key={x.id} left={x.name} sub={`마지막 결제 ${ym(x.lastPayKey)}${x.payDay ? ` ${x.payDay}일` : ""} · 남은 ${x.left}회`} right={`+${fmtWon(x.amount)}`} color={good.text} />
          ))}
          <Say t={good}>할부가 다 끝나면 고정비가 월급의 {pct(afterInst)}로 내려가요(매달 {fmtWon(instTotal)}).</Say>
        </Box>
      )}

      {/* 2) 카테고리 */}
      <Box title="어디에 더 쓰고 있나" sub={catRows.months ? `이번 달 1~${dayIntoCycle}일 vs 지난 ${catRows.months}달의 같은 1~${dayIntoCycle}일 평균 · 정기결제 카드반영·대리결제 빼고` : `이번 달 1~${dayIntoCycle}일 · 비교할 지난달 기록이 아직 없어요`}>
        {catRows.rows.length === 0 && <div style={{ color: T.muted, fontSize: 13.5 }}>이번 달 기록이 아직 없어요</div>}
        {catRows.rows.slice(0, 8).map((r) => {
          const up = r.diff != null && r.diff > 0;
          return (
            <Row key={r.name} left={r.name} right={fmtWon(r.cur)}
              sub={r.avg == null ? null : `평균 ${fmtWon(r.avg)} · ${r.diff === 0 ? "같아요" : `${up ? "+" : "−"}${fmtWon(Math.abs(r.diff))}`}`}
              color={hot.includes(r) ? bad.text : T.cream} />
          );
        })}
        {catRows.avgTotal != null && (
          <Row strong left="합계" sub={`평균 ${fmtWon(catRows.avgTotal)}`} right={fmtWon(catRows.total)}
            color={catRows.total > catRows.avgTotal ? bad.text : good.text} />
        )}
        {hot.length > 0
          ? <Say t={bad}>평소보다 많이 쓴 곳: {hot.map((r) => `${r.name} +${fmtWon(r.diff)}`).join(", ")}</Say>
          : catRows.months > 0 && <Say t={good}>카테고리별로 평소보다 크게 는 곳은 없어요.</Say>}
      </Box>

      {/* 3) 정기결제 */}
      <Box title="매달 빠지는 정기결제" sub="카드 정기결제 + '정기결제' 카테고리(최근 60일)">
        {subs.length === 0 && <div style={{ color: T.muted, fontSize: 13.5 }}>아직 없어요</div>}
        {subs.map((s) => (
          <Row key={s.key} left={s.name} sub={s.registered ? "고정지출에 등록됨" : `고정지출엔 없음 · 마지막 ${Number(s.last.slice(5, 7))}/${Number(s.last.slice(8, 10))}`} right={fmtWon(s.amount)} />
        ))}
        {subs.length > 0 && <Say>한 달 {fmtWon(subsTotal)} · 1년이면 {fmtWon(subsTotal * 12)}. 안 쓰는 게 있으면 해지 후보예요.</Say>}
      </Box>

      {/* 4) 이 속도면 */}
      <Box title="이 속도로 쓰면 말일에" sub={`1~${dayIntoCycle}일 하루 평균 ${fmtWon(avgDay)} (기록한 지출, 정기결제 카드반영 빼고)`}>
        <Row left="이번 달 더 써도 되는 돈(지금)" right={fmtWon(ctx.canSpend)} />
        <Row left={`− 내일부터 말일까지 ${restDays}일 × ${fmtWon(avgDay)}`} right={fmtWon(avgDay * restDays)} color={bad.text} />
        <Row strong left="= 말일에 남는 돈(예상)" right={fmtWon(projected)} color={projected < 0 ? bad.text : good.text} />
        <Say t={projected < 0 ? bad : good}>
          {projected < 0
            ? `지금 속도면 말일에 ${fmtWon(-projected)} 모자라요. 오늘부터 하루 ${fmtWon(safeDay)} 안으로 쓰면 맞아요.`
            : `지금 속도면 말일에 ${fmtWon(projected)} 남아요.`}
        </Say>
      </Box>
    </div>
  );
}
