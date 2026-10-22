// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 변환 프로세스가 CPU 수만큼 늘면 Gradle과 함께 실행할 때 메모리를 소진한다.
// 캐시를 비우는 배포 빌드도 일반 PC에서 안정적으로 완료되도록 제한한다.
config.maxWorkers = Math.min(config.maxWorkers, 2);

// SDK 52는 package "exports" 해석이 기본 활성화되어, 일부 패키지(zustand 등)의
// ESM 빌드(.mjs, `import.meta` 포함)를 끌어와 웹/Hermes 번들 파싱을 깨뜨린다.
// CommonJS(main) 해석으로 되돌려 안정적으로 번들되도록 한다.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
