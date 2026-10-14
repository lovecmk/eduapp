import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

it('uses an already stamped tag without double-incrementing the version or build', () => {
  const root = mkdtempSync(join(tmpdir(), 'd3m-version-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'public'));
    for (const name of ['bump-version.mjs', 'version-core.cjs']) copyFileSync(resolve('scripts', name), join(root, 'scripts', name));
    writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { version: '1.2.3' } }));
    writeFileSync(join(root, 'public/version.json'), JSON.stringify({ version: '1.2.3', buildNumber: 7 }));
    const run = (tag: string) => spawnSync(process.execPath, [join(root, 'scripts/bump-version.mjs'), '--check-tag', tag], { cwd: root, encoding: 'utf8' });
    expect(run('v1.2.3-abc1234').status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'))).toMatchObject({ version: '1.2.3', buildNumber: 7 });
    expect(run('v1.2.4-abc1234').status).not.toBe(0);
    expect(run('v1.2.3-invalid').status).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
