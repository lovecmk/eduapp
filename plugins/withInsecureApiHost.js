const { withAndroidManifest, withInfoPlist, AndroidConfig } = require('expo/config-plugins');

/**
 * 평문(http://) API 서버에 붙는 빌드에만 네이티브 예외를 붙이는 설정 플러그인.
 *
 * 왜 필요한가 — 안드로이드 9(API 28)부터, iOS 는 ATS 도입 이후로 앱의 평문 HTTP
 * 통신이 **기본 차단**된다. 개발 중 Expo Go 에서는 잘 되던 것이 릴리스 APK 에서만
 * 조용히 실패하고, 화면에는 "네트워크에 연결할 수 없어요" 한 줄만 뜬다 —
 * 서버는 멀쩡한데 원인을 서버에서 찾게 되는, 가장 시간을 많이 잡아먹는 실패다.
 *
 * 사내 테스트 서버(http://test.inplat.org:8090)가 평문이라 예외가 필요하지만,
 * 그 예외를 app.json 에 상수로 박아 두면 **운영 빌드에도 그대로 실린다**. 운영은
 * https(bridge.kfpa.or.kr) 라 예외가 필요 없고, 실려 있으면 앱이 평문 통신을
 * 허용한 채로 스토어에 올라간다(플레이스토어·앱스토어 심사 지적 사항이기도 하다).
 *
 * 그래서 이 플러그인은 app.config.js 가 **API 주소가 http:// 일 때만** 건다.
 * 주소를 https 로 바꾸는 것만으로 예외가 사라진다 — 지우는 것을 잊을 자리가 없다.
 *
 * iOS 는 도메인 단위 예외를 지원하므로 그 호스트 하나만 연다.
 * 안드로이드의 도메인 단위 제한은 별도 XML 리소스(network_security_config)가
 * 필요해, 여기서는 평문 빌드에 한해 앱 전체 플래그를 켠다(운영 빌드에는 없음).
 */
module.exports = function withInsecureApiHost(config, { host } = {}) {
  if (!host) return config;

  config = withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    const ats = cfg.modResults.NSAppTransportSecurity || {};
    ats.NSExceptionDomains = {
      ...(ats.NSExceptionDomains || {}),
      [host]: {
        NSExceptionAllowsInsecureHTTPLoads: true,
        NSIncludesSubdomains: true,
      },
    };
    cfg.modResults.NSAppTransportSecurity = ats;
    return cfg;
  });

  return config;
};
