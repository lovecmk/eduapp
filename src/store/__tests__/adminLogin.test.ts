import fs from 'fs';
import path from 'path';

describe('관리자 인증 우회 제거', () => {
  it('로고 터치나 임의 계정으로 관리자 세션을 만들지 않는다', () => {
    const auth = fs.readFileSync(path.resolve(__dirname, '../authStore.ts'), 'utf8');
    const login = fs.readFileSync(path.resolve(__dirname, '../../../app/(auth)/login.tsx'), 'utf8');
    expect(auth).not.toMatch(/adminLogin|ADMIN_DEMO_USER|isAdmin: true/);
    expect(login).not.toMatch(/onLogoTap|SOCIAL_ACCOUNT|adminLogin/);
  });
});
