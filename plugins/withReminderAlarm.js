const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

function registerPackage(contents) {
  if (contents.includes('ReminderAlarmPackage()')) return contents;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (anchor.test(contents)) return contents.replace(anchor, match => `${match}\n              add(ReminderAlarmPackage())`);
  const sdk52 = /val packages = PackageList\(this\)\.packages/;
  if (sdk52.test(contents)) return contents.replace(sdk52, match => `${match}\n            packages.add(ReminderAlarmPackage())`);
  throw new Error('ReminderAlarm: Kotlin package registration anchor was not found');
}

function withReminderAlarm(config) {
  config = withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] ??= [];
    const permission = 'android.permission.SCHEDULE_EXACT_ALARM';
    if (!manifest['uses-permission'].some(item => item.$['android:name'] === permission)) manifest['uses-permission'].push({ $: { 'android:name': permission } });
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.receiver ??= [];
    app.receiver = app.receiver.filter(item => item.$['android:name'] !== '.ReminderClockReceiver');
    app.receiver.push({ $: { 'android:name': '.ReminderClockReceiver', 'android:exported': 'false' }, 'intent-filter': [{ action: [
      'android.intent.action.TIME_SET', 'android.intent.action.TIMEZONE_CHANGED', 'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED',
    ].map(name => ({ $: { 'android:name': name } })) }] });
    return cfg;
  });
  config = withMainApplication(config, cfg => {
    if (cfg.modResults.language !== 'kt') throw new Error('ReminderAlarm requires the existing Kotlin Android host');
    cfg.modResults.contents = registerPackage(cfg.modResults.contents);
    return cfg;
  });
  return withDangerousMod(config, ['android', async cfg => {
    const packageName = cfg.android.package;
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    fs.mkdirSync(dir, { recursive: true });
    const template = fs.readFileSync(path.join(__dirname, 'reminder-alarm/ReminderAlarmPackage.kt'), 'utf8');
    fs.writeFileSync(path.join(dir, 'ReminderAlarmPackage.kt'), template.replace('__PACKAGE__', packageName));
    return cfg;
  }]);
}
module.exports = withReminderAlarm;
module.exports.registerPackage = registerPackage;
