// Small presentational pieces shared by several screens.
import { useTheme, F, inputSty, primaryBtn } from "../lib/theme";
import { QUICK_AMOUNTS } from "../lib/constants";
import { FIXED_SORTS } from "../lib/data";

export function FixedSortTabs({ sortKey, setSortKey }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
      {FIXED_SORTS.map((s) => (
        <button key={s.key} onClick={() => setSortKey(s.key)}
          style={{ border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: sortKey === s.key ? T.gold : "transparent", color: sortKey === s.key ? "#23190C" : T.muted }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function MoneyInput({ value, onChange, placeholder, big, autoFocus }) {
  const T = useTheme();
  const display = value !== "" && value != null && !Number.isNaN(Number(value)) ? Number(value).toLocaleString("ko-KR") : "";
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    onChange(raw);
  };
  return (
    <div style={{ position: "relative" }}>
      <input type="text" inputMode="numeric" autoFocus={autoFocus} value={display} onChange={handleChange} placeholder={placeholder || "0"}
        style={{ ...inputSty(T), fontFamily: F.mono, paddingRight: 36, ...(big ? { fontSize: 21.5, fontWeight: 600 } : {}) }} />
      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: big ? 14 : 12.5, pointerEvents: "none" }}>원</span>
    </div>
  );
}

export function QuickAmountButtons({ amount, setAmount }) {
  const T = useTheme();
  const add = (n) => setAmount(String((Number(amount) || 0) + n));
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {QUICK_AMOUNTS.map((o) => (
        <button key={o.n} type="button" onClick={() => add(o.n)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg2, color: T.gold, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
          +{o.label}
        </button>
      ))}
    </div>
  );
}

export function OnboardStep({ children }) {
  return <div style={{ width: "100%" }}>{children}</div>;
}

export function GoogleFonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
      * { box-sizing: border-box; }
      input, select { font-family: inherit; }
      ::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

export function NavBtn({ icon: Icon, label, active, onClick }) {
  const T = useTheme();
  return (
    <button onClick={onClick} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0", cursor: "pointer", color: active ? T.gold : T.muted, transition: "color 0.2s" }}>
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
      <span style={{ fontSize: 13, fontFamily: F.body, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

export function SectionLabel({ children }) {
  const T = useTheme();
  return <div style={{ color: T.goldSoft, fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 4, paddingLeft: 2 }}>{children}</div>;
}

export function Field({ label, children }) {
  const T = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.muted, fontSize: 15, marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

export function StatCard({ label, value }) {
  const T = useTheme();
  return (
    <div style={{ flex: 1, background: T.bg2, border: `1px solid ${T.goldSoft}44`, borderRadius: 12, padding: "10px 10px" }}>
      <div style={{ color: T.muted, fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ color: T.cream, fontFamily: F.mono, fontSize: 15.5, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
