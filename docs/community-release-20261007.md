# 커뮤니티 재개 및 릴리스 확인 — 2026-10-07

목적: 2026-10-06 인수인계 이후 모바일 main 반영·자동 릴리스 확인 결과와 백엔드 배포 잔여 사항을 남긴다.
작성: Codex, 2026-10-07 (KST).
근거: `docs/community-handoff-20261006.md`, `docs/DEPLOY.md`, `docs/EAS.md`, GitHub Actions/Release API, Git 원격 조회, BE `daily3min/ops/rooftop-README.md`와 `docs/community/20261006-rooftop-audit.md`.

## 모바일 반영 및 검증

- 이전 Android 실행 [37432270983](https://github.com/lovecmk/eduapp/actions/runs/37432270983)은 성공 완료. [v1.13.56-f68fd5b](https://github.com/lovecmk/eduapp/releases/tag/v1.13.56-f68fd5b) 태그와 `eduapp-v1.13.56-f68fd5b.apk` (88,972,335 bytes) 게시를 확인한 뒤 다음 main을 푸시했다.
- 기존 개봉 호환 구현 `237c82766942edc86af87386fddfd26313e7b0fc`와 인계 문서 `99568d7c7ac365210cbbb0dd14aad629aa703c11`을 main에 정상 푸시했다. source SHA는 마지막 문서 커밋인 `99568d7`이다.
- 기존 모바일 CI 규칙을 사용했다. 버전/빌드 번호/태그를 수동 생성하거나 중복 증가시키지 않았다.
- 로컬 `npm run typecheck`, `npm test -- --runInBand` 재실행 성공: **111 suites / 962 tests**. `git diff --check origin/main..HEAD`도 통과했다.
- [웹 빌드/산출물 게시 37542862996](https://github.com/lovecmk/eduapp/actions/runs/37542862996): 성공. CI 전체 테스트와 웹 export, gh-pages 산출물 게시, 자동 manifest 커밋까지 확인.
- 자동 버전 기록 `f5312e8e149ee12691a25c7d0ff30ccbfce589ba`: **v1.13.57 / build 105**, source `99568d7c7ac365210cbbb0dd14aad629aa703c11`. main을 fetch/fast-forward했고 gh-pages의 `version.json`도 같은 버전·빌드·source이다.
- [OTA 37542863014](https://github.com/lovecmk/eduapp/actions/runs/37542863014): 성공. 로그에서 v1.13.57 / build 105, production 브랜치, runtimeVersion `1.11.0`, Android·iOS 게시 확인. 그룹 ID `efbd3bc8-4112-48ca-a806-c943f341d106`; Android `01a1136a-26db-7abc-8fb8-179567b38dbe`, iOS `01a1136a-26db-7b07-82ba-86632bf00168`.
- [Android 37542863054](https://github.com/lovecmk/eduapp/actions/runs/37542863054): 성공. 로그에서도 v1.13.57 / build 105 증가를 확인했다. [v1.13.57-99568d7 릴리스](https://github.com/lovecmk/eduapp/releases/tag/v1.13.57-99568d7)는 2026-10-07 08:12:54 KST 게시됐고 draft false / prerelease true이다. APK는 `eduapp-v1.13.57-99568d7.apk`, 88,972,383 bytes이다. 원격 태그는 자동 버전 기록 `f5312e8e149ee12691a25c7d0ff30ccbfce589ba`를 가리키며 빌드 source는 `99568d7`이다.
- 첨부 APK를 내려받아 GitHub 자산의 크기·SHA-256과 실제 파일이 일치함을 확인했다. SHA-256 `d333a68e41ec4a8d933a64cafe2f7de684b3a40f023686a38cf32cedebc839a6`. APK의 AndroidManifest.xml/classes.dex 존재 및 ZIP 전체 CRC 검사도 통과했다. 실제 기기 설치 검증은 별도 미확인 항목이다.

## 실제 웹 제공 상태

`https://lovecmk.github.io/eduapp/version.json`은 404이며 저장소 API는 `private: true`, `has_pages: false`, Pages API도 404이다. 이는 `docs/UI_AUDIT_2026-10-02.md`에도 기록된 기존 상태다. 웹 빌드와 gh-pages 반영은 성공했지만 실제 웹 사이트 제공 성공으로 보고하지 않는다. 웹 제공이 필요하면 저장소 접근 정책과 계정의 Pages 지원 범위를 확인한 뒤 Settings → Pages에서 gh-pages / root를 설정하거나 승인된 별도 호스팅을 사용해야 한다.

## 백엔드 원격 및 배포 번들

- 원격 인증 조회는 이번에 성공했다. main은 `9ef763792737b7780a78aa85e8b978aa26b22467`이다.
- `v2026.10.06.3` 태그 객체 `770164ccc5a2c6eaff59437b42c63db9f897bd77`, peeled source `9ef763792737b7780a78aa85e8b978aa26b22467`을 원격에서 재확인했다.
- BE 작업 dev 브랜치와 origin/dev의 다른 작업은 병합하거나 푸시하지 않았다. 다른 작업 태그 `.2`도 변경하지 않았다.
- 최신 번들의 실제 위치는 `C:\Users\0745\Desktop\insu\0020_Tauri\.personalization-audit.local\community-linux-final-legacy`이다. 모바일/BE 저장소 내부 경로가 아니다.
- manifest source는 `9ef763792737b7780a78aa85e8b978aa26b22467`, 타깃 linux/amd64. **13개 파일 모두 크기·SHA-256 일치, 불일치 0개**를 이번에 재확인했다. 포함된 rooftop up SQL도 BE 소스 파일과 SHA-256이 일치한다.
- 서버 업로드·서비스 재시작·운영 DB 마이그레이션은 이번 작업에서 수행하지 않았다.

## 배포 담당자가 수행할 사항

1. BE `daily3min/ops/rooftop-README.md`를 따라 기존 서버/DB 설정과 d3m 스키마를 보호된 경로에 백업한다.
2. 운영 PostgreSQL의 대상 스키마가 d3m인지 확인하고, 기존 연결/search_path 설정을 유지하며 `psql -v ON_ERROR_STOP=1 -f daily3min/postgres/migrations/20261006_rooftop.up.sql`을 적용한다. 신규 `community_factions`, `rooftop_claims`와 월간 학습 이력 인덱스가 필요하다.
3. `v2026.10.06.3` / `9ef763792` 소스의 최신 bridge 바이너리를 기존 운영 방식으로 배포하고 서비스를 재시작한다. 번들에 개인화 자료도 들어 있지만 이번 커뮤니티 변경을 위해 회원·티어·개인화 스위치나 개인화 마이그레이션을 추가 적용할 필요는 없다.
4. PostgreSQL 저장소에서 CommunityRewards 주입을 확인한다. Mongo/memory 모드는 503으로 개봉을 차단한다.
5. 전용 테스트 계정으로 진영 최초 선택·동일 선택 재시도·변경 거부, 세 진영 집계, 상자 상태·개봉·내역·도감 보너스·기존 개봉 표시를 확인한다.
6. 동일 상자 재시도/타임아웃 재시도에서 원장·팩·조각이 한 번만 증가하는지, 다른 사용자 내역 접근과 클라이언트 위조가 차단되는지, 기존 `legacy_claims` 상자가 다시 지급되지 않는지 확인한다. 일반 사용자의 학습/회원/잔액 데이터를 임의로 채우지 않는다.
7. Android APK 설치와 기존 Android/iOS 설치본의 OTA 수신·다음 실행 적용을 실제 기기에서 확인한다. OTA는 runtimeVersion `1.11.0`이 일치하는 설치본에만 적용된다.

보상 지급·소비가 시작된 뒤 `20261006_rooftop.down.sql`로 원장을 삭제하는 rollback은 금지한다. 백업을 유지하고 기능 비활성화/서버 rollback 방식으로 대응한다. 구버전 서버에서는 앱이 연결 오류·재확인을 표시하고 로컬 보상 지급으로 대체하지 않는다.

## 운영 읽기 점검과 미확인 항목

이번 인증 없는 읽기 점검 결과 (운영 `https://bridge.kfpa.or.kr`):

| 요청 | 결과 | 의미 |
|---|---|---|
| GET /inner/api/v1/health | 200 / status ok | 기존 서비스 응답 확인 |
| GET /inner/api/v1/community/live | 401 | 인증 요구 확인; 로그인 후 집계 내용은 미확인 |
| GET /inner/api/v1/community/rooftop | 404 | 현재 운영 주소에서 새 조회 API가 제공되지 않음; BE 배포/라우팅 확인 필요 |

- 운영 DB 적용 여부·최신 바이너리 배포·인증된 새 API의 정상 동작은 미확인이다. health 200을 새 기능 배포 성공의 근거로 삼지 않는다.
- 실기기 Android 설치/실행·Android/iOS OTA 다운로드/적용·로그인/개봉/잔액/재시도/기존 상자 무중복 지급은 미확인이다. CI 게시 성공과 기기 수신 성공을 구분한다.
- 실제 웹 사이트 제공은 현재 404이며, Pages 설정/지원 또는 별도 호스팅이 필요하다.
- 인계 문서의 Go daily3min test/vet·bridge/dev 빌드 및 로컬 PG 100만 이력/40개 동시 요청 검증은 이전 실행 결과다. 이번에는 번들 무결성과 원격 source를 재확인했으며 PG 부하 검증을 반복하지 않았다.
- 상위 KFPA 전체 Go 테스트는 이전 실행의 기존 외부 의존 실패 4건(`co/TestReg`, `inits/TestArangoDbInit`, `libutils/encrypt/TestAes254Decrypt`, `libutils/images/TestAA`) 때문에 통과로 보고할 수 없다.
- 서버 보안 보장은 옥상 지급 원장 범위이며, 일반 오프라인 도감 경제 전체를 서버화한 결과는 아니다.

Android 태그 게시가 끝난 뒤 이 결과 문서를 문서 전용 `[skip ci]` 커밋으로 main에 반영했다. 기존 문서 기록 방식에 따라 추가 버전 증가/앱 빌드를 만들지 않는다.
