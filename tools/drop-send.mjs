// Claude → 휴대폰 앱: 옮겨 적은 명세서를 받기 코드로 잠가 public/drops/<해시>.json 에 넣는다(src/lib/drop.js와 짝).
// 사용: node tools/drop-send.mjs <받기코드> <카드이름조각> <명세서.txt> [메모] [--prepaid]
//   --prepaid : 결제일 전에 미리 다 낸 명세서(롯데카드처럼 할부를 한 달 일찍 내는 경우)
//
// 카드값만 카드 앱 숫자로 맞추기(명세서 줄 없이):
//   node tools/drop-send.mjs <받기코드> <카드이름조각> --bill <금액> [메모] [--install <할부이름>:<YYYY-MM>:<금액>]
//   결제일만 넣기(금액은 그대로): node tools/drop-send.mjs <받기코드> <카드이름조각> --payday 12
//                                                      [--row <이름>:<YYYY-MM>:<금액>[:<카테고리>]] (여러 번 가능)
//   --row : 알림이 안 오는 것을 '그 달 한 줄'로 적는다(하이패스·대중교통). 같은 달 줄이 있으면 금액만 갱신.
//           **카드값은 안 건드린다** — 카드값은 --bill로 이미 맞춘 값이라 여기서 더하면 두 번 잡힌다.
//   카드 앱의 '결제 예정 금액'을 그대로 넣는 자리다. 일부 결제·리볼빙처럼 앱 계산이 못 따라갈 때 쓴다.
//   --bill 금액에는 **할부 몫을 빼고** 넣는다 — 할부는 고정지출로 따로 세므로 넣으면 두 번 잡힌다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const prepaid = argv.includes("--prepaid");
const billArg = flag("--bill");
const installArg = flag("--install");
const rowArgs = argv.map((a, i) => (a === "--row" ? argv[i + 1] : null)).filter(Boolean);
const payDayArg = flag("--payday");   // 카드 결제일(매달 N일) — 홈이 "10/12 결제 · 23일 뒤"로 보여 준다
// 기록 한 줄의 날짜 고치기: --fixdate <금액>:<새날짜>[:<지금날짜>[:<적요조각>]]
const fixArg = flag("--fixdate");
// 알림함에 보류된 알림을 지금 규칙으로 다시 넣기: --inbox <문구 조각>  (카드 자리엔 아무 글자나 — 예: -)
const inboxArg = flag("--inbox");
// 값을 가진 옵션과 그 값은 자리 인자에서 뺀다
const skip = new Set();
for (let i = 0; i < argv.length; i++) {
  if (["--bill", "--install", "--row", "--payday", "--fixdate", "--inbox"].includes(argv[i])) { skip.add(i); skip.add(i + 1); }
}
const pos = argv.filter((a, i) => !skip.has(i) && a !== "--prepaid");
const [rawCode, card, third, fourth] = pos;

if (!rawCode || !card || (!billArg && !payDayArg && !fixArg && !inboxArg && !third)) {
  console.error("사용: node drop-send.mjs <받기코드> <카드이름조각> <명세서.txt> [메모] [--prepaid]");
  console.error("      node drop-send.mjs <받기코드> <카드이름조각> --bill <금액> [메모] [--install 이름:YYYY-MM:금액]");
  process.exit(1);
}
// 이 파일(tools/) 한 칸 위가 앱 폴더
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = rawCode.toUpperCase().replace(/[^A-Z2-9]/g, "");
if (code.length !== 20) { console.error("받기 코드는 20자여야 해요:", code.length); process.exit(1); }
const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const hex = (buf) => Buffer.from(buf).toString("hex");
const hash = hex(await subtle.digest("SHA-256", enc.encode("passbook-drop:" + code))).slice(0, 24);
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);

const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let msg;
if (inboxArg) {
  msg = { id, at: new Date().toISOString(), kind: "inbox", card, match: inboxArg };
  console.log(`알림함 다시 넣기: '${inboxArg}'`);
} else if (fixArg) {
  const [amount, date, on, memo] = String(fixArg).split(":");
  if (!Number(String(amount).replace(/[^\d]/g, "")) || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    console.error("--fixdate 는 금액:YYYY-MM-DD[:지금날짜[:적요조각]] 모양이어야 해요:", fixArg); process.exit(1);
  }
  msg = { id, at: new Date().toISOString(), kind: "fixdate", card, amount: Number(String(amount).replace(/[^\d]/g, "")), date, on: on || null, memo: memo || null };
  console.log(`날짜 고치기: ${Number(msg.amount).toLocaleString("ko-KR")}원 → ${date}${on ? ` (지금 ${on})` : ""}${memo ? ` · '${memo}'` : ""}`);
} else if (billArg || payDayArg) {
  const bill = billArg ? Number(String(billArg).replace(/[^\d]/g, "")) : null;
  if (billArg && !Number.isFinite(bill)) { console.error("--bill 금액을 못 읽었어요:", billArg); process.exit(1); }
  let install = null;
  if (installArg) {
    const [name, month, amount] = String(installArg).split(":");
    if (!name || !/^\d{4}-\d{2}$/.test(month || "") || !Number(amount)) {
      console.error("--install 은 이름:YYYY-MM:금액 모양이어야 해요:", installArg); process.exit(1);
    }
    install = { name, month, amount: Number(String(amount).replace(/[^\d]/g, "")) };
  }
  const rows = rowArgs.map((a) => {
    const [name, month, amount, category] = String(a).split(":");
    if (!name || !/^\d{4}-\d{2}$/.test(month || "") || !Number(String(amount).replace(/[^\d]/g, ""))) {
      console.error("--row 는 이름:YYYY-MM:금액[:카테고리] 모양이어야 해요:", a); process.exit(1);
    }
    return { name, month, amount: Number(String(amount).replace(/[^\d]/g, "")), category: category || "교통" };
  });
  msg = { id, at: new Date().toISOString(), kind: "cardbill", card, bill, install, rows, payDay: payDayArg ? Number(payDayArg) : null, memo: third || "" };
  console.log(`카드값 맞추기: ${card} → ${bill == null ? "(금액 그대로)" : `${bill.toLocaleString("ko-KR")}원`}${install ? ` · ${install.name} ${install.month} ${install.amount.toLocaleString("ko-KR")}원` : ""}${rows.length ? ` · 한 줄 기록 ${rows.map((r) => `${r.name} ${r.month} ${r.amount.toLocaleString("ko-KR")}원`).join(", ")}` : ""}`);
} else {
  const text = fs.readFileSync(third, "utf8");
  msg = { id, at: new Date().toISOString(), kind: "statement", card, text, note: fourth || "", prepaid };
}
const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(msg)));
const b64 = (u) => Buffer.from(u).toString("base64");
const out = path.join(APP, "public", "drops", `${hash}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
let box = { v: 1, messages: [] };
try { box = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 처음 */ }
box.messages = [...(box.messages || []), { salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) }].slice(-20);
fs.writeFileSync(out, JSON.stringify(box));
console.log("넣음:", path.relative(APP, out).replace(/\\/g, "/"), "· 메시지", box.messages.length, "개 · id", msg.id);
