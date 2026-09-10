import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const directory = path.resolve(process.argv[2] || 'out/make');
const manifests = (await readdir(directory)).filter(name => /^SHA256SUMS-.*\.txt$/.test(name));
assert.ok(manifests.length, 'No artifact checksum manifest found');
let checked = 0;
for (const manifest of manifests) {
  for (const line of (await readFile(path.join(directory, manifest), 'utf8')).trim().split('\n')) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line.trim());
    assert.ok(match, 'Malformed checksum entry');
    const file = path.resolve(directory, match[2]);
    assert.ok(file.startsWith(directory + path.sep), 'Artifact path escapes download directory');
    assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), match[1], `Checksum mismatch: ${match[2]}`);
    checked++;
  }
}
console.log(`Verified ${checked} retained artifact checksums.`);
