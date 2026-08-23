// 배포 때마다 파일명 뒤 해시가 바뀌므로 버전을 올리면 activate에서 옛 캐시를 통째로 지움.
const CACHE = "passbook-cache-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // v1 시절부터 매번 fetch마다 캐시에 계속 쌓이기만 하고 지워진 적이 없어서, 배포할
  // 때마다 이전 해시의 JS 파일들이 브라우저 캐시에 그대로 누적돼 있었음 — 버전을
  // 올릴 때마다 이전 캐시를 통째로 지워서 안 쓰는 옛 파일이 계속 쌓이지 않게 함.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Vite가 내보내는 /assets/*.js는 파일명에 콘텐츠 해시가 붙어있어서, 캐시에
  // 있으면 그게 곧 최신본이라는 뜻임(내용이 바뀌면 파일명 자체가 바뀌니까).
  // 예전처럼 매번 네트워크부터 갔다 오면 앱을 켤 때마다 큰 JS 파일을 다시
  // 받아오느라 느리게 느껴졌음 — 캐시에 있으면 그걸로 즉시 응답하고, 새 배포
  // 확인용으로 네트워크 요청은 백그라운드로만 보내서 다음번 캐시를 채워둠.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => { caches.open(CACHE).then((cache) => cache.put(event.request, res.clone())); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // index.html·manifest·아이콘 등은 배포 갱신을 바로 반영해야 하니 네트워크
  // 우선, 오프라인일 때만 캐시로 대체.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
