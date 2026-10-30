// 껍데기 APK를 올려 폰이 스스로 업데이트하게 한다(껍데기 1.9부터, android/.../Updater.kt).
//
//   1. android/app/build.gradle.kts의 versionCode·versionName을 올리고 빌드
//   2. node tools/apk-release.mjs
//   3. public/apk/latest.json을 커밋·푸시(Vercel 배포) → 폰이 앱을 열 때 받아 깐다
//
// APK는 저장소가 아니라 GitHub 릴리스(apk-<버전>)에 둔다 — 버전마다 4MB씩 깃이 불어나지 않게.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const gradle = readFileSync(new URL("android/app/build.gradle.kts", root), "utf8");
const versionCode = Number(gradle.match(/versionCode\s*=\s*(\d+)/)[1]);
const versionName = gradle.match(/versionName\s*=\s*"([^"]+)"/)[1];
const apk = new URL("android/app/build/outputs/apk/release/app-release.apk", root);
const bytes = readFileSync(apk);
const sha256 = createHash("sha256").update(bytes).digest("hex");

const repo = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf8" }).trim();
const tag = `apk-${versionName}`;
const name = `passbook-${versionName}.apk`;
const tmp = join(tmpdir(), name);
copyFileSync(apk, tmp);
execFileSync("gh", ["release", "create", tag, tmp, "--title", `껍데기 ${versionName}`, "--notes", `versionCode ${versionCode}`], { stdio: "inherit" });

mkdirSync(new URL("public/apk/", root), { recursive: true });
const info = { versionCode, versionName, url: `https://github.com/${repo}/releases/download/${tag}/${name}`, sha256 };
writeFileSync(new URL("public/apk/latest.json", root), JSON.stringify(info, null, 2) + "\n");
console.log(info);
