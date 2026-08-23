import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // 손으로 짠 public/sw.js는 그대로 두되(injectManifest 방식), 빌드마다 파일명이
    // 바뀌는 해시 붙은 산출물 목록을 빌드 시점에 self.__WB_MANIFEST 자리에 자동으로
    // 채워 넣어줌 — 그래서 앱을 처음 설치한 직후 오프라인이거나, 아직 한 번도
    // 안 들어가본 탭이어도(예: 인터넷 없이 켠 첫 실행) 미리 캐시돼 있어서 뜸.
    // manifest.webmanifest는 이미 손으로 잘 관리하고 있어서 이 플러그인이 손 안 대게
    // manifest:false, 서비스워커 등록도 main.jsx에서 이미 직접 하고 있어서
    // injectRegister:false로 중복 등록 안 되게 함.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw.js",
      manifest: false,
      injectRegister: false,
      injectManifest: {
        // 아이콘도 몇 KB 안 되니 같이 미리 캐시 — 오프라인 첫 실행에서도 아이콘 안 깨지게.
        globPatterns: ["**/*.{js,css,html}", "icons/*.png"],
        // main.jsx가 navigator.serviceWorker.register("/sw.js")를 {type:"module"} 없이
        // 부르고 있어서(옛 브라우저 호환) 빌드 결과물도 import 문 없는 클래식 스크립트여야
        // 함 — workbox-precaching import까지 전부 한 파일로 번들링되게 iife로 지정.
        rollupFormat: "iife",
      },
    }),
  ],
});
