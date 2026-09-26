// Small presentational pieces shared by several screens.
import { Utensils, Coffee, Bus, Fuel, ShoppingBag, ShoppingCart, Pill, Smartphone, Home, GraduationCap, Film, Receipt, Wallet, Car, Gift } from "lucide-react";
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
            background: sortKey === s.key ? T.gold : "transparent", color: sortKey === s.key ? T.onGold : T.muted }}
          aria-pressed={sortKey === s.key}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// id를 주면 바깥 <label htmlFor>와 이어진다 — 라벨을 눌러도 칸에 들어가고,
// 스크린리더가 이 칸이 무엇인지 읽는다. 라벨이 따로 없는 자리는 ariaLabel로.
export function MoneyInput({ value, onChange, placeholder, big, autoFocus, id, ariaLabel }) {
  const T = useTheme();
  const display = value !== "" && value != null && !Number.isNaN(Number(value)) ? Number(value).toLocaleString("ko-KR") : "";
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    onChange(raw);
  };
  return (
    <div style={{ position: "relative" }}>
      <input type="text" inputMode="numeric" autoFocus={autoFocus} value={display} onChange={handleChange} placeholder={placeholder || "0"}
        id={id} aria-label={ariaLabel}
        style={{ ...inputSty(T), fontFamily: F.mono, fontVariantNumeric: "tabular-nums", paddingRight: 36, ...(big ? { fontSize: 21.5, fontWeight: 600 } : {}) }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: big ? 14 : 12.5, pointerEvents: "none" }}>원</span>
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

export function NavBtn({ icon: Icon, label, active, onClick }) {
  const T = useTheme();
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0", cursor: "pointer", color: active ? T.gold : T.muted, transition: "color 150ms ease-out, scale 150ms ease-out" }}>
      <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
      <span style={{ fontSize: 13, fontFamily: F.body, fontWeight: active ? 700 : 500 }}>{label}</span>
    </button>
  );
}

export function SectionLabel({ children }) {
  const T = useTheme();
  return <div style={{ color: T.goldSoft, fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 4, paddingLeft: 2 }}>{children}</div>;
}

/*
  htmlFor를 주면 제목이 진짜 <label>이 되어 그 칸과 이어진다. 안 주면 예전처럼
  그냥 글자다 — 설정 화면처럼 한 Field 안에 버튼이 여럿인 곳을 <label>로 감싸면
  제목을 눌렀을 때 첫 버튼(예: '내보내기')이 눌려 버리기 때문이다.
*/
export function Field({ label, children, htmlFor }) {
  const T = useTheme();
  const labelStyle = { display: "block", color: T.muted, fontSize: 15, marginBottom: 7 };
  return (
    <div style={{ marginBottom: 16 }}>
      {htmlFor ? <label htmlFor={htmlFor} style={labelStyle}>{label}</label> : <div style={labelStyle}>{label}</div>}
      {children}
    </div>
  );
}

/*
  **카테고리 아이콘 동그라미**(2026-09-26 새 디자인 — 내역·달력). 카테고리 이름에서 알맞은 그림을 고르고,
  카테고리 색을 옅게 깐 동그라미 안에 그 색으로 그린다. 사용자가 이름을 자유롭게 짓기 때문에 낱말로 고르고,
  못 고르면 영수증 그림.
*/
const CAT_ICONS = [
  [/식비|음식|외식|배달|밥/, Utensils], [/카페|커피|디저트/, Coffee], [/주유|기름/, Fuel],
  [/차량|자동차|정비|하이패스|통행/, Car], [/교통|버스|지하철|택시/, Bus], [/마트|장보기|생필/, ShoppingCart],
  [/쇼핑|의류|옷/, ShoppingBag], [/의료|병원|약|건강/, Pill], [/통신|휴대폰|핸드폰|인터넷/, Smartphone],
  [/주거|관리비|월세|생활|집/, Home], [/교육|학원|책/, GraduationCap], [/여가|문화|영화|취미|구독/, Film],
  [/선물|경조|모임/, Gift], [/급여|월급|입금|수입/, Wallet],
];
export function iconForCategory(name) {
  const n = String(name || "");
  return (CAT_ICONS.find(([re]) => re.test(n)) || [null, Receipt])[1];
}
export function CatBadge({ name, color, size = 36, icon }) {
  const T = useTheme();
  const Icon = icon || iconForCategory(name);
  const c = color || T.muted;
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, width: size, height: size, borderRadius: "50%", background: `${c}1F`, color: c, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={2.2} />
    </span>
  );
}
