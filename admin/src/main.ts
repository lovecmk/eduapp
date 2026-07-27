import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/base.css';

const app = createApp(App);

// Pinia 를 라우터보다 먼저 붙인다 — 라우터 가드가 auth 스토어를 읽기 때문에
// 순서가 바뀌면 "no active Pinia" 로 첫 진입이 깨진다.
app.use(createPinia());
app.use(router);

app.mount('#app');
