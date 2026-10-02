import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
const inventory = files(resolve(root, 'app')).concat(files(resolve(root, 'src'))).map((path) => {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const events = [], navigation = [], async = [];
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const walk = (node) => {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.text)) {
      events.push({ line: line(node), event: node.name.text, handler: node.initializer?.getText(source) });
    }
    if (ts.isCallExpression(node) && /^(router|(?:globalThis\.)?(?:window\.)?location)\.(push|replace|navigate|back|dismiss|dismissAll|dismissTo)$/.test(node.expression.getText(source))) {
      navigation.push({ line: line(node), call: node.getText(source) });
    }
    if (ts.isJsxAttribute(node) && node.name.text === 'href') {
      navigation.push({ line: line(node), call: node.getText(source) });
    }
    if (ts.isFunctionLike(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      async.push({ line: line(node), name: node.name?.getText(source) ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : 'callback') });
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  const file = relative(root, path).replaceAll('\\', '/');
  return { file, page: file.startsWith('app/') && !file.endsWith('_layout.tsx'), events, navigation, async };
}).filter((entry) => entry.page || entry.events.length || entry.navigation.length || entry.async.length);
const totals = {
  pages: inventory.filter((entry) => entry.page).length,
  events: inventory.reduce((n, entry) => n + entry.events.length, 0),
  navigation: inventory.reduce((n, entry) => n + entry.navigation.length, 0),
  async: inventory.reduce((n, entry) => n + entry.async.length, 0),
};
mkdirSync(resolve(root, 'docs/qa/ui-audit'), { recursive: true });
writeFileSync(resolve(root, 'docs/qa/ui-audit/inventory.json'), JSON.stringify({ totals, files: inventory }, null, 2) + '\n');
console.log(JSON.stringify(totals));
