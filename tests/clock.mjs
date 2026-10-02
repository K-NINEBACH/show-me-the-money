// 시험용 시계 — 시험이 '오늘'을 기준으로 쓰여 있어서 날짜를 고정한다(환경변수 FAKE_NOW, 기본 2026-09-25 12:00)
const NOW = new Date(process.env.FAKE_NOW || "2026-09-25T12:00:00").getTime();
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};
