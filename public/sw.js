import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

// vite-plugin-pwa(injectManifest 방식)가 빌드할 때 이 배열을 그 빌드로 실제 나온
// 파일 목록(파일명+콘텐츠 해시)으로 바꿔치기함. precacheAndRoute가 이 목록을 install
// 시점에 미리 받아서 캐시해두고, 목록에 있는 요청은 캐시에서 바로 응답해줌 — 그래서
// 오프라인 상태로 처음 켜거나 아직 한 번도 안 들어가본 탭이어도 뜰 수 있음.
// cleanupOutdatedCaches는 새로 배포될 때마다 이전 배포에서 캐시해둔 옛 파일들을 자동
// 정리해줌(예전엔 이걸 손으로 캐시 이름 버전(v1→v2)을 올려가며 관리했었음).
const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();

// precacheAndRoute가 이미 응답을 처리하는 경로는 아래 커스텀 핸들러에서 건드리면
// 안 됨(같은 요청에 respondWith를 두 번 부르면 에러남) — 그 목록을 미리 뽑아둠.
// "/" 요청은 precacheAndRoute가 기본적으로 index.html에 매핑해서 처리하므로 같이 포함.
const precachedPaths = new Set(
  manifest.map((entry) => "/" + String(typeof entry === "string" ? entry : entry.url).replace(/^\/+/, ""))
);
if (precachedPaths.has("/index.html")) precachedPaths.add("/");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 위 precache 목록에 없는 요청(예: manifest.webmanifest처럼 새로 추가되거나 목록에
// 안 실린 것들)만 여기서 처리 — 네트워크 우선으로 최신을 받아오고, 오프라인이면
// 캐시로 대체.
const RUNTIME_CACHE = "passbook-runtime-cache";

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (precachedPaths.has(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
