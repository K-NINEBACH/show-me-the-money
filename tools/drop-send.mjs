// Claude → 휴대폰 앱: 옮겨 적은 명세서를 받기 코드로 잠가 public/drops/<해시>.json 에 넣는다(src/lib/drop.js와 짝).
// 사용: node tools/drop-send.mjs <받기코드> <카드이름조각> <명세서.txt> [메모]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const [, , rawCode, card, file, note = ""] = process.argv;
if (!rawCode || !card || !file) { console.error("사용: node drop-send.mjs <받기코드> <카드이름조각> <명세서.txt>"); process.exit(1); }
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
const text = fs.readFileSync(file, "utf8");
const msg = { id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), kind: "statement", card, text, note };
const data = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(msg)));
const b64 = (u) => Buffer.from(u).toString("base64");
const out = path.join(APP, "public", "drops", `${hash}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
let box = { v: 1, messages: [] };
try { box = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* 처음 */ }
box.messages = [...(box.messages || []), { salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) }].slice(-20);
fs.writeFileSync(out, JSON.stringify(box));
console.log("넣음:", path.relative(APP, out).replace(/\\/g, "/"), "· 메시지", box.messages.length, "개 · id", msg.id);
