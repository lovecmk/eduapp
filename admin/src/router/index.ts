import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

/**
 * 화면 경로.
 *
 * 로그인을 뺀 모든 화면은 인증이 필요하다. 라우트마다 표시하는 대신
 * 로그인 화면에만 `public: true` 를 달고 나머지를 기본 보호로 둔다 —
 * 새 화면을 추가할 때 보호를 **깜빡할 수 없는** 방향으로 기본값을 잡는다.
 *
 * 화면 코드는 동적 import 로 나눠 첫 로딩에 대시보드만 받도록 한다.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '로그인' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: '대시보드' },
  },
  {
    path: '/insight',
    name: 'insight',
    component: () => import('../views/InsightView.vue'),
    meta: { title: '분석' },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { title: '사용자' },
  },
  {
    path: '/users/:id',
    name: 'user-detail',
    component: () => import('../views/UserDetailView.vue'),
    meta: { title: '사용자 상세' },
  },
  {
    path: '/cards',
    name: 'cards',
    component: () => import('../views/CardsView.vue'),
    meta: { title: '문제 관리' },
  },
  {
    path: '/cards/new',
    name: 'card-new',
    component: () => import('../views/CardEditorView.vue'),
    meta: { title: '문제 만들기' },
  },
  {
    path: '/cards/:id/edit',
    name: 'card-edit',
    component: () => import('../views/CardEditorView.vue'),
    meta: { title: '문제 수정' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('../views/ReportsView.vue'),
    meta: { title: '신고 관리' },
  },
  {
    path: '/service',
    name: 'service',
    component: () => import('../views/ServiceView.vue'),
    meta: { title: '서비스 상태' },
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('../views/AuditView.vue'),
    meta: { title: '관리 이력' },
  },
  // 잘못된 주소는 대시보드로 — 관리 콘솔에 별도 404 화면을 둘 만한 가치가 없다.
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory('/admin/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (!to.meta.public && !auth.isAuthenticated) {
    // 로그인 후 원래 가려던 곳으로 돌려보내기 위해 경로를 남긴다.
    return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
  }
  // 이미 로그인했는데 로그인 화면으로 가면 대시보드로 돌린다.
  if (to.meta.public && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · 하루3분ON 관리` : '하루3분ON 관리 콘솔';
});

/**
 * 서버가 세션을 끊었을 때(리프레시까지 실패) 로그인 화면으로 보낸다.
 * API 클라이언트는 라우터를 모르므로 여기서 연결해 준다.
 */
api.setAuthLostHandler(() => {
  const auth = useAuthStore();
  auth.clearSession();
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login', query: { expired: '1' } });
  }
});
