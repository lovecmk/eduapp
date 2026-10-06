# 개인맞춤형 학습 호환 계약

Expo SDK 52와 기존 학습 API를 유지한다. 새 백엔드 배포 전에는 기존 오늘의 학습과 SRS 정책이 동작한다.

- 가입·프로필의 직무/경력/관심분야는 선택 입력이다. 회사 직무가 있으면 재입력하지 않는다.
- `POST /inner/api/v1/settings`의 기존 설정에 `job`, `experience`, `interests`를 추가한다. 구버전 서버는 추가 필드를 무시하고 서버가 반환하지 않은 선택 필드는 기기 값을 유지한다.
- `POST /inner/api/v1/progress/grade`의 기존 durable 재전송 경로에 `event_id`, 실제 `last_reviewed_at`, `self_check` (`KNOWN`/`REVIEW`), `perceived_difficulty` (`EASY`/`MEDIUM`/`HARD`)를 보낸다.
- 오늘의 배정은 서버가 결정하며 `kind`를 신규/복습으로 표시한다. `recommend_reason`, `recommend_score`는 선택 필드다.
- `personalized=true`와 유효한 `review_policy`가 함께 오면 최초/반복 복습 주기를 적용한다. 로그인이 바뀌거나 구버전 응답이면 기존 SRS로 돌아간다.
- 서버와 공유하는 날짜 키는 KST `YYYY-M-D`이고 월은 기존 계약대로 0부터 시작한다. 시각은 ISO UTC로 전송한다.
- 자유학습도 실제 자가진단·체감난이도 이력에 반영한다. 일일 신규 상한 사용량은 오늘의 학습에서만 보고한다.

## 자동 확인

```powershell
npm test
npm run typecheck
npx expo export --platform web --output-dir dist-audit
npm run test:ui
$env:TZ='UTC'
npx jest --selectProjects logic --runInBand --runTestsByPath src/utils/__tests__/dateKey.test.ts src/data/network/__tests__/personalization.test.ts
Remove-Item Env:TZ
```

통합 감사 보고서는 윈도우 저장소의 `docs/e2e-audit/20261006-audit.md`에 있다. 운영 DB 마이그레이션이나 백엔드 활성화는 이 앱 릴리스에 포함되지 않는다. `main` push 후 기존 APK 워크플로가 버전을 계산하고 릴리스 태그와 APK를 생성하므로 수동으로 중복 태그/빌드를 만들지 않는다.
