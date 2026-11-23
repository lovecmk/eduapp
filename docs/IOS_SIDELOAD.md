# iPhone 테스트 배포 (유료 Apple 개발자 계정 없이)

Android는 APK 파일 하나로 설치되지만, iPhone은 **Apple이 서명한 앱만** 실행된다.
유료 개발자 프로그램(연 $99)이 없으면 TestFlight·Ad Hoc 배포를 쓸 수 없으므로,
**서명 없는 IPA를 나눠 주고 테스트 사용자가 자기 무료 Apple ID로 서명해 설치**하는
방식(사이드로딩)을 쓴다. APK 배포와 가장 비슷한 방법이다.

## 1. IPA 만들기 (Mac, 개발자)

```
git pull --ff-only
npm ci
npm run ios:sideload
```

- 결과: `/Volumes/KIOXIA_SSD/xcode/IPA/eduapp-<버전>/eduapp-<버전>-ios-sideload.ipa` + `SHA256SUMS.txt`
- APK 릴리스와 같은 운영 API(`https://bridge.kfpa.or.kr`), 목업 해제, 버전·커밋 메타데이터를 굽는다.
- 빌드 후 번들에 HEAD 커밋과 운영 API가 들어갔는지, Info.plist 버전이 맞는지 스스로 검사한다.
- 무료 계정은 원격 푸시 권한을 받을 수 없어 `aps-environment` 를 뺀다. 학습 리마인더 같은
  **로컬 알림은 동작**하고, 서버발 원격 푸시만 오지 않는다.
- IPA는 구글 드라이브·메신저 등으로 테스트 사용자에게 전달한다(저장소/공개 Release에 올리지 않는다).

## 2. 테스트 사용자 설치 (컴퓨터 1회 필요)

준비물: iPhone(iOS 16 이상 권장), USB 케이블, Windows 또는 Mac 컴퓨터, 본인 Apple ID.
개인 Apple ID 대신 **테스트 전용 Apple ID**를 새로 만들어 쓰기를 권장한다.

### Sideloadly (Windows/Mac, 가장 간단)
1. https://sideloadly.io 에서 설치. Windows는 **Apple 웹사이트판 iTunes·iCloud**(MS Store판 아님)가 필요하다.
2. iPhone을 USB로 연결하고 iPhone에서 "이 컴퓨터를 신뢰" 승인.
3. Sideloadly에 받은 `.ipa` 를 끌어다 놓고 Apple ID 입력 → **Start**.
4. iPhone: **설정 › 개인정보 보호 및 보안 › 개발자 모드** 켜기 → 재시동 → 켜기 확인 (iOS 16+).
5. iPhone: **설정 › 일반 › VPN 및 기기 관리** → 본인 Apple ID 항목 → **신뢰**.
6. 홈 화면의 **하루3분On** 실행.

### AltStore / SideStore (재서명을 폰에서 자동으로)
- AltStore(https://altstore.io): 컴퓨터에 AltServer를 띄워 두면 같은 Wi‑Fi에서 7일마다 자동 갱신.
- SideStore(https://sidestore.io): 최초 설치 후에는 컴퓨터 없이 폰 혼자 갱신.
- 설치 후 앱의 **My Apps › +** 로 IPA를 열면 된다. 4·5단계(개발자 모드·신뢰)는 같다.

## 3. 무료 계정의 제약 — 테스트 사용자에게 꼭 알려 줄 것

| 제약 | 내용 | 대응 |
| --- | --- | --- |
| **7일 만료** | 설치 7일 뒤 앱이 열리지 않는다(데이터는 남음) | Sideloadly로 같은 IPA를 다시 설치하거나 AltStore/SideStore "Refresh" |
| 앱 3개 | 무료 Apple ID당 사이드로드 앱 동시 3개 | 다른 사이드로드 앱 정리 |
| 원격 푸시 없음 | 서버 푸시 알림 미수신 | 로컬 리마인더는 동작 |
| 업데이트 | 새 버전 IPA를 같은 방법으로 덮어 설치하면 로그인·데이터 유지 | JS만 바뀐 경우 앱 내 OTA(expo-updates)도 적용됨 |

## 4. 대안 비교

- **개발자 Mac + Xcode 무료 계정으로 직접 설치**: 테스트 폰을 개발자 Mac에 꽂아야 하고
  역시 7일 만료. 소수(가족·사내 2~3대)일 때만 실용적.
- **웹(PWA) 홈 화면 추가**: 링크만으로 설치·만료 없음이 장점이지만, 현재 운영 API
  (`bridge.kfpa.or.kr`) 웹방화벽이 브라우저 CORS 사전요청(OPTIONS)을 400으로 막고,
  저장소 GitHub Pages도 꺼져 있어 지금은 쓸 수 없다. 서버 측 CORS 허용 또는 같은 도메인
  프록시가 생기면 iPhone 테스트에는 이 방식이 가장 편하다.
- **유료 개발자 계정 가입 시**: TestFlight(최대 1만 명, 링크 초대, 90일)로 전환하는 것이 정석.
  그때는 `/Volumes/KIOXIA_SSD/bin/build-ipa.sh` 의 `TEAM_ID=… release-testing|app-store-connect` 경로를 쓴다.
