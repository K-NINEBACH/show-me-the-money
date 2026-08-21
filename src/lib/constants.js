// Small config values shared across the app that don't depend on anything else,
// so both the data layer and the UI layer can import them without a circular import.

// NOTE: storage key kept stable across revisions on purpose so existing user data
// (expenses, categories, balance entries) survives future updates via migrate().
export const STORAGE_KEY = "passbook-data-v4";
export const PALETTE = ["#C79A46", "#5B8A62", "#B6473F", "#3E6E8E", "#8A5FA0", "#C97C3D", "#4E7A6B", "#A85C7A"];
// Trimmed from 6 to the 4 actually used often — a full row of 6 buttons was
// mostly just visual weight on every money input across the app.
export const QUICK_AMOUNTS = [
  { n: 1000, label: "천원" },
  { n: 10000, label: "만원" },
  { n: 50000, label: "오만원" },
  { n: 100000, label: "십만원" },
];
