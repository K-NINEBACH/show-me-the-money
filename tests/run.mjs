// 규칙 시험 전부 돌리기: node tests/run.mjs  (규칙·카드값 계산을 건드린 뒤엔 꼭)
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".test.mjs"))) {
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(path.join(dir, "hook.mjs")).href, path.join(dir, f)], { encoding: "utf8" });
  const fails = (r.stdout || "").split("\n").filter((x) => /FAIL/.test(x));
  console.log(`${r.status === 0 ? "통과" : "실패"}  ${f}${fails.length ? "\n    " + fails.slice(0, 5).join("\n    ") : ""}${r.status !== 0 && !fails.length ? "  " + (r.stderr || "").slice(0, 200) : ""}`);
  if (r.status !== 0) bad++;
}
process.exit(bad ? 1 : 0);
