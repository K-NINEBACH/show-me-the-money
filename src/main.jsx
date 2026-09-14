import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/*
  **새 버전은 알아서 바로 쓴다**(2026-09-14, 사용자 — "추가적인 제스처나 행동 없이").

  서비스워커는 새 파일을 받자마자 교체(skipWaiting·clients.claim)까지는 했는데, 이미 떠 있는
  화면은 옛 코드 그대로라 앱을 두 번 열어야 새 화면이 떴다. 이제
    · 화면으로 돌아올 때마다(그리고 켜 둔 동안 30분마다) 새 버전이 있는지 묻고,
    · 서비스워커가 바뀌면(controllerchange) 화면을 한 번 새로 고친다.
  데이터는 바뀔 때마다 저장되므로 새로 고쳐도 잃는 게 없다. 다만 글자를 입력하는 중이면
  입력칸을 벗어날 때까지 기다린다. 처음 설치할 때(원래 서비스워커가 없던 때)는 새로 안 고친다.
*/
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const typing = () => {
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  };
  const reloadSoon = () => {
    if (reloading) return;
    if (typing()) {
      document.addEventListener("focusout", () => setTimeout(reloadSoon, 300), { once: true });
      return;
    }
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) reloadSoon();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // 등록이 막힌 환경(시험용 브라우저 등)에선 reg가 비어 온다 — 그때 오류를 내지 않게
      const check = () => { if (document.visibilityState === "visible") reg?.update?.()?.catch?.(() => {}); };
      document.addEventListener("visibilitychange", check);
      window.addEventListener("passbook-native-resume", check);
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => {});
  });
}
