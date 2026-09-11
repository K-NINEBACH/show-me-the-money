import { createContext, useContext } from "react";

/* ---------- Theme ---------- */
/*
  2026-09-11에 세 토큰을 더했다. 전부 대비를 재서 정한 값이다(WCAG 기준).

    onGold    금색 바탕 위 글자. 예전엔 모든 테마에 #23190C를 박아 둬서, 금색이
              어두운 밝은 테마 5개에서 주 버튼 글자가 3.2~3.9로 기준(4.5) 미달이었다.
              '기록하기'·'결제하기'가 흐릿하게 보이던 이유다.
    field     입력칸 테두리. border(1.25~1.49)로는 칸 경계가 거의 안 보였다.
              입력칸·페이지 둘 다 3:1을 넘는 가장 옅은 값.
    inkMuted  종이(paper) 위 흐린 글자 — 내역의 메모·날짜. 코드에 색이 박혀 있어
              테마를 안 따라갔고 전 테마에서 미달이었다.

  베이지·청록은 금색 자체를 아주 조금 진하게 했다. 흰 글자로 바꿔도 4.45·4.91에
  그쳤고, 금색 글자를 입력칸 바탕에 올린 곳(빠른금액 버튼)도 미달이었다.
*/
export const THEMES = {
  dark: {
    id: "dark", label: "검정", swatch: "#2A2F45", mode: "dark",
    bg: "#161B2E", bg2: "#1E2440", navBg: "rgba(22,27,46,0.95)",
    paper: "#F1E7D0", paperLine: "#D9C9A3", ink: "#2A2419", cream: "#EDE3CB",
    gold: "#C79A46", goldSoft: "#8A6E3A", good: "#5B8A62", warn: "#C97C3D",
    danger: "#B6473F", muted: "#9A9080", border: "#3A3F5C",
    onGold: "#23190C", field: "#726E71", inkMuted: "#5A5138",
  },
  beige: {
    id: "beige", label: "베이지", swatch: "#C9B183", mode: "light",
    bg: "#EAE2D0", bg2: "#F4EEE0", navBg: "rgba(234,226,208,0.95)",
    paper: "#F7F0DD", paperLine: "#D6C6A0", ink: "#241F17", cream: "#241F17",
    gold: "#845E22", goldSoft: "#6E552A", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5C5546", border: "#D2C4A6",
    onGold: "#FFFFFF", field: "#8A806B", inkMuted: "#5C5546",
  },
  white: {
    id: "white", label: "흰색", swatch: "#F5F5F1", mode: "light",
    bg: "#FAFAF8", bg2: "#FFFFFF", navBg: "rgba(250,250,248,0.95)",
    paper: "#FBFBF8", paperLine: "#E6E4DC", ink: "#242320", cream: "#242320",
    gold: "#6B6B63", goldSoft: "#4A4A44", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6E6A5F", border: "#E8E6DE",
    onGold: "#FFFFFF", field: "#949086", inkMuted: "#6E6A5F",
  },
  teal: {
    id: "teal", label: "청록", swatch: "#2E7D6E", mode: "light",
    bg: "#DCEEEA", bg2: "#E9F5F2", navBg: "rgba(220,238,234,0.95)",
    paper: "#E6F2EE", paperLine: "#A9D6CB", ink: "#122824", cream: "#122824",
    gold: "#2B7567", goldSoft: "#1F5A4E", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3E5F58", border: "#A9D6CB",
    onGold: "#FFFFFF", field: "#688D85", inkMuted: "#3E5F58",
  },
  green: {
    id: "green", label: "초록", swatch: "#3E7A3E", mode: "light",
    bg: "#E4EFDE", bg2: "#EEF6E9", navBg: "rgba(228,239,222,0.95)",
    paper: "#EBF3E1", paperLine: "#BEDCAE", ink: "#182A18", cream: "#182A18",
    gold: "#3E7A3E", goldSoft: "#2B562B", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#496249", border: "#BEDCAE",
    onGold: "#FFFFFF", field: "#748F6E", inkMuted: "#496249",
  },
  blue: {
    id: "blue", label: "파랑", swatch: "#2E6DA4", mode: "light",
    bg: "#DFEAF3", bg2: "#EAF3FA", navBg: "rgba(223,234,243,0.95)",
    paper: "#E7F1F8", paperLine: "#AECFE6", ink: "#152531", cream: "#152531",
    gold: "#2E6DA4", goldSoft: "#204C74", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3F5A6B", border: "#AECFE6",
    onGold: "#FFFFFF", field: "#6B899C", inkMuted: "#3F5A6B",
  },
};
export const THEME_ORDER = ["dark", "beige", "white", "teal", "blue", "green"];
export const DARK = THEMES.dark;
export const ThemeContext = createContext(DARK);
export const useTheme = () => useContext(ThemeContext);

export const F = {
  display: "'Noto Serif KR', serif",
  body: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};
export function paperCard(T) {
  return { background: T.paper, borderRadius: 14, padding: "16px 14px", boxShadow: T.mode === "dark" ? "0 8px 24px rgba(0,0,0,0.25)" : "0 6px 20px rgba(80,60,20,0.12)", backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 27px, ${T.paperLine}66 28px)` };
}
// outline을 끄지 않는다 — 어느 칸에 들어가 있는지 보여주는 표시는 index.html의
// :focus-visible 규칙이 테마 색(--focus)으로 그린다. 예전엔 outline:none만 있고
// 대신할 표시가 없어서, 칸을 눌러도 어디에 쓰고 있는지 안 보였다.
export function inputSty(T) { return { width: "100%", background: T.bg2, border: `1px solid ${T.field}`, borderRadius: 10, padding: "12px 14px", color: T.cream, fontSize: 15.5 }; }
export function primaryBtn(T) { return { width: "100%", background: T.gold, color: T.onGold, border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 15.5, cursor: "pointer" }; }

/*
  테마 색을 CSS 변수로도 내놓는다. 인라인 style로는 :focus-visible·:active·
  prefers-reduced-motion 같은 걸 못 쓰기 때문에, 그런 규칙은 index.html에 두고
  색만 여기서 받아 간다. App이 테마가 바뀔 때마다 부른다.
*/
export function applyThemeVars(T) {
  const s = document.documentElement.style;
  s.setProperty("--focus", T.gold);
  s.setProperty("--field", T.field);
  s.setProperty("--bg", T.bg);
}
