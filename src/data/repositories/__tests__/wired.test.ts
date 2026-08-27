import fs from 'fs';
import path from 'path';

/**
 * 내보낸 저장소가 실제로 **쓰이고 있는지** 지킨다.
 *
 * ── 왜 이런 시험이 필요한가 ────────────────────────────────────────────
 * 네 개의 저장소가 완성된 채로 오랫동안 죽어 있었다. `progressRepository`,
 * `engagementRepository`, `reportRepository`, `notificationRepository` —
 * 인터페이스도, HTTP 구현도, 서버 엔드포인트도 다 있었는데 **어디에서도
 * import 하지 않았다.**
 *
 * 컴파일러는 아무 말도 하지 않는다. index.ts 가 export 하고 있으니 '쓰이는
 * 코드'로 보이고, 타입도 맞고, 시험도 통과한다. 화면은 로컬 스토어로 멀쩡히
 * 돌아서 사람 눈에도 안 띈다.
 *
 * 그 결과가 운영 DB 에 그대로 남아 있었다 — 어떤 사용자가 이틀에 걸쳐 11장을
 * 학습했는데 `srs_state`·`learn_history`·`attendance`·`engagement`·`reports`·
 * `notifications` 가 전부 0행이었다. 그 사람이 기기를 바꿨다면 이틀치 학습이
 * 통째로 사라졌을 것이다.
 *
 * 저장소를 새로 만들고 배선을 잊는 것은 다시 일어난다. 그때 이 시험이 실패한다.
 */

const SRC = path.resolve(__dirname, '../../..');
const APP = path.resolve(SRC, '../app');
const INDEX = path.resolve(__dirname, '../index.ts');

/** src/ 와 app/ 아래의 모든 .ts/.tsx 를 모은다(시험 파일과 저장소 정의는 뺀다). */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    // 저장소 자신(정의·목업)은 소비자로 세지 않는다.
    if (full.includes(path.join('data', 'repositories'))) continue;
    out.push(full);
  }
  return out;
}

describe('저장소 배선', () => {
  const exported = Array.from(
    fs.readFileSync(INDEX, 'utf8').matchAll(/export const (\w+Repository)\s*:/g),
    (m) => m[1],
  );

  it('index.ts 가 저장소를 내보내고 있다', () => {
    expect(exported.length).toBeGreaterThan(10);
  });

  const files = [...sourceFiles(SRC), ...sourceFiles(APP)];
  const blob = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  it.each(exported)('%s 를 실제로 쓰는 코드가 있다', (name) => {
    const used = new RegExp(`\\b${name}\\b`).test(blob);
    expect(used).toBe(true);
  });
});
