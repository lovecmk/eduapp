// AGP interprets unexpected Prefab stderr as a CXX error. The Java launcher
// prints JAVA_TOOL_OPTIONS / _JAVA_OPTIONS / JDK_JAVA_OPTIONS on every launch.
// Pass TLS settings quietly to Gradle instead, without changing global settings.
export function androidBuildEnvironment(base, localConfig, platform = process.platform) {
  const env = { ...base, JAVA_HOME: base.LOCAL_RELEASE_JAVA_HOME || localConfig.javaHome || base.JAVA_HOME };
  for (const key of ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS']) delete env[key];
  const trust = platform === 'win32' && localConfig.useWindowsTrustStore
    ? '-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE' : '';
  const jvmArg = '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m' + (trust ? ' ' + trust : '');
  return { env, jvmArg, wrapperJvmArgs: ['-Xmx128m', '-Xms64m', ...(trust ? trust.split(' ') : [])] };
}
