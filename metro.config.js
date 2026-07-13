// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// SDK 52는 package "exports" 해석이 기본 활성화되어, 일부 패키지(zustand 등)의
// ESM 빌드(.mjs, `import.meta` 포함)를 끌어와 웹/Hermes 번들 파싱을 깨뜨린다.
// CommonJS(main) 해석으로 되돌려 안정적으로 번들되도록 한다.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
