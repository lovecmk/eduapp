import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initTheme } from './composables/useTheme';
import './styles/base.css';

// 테마는 앱을 만들기 전에 적용한다 — 마운트 후에 바꾸면 라이트 화면이
// 한 프레임 번쩍이고 다크로 넘어간다(다크 사용자에게 특히 거슬린다).
initTheme();

const app = createApp(App);

// Pinia 를 라우터보다 먼저 붙인다 — 라우터 가드가 auth 스토어를 읽기 때문에
// 순서가 바뀌면 "no active Pinia" 로 첫 진입이 깨진다.
app.use(createPinia());
app.use(router);

/*
 * 첫 경로가 정해진 뒤에 마운트한다.
 *
 * 그냥 mount 하면 첫 렌더가 **아직 해석되지 않은 기본 경로**로 그려진다.
 * route.meta.public 이 undefined 라 로그인 화면인데도 사이드바·상단 바가 붙은
 * 관리 화면이 한 프레임 그려지고, 그 상단 바가 곧바로 실시간 스트림을 연다 —
 * 토큰이 없으니 서버는 401 로 끊고, 화면은 그 뒤에야 로그인으로 넘어간다.
 *
 * 경로가 정해질 때까지 기다리면 둘 다 사라진다: 껍데기가 번쩍이지 않고,
 * 인증 없는 요청도 나가지 않는다.
 */
void router.isReady().then(() => app.mount('#app'));
