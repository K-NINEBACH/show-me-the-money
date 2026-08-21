import React from "react";
import { DARK, F, primaryBtn } from "../lib/theme";

// Catches render-time errors anywhere below it so a bug doesn't just show a blank
// white screen — data in localStorage is untouched either way, only the UI crashed.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const T = DARK;
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F.body, padding: 24, textAlign: "center" }}>
        <div style={{ color: T.cream, fontFamily: F.display, fontSize: 18, fontWeight: 700, marginBottom: 10 }}>문제가 생겼어요</div>
        <div style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.6, marginBottom: 24 }}>
          화면을 표시하는 중 오류가 발생했어요.<br />기록해둔 데이터는 그대로 남아있어요.
        </div>
        <button onClick={() => window.location.reload()} style={{ ...primaryBtn(T), padding: "12px 26px", width: "auto" }}>새로고침</button>
      </div>
    );
  }
}
