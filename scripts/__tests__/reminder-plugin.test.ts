const { registerPackage } = require('../../plugins/withReminderAlarm');

it.each([
  'val packages = PackageList(this).packages\n return packages',
  'PackageList(this).packages.apply {\n }',
])('registers once on supported Kotlin host templates', source => {
  const result = registerPackage(source);
  expect(result.match(/ReminderAlarmPackage\(\)/g)).toHaveLength(1);
  expect(registerPackage(result)).toBe(result);
});
it('fails clearly rather than shipping a host without the alarm bridge', () => {
  expect(() => registerPackage('unsupported host')).toThrow('anchor was not found');
});
