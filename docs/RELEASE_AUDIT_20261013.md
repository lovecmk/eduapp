# App 배포 점검 — 2026-10-13

작성: Codex. 목적: 배포 전 수정 및 검증 기록. 근거: 사용자 요구, AGENTS.md, 로컬 빌드·테스트 및 실제 daily3min DB API 검증.

- OX 보기가 O/X 순서의 두 항목이 아니면 채점하지 않는다. 해설형의 잘못된 정답 필드는 버린다. 회귀 테스트를 추가했다.
- Expo SDK 52를 유지하면서 tar 7.5.21, shell-quote 1.11.0, handlebars 보안 패치를 적용했다. `npm ci`의 postinstall이 SDK 52 CLI의 tar default export 호환을 재현하며, Android prebuild로 실제 확인했다.
- 타입 검사와 Jest 113 suites / 978 tests, Android/iOS Hermes·웹 export, Android native prebuild를 통과했다. 웹 화면 및 상호작용 46건은 320px 폭과 로그아웃 상태 진입까지 확인했다.
- UI 자동화는 mock 번들로 실행한다. 환경을 바꿀 때는 `expo export --clear`를 사용해 이전 production 환경의 Metro cache를 재사용하지 않는다. 외부 요청은 테스트에서 차단한다.
- 실제 DB에서 스튜디오→배포→앱 카드 DTO→학습을 확인했다. format_nm·improvement_txt·note_txt 저장 및 반환은 이미 구현되어 있으며 실데이터 왕복을 검증했다.
- npm audit prod: critical 0 / high 44 / moderate 22. dev 포함: critical 0 / high 67 / moderate 22. 잔여 항목을 모두 없애려면 Expo/RN SDK의 공동 업그레이드가 필요하다. core 패키지를 개별 major로 올리지 않았다.

실기기 알림·생체 인증·카메라 권한, 실제 직원 계정 로그인, iOS 서명 설치는 별도 실환경 확인이 필요하다. Android APK는 기존 GitHub Actions의 native 빌드 결과까지 확인한다.

릴리스는 main의 원본 커밋을 기반으로 기존 Actions가 다음 버전과 build number를 계산한다. APK 태그는 `v<버전>-<원본 짧은 커밋>` 형식이며 APK 빌드 성공 후 Releases에 생성된다. 로컬에서 `bump-version.mjs`를 먼저 실행하면 Actions에서 버전이 한 번 더 오르므로 이번 릴리스에서는 수행하지 않는다.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-13 | OX 방어, 의존성 보안 패치, SDK CLI 호환, 빌드·화면 검증 |
