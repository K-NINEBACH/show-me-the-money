import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { setFxRates } from "./lib/data";

/*
  **해외 결제의 원화 짐작에 쓸 환율**(2026-10-01). 하루 한 번 받아 두고(1달러 = N원 꼴로 바꿔서) 쓴다.
  못 받으면 저장해 둔 값, 그것도 없으면 data.js의 기본값. 알림 처리보다 늦게 와도 상관없다 — 짐작일 뿐이고
  카드값은 카드 앱 숫자로 맞출 때 정확해진다.
*/
(() => {
  const KEY = "passbook-fx";
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { saved = null; }
  if (saved?.rates) setFxRates(saved.rates);
  if (saved?.at && Date.now() - saved.at < 20 * 3600 * 1000) return;
  fetch("https://open.er-api.com/v6/latest/USD")
    .then((r) => r.json())
    .then((j) => {
      const krw = Number(j?.rates?.KRW);
      if (!(krw > 0)) return;
      const rates = {};
      for (const c of ["USD", "EUR", "JPY", "CNY", "GBP"]) if (Number(j.rates[c]) > 0) rates[c] = krw / Number(j.rates[c]);
      setFxRates(rates);
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates })); } catch { /* 저장 못 해도 이번엔 쓴다 */ }
    })
    .catch(() => {});
})();

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
