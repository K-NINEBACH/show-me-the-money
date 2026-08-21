// Calendar tab: month grid heatmap of daily spending.
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme, F, paperCard } from "../lib/theme";
import { fmtWon, monthLabel, monthKeyOffset, daysInMonthKey, firstWeekday, dateStrFor, todayISO } from "../lib/data";

export function CalendarView({ ctx }) {
  const T = useTheme();
  const { data, curKey } = ctx;
  const [viewKey, setViewKey] = useState(curKey);
  const [selectedDate, setSelectedDate] = useState(null);
  const catMap = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  const monthExpenses = useMemo(() => data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === viewKey), [data.expenses, viewKey]);
  const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const dailyTotals = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => { const day = Number(e.date.slice(8, 10)); map[day] = (map[day] || 0) + Number(e.amount); });
    return map;
  }, [monthExpenses]);

  const incomeDays = useMemo(() => {
    const set = new Set();
    (data.balanceEntries || []).forEach((b) => {
      if (b.type === "in" && b.date.slice(0, 7) === viewKey) set.add(Number(b.date.slice(8, 10)));
    });
    return set;
  }, [data.balanceEntries, viewKey]);

  const maxDaily = Math.max(0, ...Object.values(dailyTotals));
  const topDay = useMemo(() => {
    const entries = Object.entries(dailyTotals);
    if (!entries.length) return null;
    return Number(entries.sort((a, b) => b[1] - a[1])[0][0]);
  }, [dailyTotals]);

  const topCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => { map[e.categoryId] = (map[e.categoryId] || 0) + Number(e.amount); });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted.length ? catMap[sorted[0][0]]?.name : null;
  }, [monthExpenses]);

  const compareBadge = useMemo(() => {
    const prevKey = monthKeyOffset(viewKey, -1);
    const isCurrentMonth = viewKey === curKey;
    const todayDay = Number(todayISO().slice(8, 10));
    const cutoff = isCurrentMonth ? todayDay : daysInMonthKey(viewKey);
    const prevCutoff = Math.min(cutoff, daysInMonthKey(prevKey));
    const curSum = monthExpenses.filter((e) => Number(e.date.slice(8, 10)) <= cutoff).reduce((s, e) => s + Number(e.amount), 0);
    const prevSum = data.expenses.filter((e) => !e.isReceivable && e.date.slice(0, 7) === prevKey && Number(e.date.slice(8, 10)) <= prevCutoff).reduce((s, e) => s + Number(e.amount), 0);
    if (prevSum <= 0) return null;
    const pct = Math.round(((curSum - prevSum) / prevSum) * 100);
    return { pct, up: pct > 0 };
  }, [monthExpenses, data.expenses, viewKey, curKey]);

  const days = daysInMonthKey(viewKey);
  const offset = firstWeekday(viewKey);
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayStr2 = todayISO();

  const selectedList = selectedDate ? data.expenses.filter((e) => !e.isReceivable && e.date === selectedDate).sort((a, b) => b.amount - a.amount) : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => { setViewKey(monthKeyOffset(viewKey, -1)); setSelectedDate(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}><ChevronLeft size={22} /></button>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 19.5, fontWeight: 700 }}>{monthLabel(viewKey)}</div>
        <button onClick={() => { setViewKey(monthKeyOffset(viewKey, 1)); setSelectedDate(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}><ChevronRight size={22} /></button>
      </div>

      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{fmtWon(monthTotal)}</div>
      {topCategory && <div style={{ color: T.muted, fontSize: 14, marginBottom: 6 }}>이번 달 <span style={{ color: T.gold, fontWeight: 700 }}>{topCategory}</span>에서 가장 많이 썼어요</div>}
      {compareBadge && (
        <div style={{ display: "inline-block", color: compareBadge.up ? T.danger : T.good, background: (compareBadge.up ? T.danger : T.good) + "1A", borderRadius: 8, padding: "3px 8px", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
          지난달 이맘때보다 {compareBadge.up ? "+" : ""}{compareBadge.pct}%
        </div>
      )}
      {!topCategory && <div style={{ marginBottom: 10 }} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 6 }}>
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} style={{ color: T.muted, fontSize: 13, padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 12 }}>
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const dateStr = dateStrFor(viewKey, day);
          const amt = dailyTotals[day];
          const isToday = dateStr === todayStr2;
          const isSelected = dateStr === selectedDate;
          const isTop = day === topDay && amt > 0;
          const intensity = maxDaily > 0 && amt ? Math.min(amt / maxDaily, 1) : 0;
          const heatAlpha = Math.round(intensity * 70).toString(16).padStart(2, "0");
          const hasIncome = incomeDays.has(day);
          return (
            <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 0" }}>
              <span style={{
                position: "relative", width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14.5, fontWeight: isToday ? 700 : 500,
                background: isToday ? T.ink : isSelected ? T.gold + "33" : amt ? `${T.danger}${heatAlpha}` : "transparent",
                color: isToday ? T.paper : isSelected ? T.gold : T.cream,
                border: isTop ? `1.5px solid ${T.gold}` : isSelected && !isToday ? `1.5px solid ${T.gold}` : "none",
              }}>
                {day}
                {hasIncome && (
                  <span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: T.good, border: `1px solid ${T.bg}` }} />
                )}
              </span>
              <span style={{ fontSize: 11, color: amt ? T.muted : "transparent", fontFamily: F.mono }}>
                {amt ? (amt >= 10000 ? `${Math.round(amt / 1000) / 10}만` : amt.toLocaleString("ko-KR")) : "-"}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 12, color: T.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: `${T.danger}70` }} /> 많이 쓴 날</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.good }} /> 입금일</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${T.gold}` }} /> 최고 지출일</span>
      </div>

      {selectedDate && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: T.goldSoft, fontSize: 14, marginBottom: 8 }}>{selectedDate} 내역</div>
          {selectedList.length === 0 ? (
            <div style={{ ...paperCard(T), textAlign: "center", color: T.muted, padding: "24px 14px" }}>이 날 기록이 없어요.</div>
          ) : (
            <div style={paperCard(T)}>
              {selectedList.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.paperLine}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMap[e.categoryId] ? catMap[e.categoryId].color : T.muted, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.ink, fontSize: 15, fontWeight: 600 }}>
                      {catMap[e.categoryId] ? catMap[e.categoryId].name : "미분류"}
                      <span style={{ fontSize: 12.5, marginLeft: 6, fontWeight: 700, color: (e.paymentMethod || "cash") === "card" ? T.gold : T.good }}>
                        {(e.paymentMethod || "cash") === "card" ? "카드" : "현금"}
                      </span>
                    </div>
                    {e.memo && <div style={{ color: T.mode === "dark" ? "#7A6E52" : "#8A7E5E", fontSize: 13 }}>{e.memo}</div>}
                  </div>
                  <div style={{ color: T.ink, fontFamily: F.mono, fontWeight: 700, fontSize: 15 }}>{fmtWon(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

