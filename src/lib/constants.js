// Small config values shared across the app that don't depend on anything else,
// so both the data layer and the UI layer can import them without a circular import.

// NOTE: storage key kept stable across revisions on purpose so existing user data
// (expenses, categories, balance entries) survives future updates via migrate().
export const STORAGE_KEY = "passbook-data-v4";

// 결제 알림함(보류된 알림). 가계부 데이터와 일부러 다른 칸에 둔다 — 데이터 구조와
// migrate()·백업을 건드리지 않고, 알림함이 어떻게 되든 가계부는 안전하다.
export const INBOX_KEY = "passbook-inbox-v1";

// 이미 한 번 받아 처리한 알림 문구. 껍데기는 다시 연결될 때(재시작·업데이트) 알림창에
// 남은 알림을 또 넘기는데, 이걸로 두 번 처리하지 않는다. 가계부 데이터와 다른 칸.
export const SEEN_KEY = "passbook-seen-v1";
export const PALETTE = ["#C79A46", "#5B8A62", "#B6473F", "#3E6E8E", "#8A5FA0", "#C97C3D", "#4E7A6B", "#A85C7A"];
// Trimmed from 6 to the 4 actually used often — a full row of 6 buttons was
// mostly just visual weight on every money input across the app.
export const QUICK_AMOUNTS = [
  { n: 1000, label: "천원" },
  { n: 10000, label: "만원" },
  { n: 50000, label: "오만원" },
  { n: 100000, label: "십만원" },
];
