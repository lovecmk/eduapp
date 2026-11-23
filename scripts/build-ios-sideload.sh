#!/bin/zsh
# 유료 Apple 개발자 계정 없이 테스트 사용자에게 나눠 줄 iOS IPA(서명 없음)를 만든다.
#
#   npm run ios:sideload            # 현재 체크아웃(version.json) 기준으로 빌드
#
# 결과물: $OUT_ROOT/eduapp-<version>/eduapp-<version>-ios-sideload.ipa (+ SHA256SUMS.txt)
# 테스트 사용자는 자기 무료 Apple ID 로 Sideloadly/AltStore 에서 다시 서명해 설치한다.
# 절차와 제약(7일 재서명, 앱 3개 제한, 원격 푸시 불가)은 docs/IOS_SIDELOAD.md 참고.
#
# - 운영 API·목업 해제·빌드 메타데이터는 APK 릴리스(scripts/lib/release-env.mjs)와 같게 굽는다.
# - 무료 계정 프로비저닝은 Push Notifications 권한을 허용하지 않으므로 aps-environment 를 뺀다.
#   (로컬 알림·학습 리마인더는 그대로 동작한다.)
set -eu
root=${0:A:h:h}
cd "$root"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Volumes/KIOXIA_SSD/apps/Xcode.app/Contents/Developer}
OUT_ROOT=${OUT_ROOT:-/Volumes/KIOXIA_SSD/xcode/IPA}
XCODE_WORK=${XCODE_WORK:-/Volumes/KIOXIA_SSD/xcode}

version=$(node -p "require('./version.json').version")
build=$(node -p "require('./version.json').buildNumber")
buildTime=$(node -p "require('./version.json').buildTime")
commit=$(git rev-parse HEAD)
[ "$(node -p "require('./app.json').expo.version")" = "$version" ] || { print "app.json 과 version.json 버전이 다릅니다"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  print "경고: 커밋되지 않은 변경이 있습니다. 번들에는 HEAD($commit) 로 표기됩니다."
fi

export CI=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1
export EXPO_PUBLIC_API_BASE_URL=https://bridge.kfpa.or.kr EXPO_PUBLIC_API_TIMEOUT_MS=10000
export EXPO_PUBLIC_USE_MOCK_DATA=false
export EXPO_PUBLIC_BUILD_NUMBER=$build EXPO_PUBLIC_APP_VERSION=$version
export EXPO_PUBLIC_COMMIT_SHA=$commit EXPO_PUBLIC_BUILD_TIME=$buildTime

print "▶ $version (build $build, ${commit[1,7]}) iOS 네이티브 프로젝트 재생성"
npx expo prebuild --platform ios --clean --no-install
(cd ios && pod install --repo-update >/dev/null)

# RN 0.76 의 fmt 11.0.2 는 최신 Apple clang 에서 consteval 컴파일 오류가 난다. Pod 사본에서만 끈다.
fmt=ios/Pods/fmt/include/fmt/base.h
if [ -f "$fmt" ]; then
  chmod u+w "$fmt"
  sed -i '' 's/define FMT_USE_CONSTEVAL 1/define FMT_USE_CONSTEVAL 0/' "$fmt"
fi

# 무료 계정으로 재서명할 수 없는 원격 푸시 권한 제거
for ent in ios/*/*.entitlements(N); do
  /usr/libexec/PlistBuddy -c 'Delete :aps-environment' "$ent" 2>/dev/null || true
done

scheme=$(basename ios/*.xcworkspace .xcworkspace)
archive=$XCODE_WORK/Archives/eduapp-$version.xcarchive
out=$OUT_ROOT/eduapp-$version
rm -rf "$archive"; mkdir -p "$out"

print "▶ Release 아카이브(서명 없음): $scheme"
# Xcode 27 은 iOS 15 미만 배포 타깃(오래된 Pod 리소스 번들)을 거부하므로 앱과 같은 15.1 로 통일한다.
# Metro reset-cache 가 CI 모드에서 꺼지므로 네이티브 빌드만 CI=0 (AGENTS.md 참고)
CI=0 xcodebuild -workspace "ios/$scheme.xcworkspace" -scheme "$scheme" -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$XCODE_WORK/DerivedData/eduapp" \
  -archivePath "$archive" archive \
  IPHONEOS_DEPLOYMENT_TARGET=15.1 \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  > "$out/xcodebuild.log" 2>&1 || { tail -30 "$out/xcodebuild.log"; print "빌드 실패: $out/xcodebuild.log"; exit 1; }

app=$(find "$archive/Products/Applications" -maxdepth 1 -name '*.app' | head -1)
[ -n "$app" ] || { print "아카이브에 .app 이 없습니다"; exit 1; }

bundle="$app/main.jsbundle"
[ -f "$bundle" ] || { print "JS 번들이 앱에 포함되지 않았습니다"; exit 1; }
grep -q "$commit" "$bundle" || { print "번들에 HEAD 커밋이 없습니다(이전 번들 재사용 의심)"; exit 1; }
grep -q "bridge.kfpa.or.kr" "$bundle" || { print "번들에 운영 API 주소가 없습니다"; exit 1; }
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Info.plist")" = "$version" ] \
  || { print "Info.plist 버전 불일치"; exit 1; }

ipa=$out/eduapp-$version-ios-sideload.ipa
tmp=$(mktemp -d); mkdir "$tmp/Payload"; ditto "$app" "$tmp/Payload/${app:t}"
rm -f "$ipa"; (cd "$tmp" && zip -qry "$ipa" Payload); rm -rf "$tmp"
(cd "$out" && shasum -a 256 "${ipa:t}" > SHA256SUMS.txt)

print "✔ IPA: $ipa"
print "  $(cat "$out/SHA256SUMS.txt")"
