import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 관리 콘솔 빌드 설정.
 *
 * base: '/admin/' — Caddy 가 같은 도메인의 /admin 경로에 이 정적 파일을 물린다.
 * 백엔드와 같은 오리진에 두면 CORS 설정도, 쿠키/헤더 문제도 생기지 않는다.
 *
 * dev 서버의 /api 프록시 — 개발 중에는 Vite(5174)와 Go(8080)가 다른 포트라
 * 브라우저가 교차 출처로 본다. 프록시로 같은 출처처럼 만들어, 개발과 운영의
 * 요청 경로를 동일하게(/api/...) 유지한다.
 */
export default defineConfig({
  plugins: [vue()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.ADMIN_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        // SSE 는 응답을 조금씩 흘려보낸다. 프록시가 버퍼링하면 대시보드가 멈춘 것처럼 보인다.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    // 소스맵을 남기지 않는다 — 관리 콘솔의 내부 로직을 굳이 공개할 이유가 없다.
    sourcemap: false,
  },
});
