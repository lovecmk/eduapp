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

app.mount('#app');
