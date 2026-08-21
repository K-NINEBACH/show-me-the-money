import { createContext, useContext } from "react";

/* ---------- Theme ---------- */
export const THEMES = {
  dark: {
    id: "dark", label: "검정", swatch: "#2A2F45", mode: "dark",
    bg: "#161B2E", bg2: "#1E2440", navBg: "rgba(22,27,46,0.95)",
    paper: "#F1E7D0", paperLine: "#D9C9A3", ink: "#2A2419", cream: "#EDE3CB",
    gold: "#C79A46", goldSoft: "#8A6E3A", good: "#5B8A62", warn: "#C97C3D",
    danger: "#B6473F", muted: "#9A9080", border: "#3A3F5C",
  },
  beige: {
    id: "beige", label: "베이지", swatch: "#C9B183", mode: "light",
    bg: "#EAE2D0", bg2: "#F4EEE0", navBg: "rgba(234,226,208,0.95)",
    paper: "#F7F0DD", paperLine: "#D6C6A0", ink: "#241F17", cream: "#241F17",
    gold: "#9C6F28", goldSoft: "#6E552A", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#5C5546", border: "#D2C4A6",
  },
  white: {
    id: "white", label: "흰색", swatch: "#F5F5F1", mode: "light",
    bg: "#FAFAF8", bg2: "#FFFFFF", navBg: "rgba(250,250,248,0.95)",
    paper: "#FBFBF8", paperLine: "#E6E4DC", ink: "#242320", cream: "#242320",
    gold: "#6B6B63", goldSoft: "#4A4A44", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#6E6A5F", border: "#E8E6DE",
  },
  teal: {
    id: "teal", label: "청록", swatch: "#2E7D6E", mode: "light",
    bg: "#DCEEEA", bg2: "#E9F5F2", navBg: "rgba(220,238,234,0.95)",
    paper: "#E6F2EE", paperLine: "#A9D6CB", ink: "#122824", cream: "#122824",
    gold: "#2E7D6E", goldSoft: "#1F5A4E", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3E5F58", border: "#A9D6CB",
  },
  green: {
    id: "green", label: "초록", swatch: "#3E7A3E", mode: "light",
    bg: "#E4EFDE", bg2: "#EEF6E9", navBg: "rgba(228,239,222,0.95)",
    paper: "#EBF3E1", paperLine: "#BEDCAE", ink: "#182A18", cream: "#182A18",
    gold: "#3E7A3E", goldSoft: "#2B562B", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#496249", border: "#BEDCAE",
  },
  blue: {
    id: "blue", label: "파랑", swatch: "#2E6DA4", mode: "light",
    bg: "#DFEAF3", bg2: "#EAF3FA", navBg: "rgba(223,234,243,0.95)",
    paper: "#E7F1F8", paperLine: "#AECFE6", ink: "#152531", cream: "#152531",
    gold: "#2E6DA4", goldSoft: "#204C74", good: "#3A6640", warn: "#9A5320",
    danger: "#8C332C", muted: "#3F5A6B", border: "#AECFE6",
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
export function inputSty(T) { return { width: "100%", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", color: T.cream, fontSize: 15.5, outline: "none" }; }
export function primaryBtn(T) { return { width: "100%", background: T.gold, color: "#23190C", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 15.5, cursor: "pointer" }; }
