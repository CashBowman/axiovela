import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
const forbidden = /(?:^|\/)(?:\.local|\.env(?:\.[^/]*)?|\.codex|\.claude|\.gemini|\.pi|\.aws|\.ssh|\.npmrc|\.netrc|auth\.json|credentials\.json|providers\.json)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i;
const personalPath = /(?:\/home\/(?!runner(?:\/|\b)|user(?:\/|\b)|researcher(?:\/|\b))[^\s'"<>/]+\/|\/Users\/[^\s'"<>/]+\/|[A-Z]:\\Users\\[^\s'"<>\\]+\\)/i;
let links = 0;
for (const file of files) {
  assert.ok(!forbidden.test(file), `Credential or local authentication file must not be tracked: ${file}`);
  if (!/\.(?:md|mjs|cjs|js|jsx|json|yml|yaml|html|css|svg|py)$/.test(file)) continue;
  const text = await readFile(path.join(root, file), 'utf8');
  // Report locations only; never print a matching secret or private path.
  assert.ok(!personalPath.test(text), `Machine-specific home path found in ${file}`);
  if (!file.endsWith('.md')) continue;
  const targets = [
    ...Array.from(text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g), match => match[1]),
    ...Array.from(text.matchAll(/<(?:a|img)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi), match => match[1]),
  ];
  for (const link of targets) {
    const target = link.replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(target));
    assert.ok(resolved.startsWith(root), `Documentation link escapes repository: ${file}`);
    await access(resolved).catch(() => { throw new Error(`Broken local documentation link in ${file}: ${target}`); });
    links++;
  }
}
console.log(`Repository check passed: ${files.length} files reviewed for private paths/authentication filenames; ${links} local documentation links resolved. Run Gitleaks separately for credential contents and history.`);
