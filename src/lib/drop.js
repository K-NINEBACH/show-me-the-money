/*
  **Claude가 대신 넣기 — 암호화된 받은편지함**(2026-09-14).

  사용자: "적어 주면 내가 옮겨서 등록이 아니라, 내가 보여 주면 너가 알아서 그냥 쭉 끝까지 입력해 놔 줘."
  그런데 가계부 데이터는 휴대폰 안(localStorage)에만 있어서 PC의 Claude가 직접 못 넣는다. 배포 주소는
  공개라 내역을 그냥 올릴 수도 없다. 그래서
    · 앱이 처음 한 번 무작위 '받기 코드'를 만들어 설정에 보여 준다. 사용자가 그 코드를 Claude에게 알려 준다.
    · Claude는 캡처를 옮겨 적어 그 코드로 암호화(AES-GCM, 키는 코드에서 PBKDF2로)해
      /drops/<코드의 해시>.json 에 올린다(배포). 코드 없이는 못 연다.
    · 앱은 켤 때·돌아올 때 그 파일을 받아 풀고, 아직 안 적용한 것만 적용한다(적용한 id를 기억).
  코드는 이 휴대폰 localStorage에만 있고 저장소·배포물엔 없다. 파일 이름은 코드의 해시라 코드를 드러내지 않는다.
*/

export const DROP_KEY = "passbook-dropkey-v1";
export const DROP_APPLIED_KEY = "passbook-drop-applied-v1";
export const DROP_LOG_KEY = "passbook-drop-log-v1";

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 I·O·0·1은 뺐다

/** 받기 코드. 없으면 만든다(20자 ≈ 100비트). 화면엔 4자씩 끊어 보여 준다 */
export function dropCode() {
  let code = null;
  try { code = localStorage.getItem(DROP_KEY); } catch { /* 저장소를 못 쓰면 매번 새로 — 그땐 받기가 안 된다 */ }
  if (code && /^[A-Z2-9]{20}$/.test(code)) return code;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  code = Array.from(bytes, (b) => B32[b % 32]).join("");
  try { localStorage.setItem(DROP_KEY, code); } catch { /* 위와 같다 */ }
  return code;
}
export const showCode = (code) => code.replace(/(.{4})(?=.)/g, "$1-");
const norm = (code) => String(code || "").toUpperCase().replace(/[^A-Z2-9]/g, "");

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function dropPath(code) {
  return `/drops/${(await sha256Hex("passbook-drop:" + norm(code))).slice(0, 24)}.json`;
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(code, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(norm(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
async function open(code, msg) {
  const key = await keyFrom(code, b64(msg.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(msg.iv) }, key, b64(msg.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

/** 올라온 것 중 아직 적용 안 한 것. 파일이 없거나 못 풀면 빈 목록 */
export async function fetchDrops() {
  if (!globalThis.crypto?.subtle) return [];
  const code = dropCode();
  let res;
  try { res = await fetch(await dropPath(code), { cache: "no-store" }); } catch { return []; }
  if (!res.ok) return [];
  let box;
  try { box = await res.json(); } catch { return []; }
  let applied = [];
  try { applied = JSON.parse(localStorage.getItem(DROP_APPLIED_KEY) || "[]"); } catch { applied = []; }
  const out = [];
  for (const msg of box?.messages || []) {
    try {
      const m = await open(code, msg);
      if (m?.id && !applied.includes(m.id)) out.push(m);
    } catch { /* 다른 코드로 잠긴 것·깨진 것은 건너뛴다 */ }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function markApplied(ids, logRows) {
  try {
    const applied = JSON.parse(localStorage.getItem(DROP_APPLIED_KEY) || "[]");
    localStorage.setItem(DROP_APPLIED_KEY, JSON.stringify([...applied, ...ids].slice(-200)));
    const log = JSON.parse(localStorage.getItem(DROP_LOG_KEY) || "[]");
    localStorage.setItem(DROP_LOG_KEY, JSON.stringify([...log, ...logRows].slice(-30)));
  } catch { /* 못 적어도 앱은 돈다 — 다음에 또 적용하려 들면 명세서 맞추기는 두 번 해도 같다 */ }
}

export function dropLog() {
  try { return JSON.parse(localStorage.getItem(DROP_LOG_KEY) || "[]"); } catch { return []; }
}
