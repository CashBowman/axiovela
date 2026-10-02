import {readFileSync, lstatSync, mkdirSync, writeFileSync, renameSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {containedProjectPath} from './project-paths.mjs';

// Bounded synchronous transaction: no other in-process tool turn can interleave
// its read/write. Exact matching rejects stale target text, preserves other edits,
// and does not interpret replacement strings (including TeX and dollar signs).
export function editProjectFile(cwd, {path: name, old_text, new_text}) {
  if (!old_text || old_text.length > 1_000_000 || new_text.length > 1_000_000)
    throw Error('Use nonempty old_text and replacements below the 1 MB limit.');
  const file = containedProjectPath(cwd, name);
  const info = lstatSync(file);
  if (!info.isFile() || info.size > 1_000_000) throw Error('Edit requires a regular UTF-8 file below 1 MB.');
  const bytes = readFileSync(file);
  const source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  const at = source.indexOf(old_text);
  if (at < 0 || source.indexOf(old_text, at + 1) >= 0)
    throw Error('old_text must match exactly once. Reread the current file and include unique surrounding context.');
  if (old_text === new_text) return `Unchanged ${name}`;
  const result = source.slice(0, at) + new_text + source.slice(at + old_text.length);
  if (Buffer.byteLength(result) > 1_000_000) throw Error('Edited file exceeds the 1 MB limit.');
  const id = randomUUID();
  const backupName = `${name.replaceAll('\\', '/').startsWith('writeups/') ? 'writeups/backups' : '.edit-history'}/${id}-${path.basename(file)}`;
  const backup = containedProjectPath(cwd, backupName);
  mkdirSync(path.dirname(backup), {recursive: true});
  writeFileSync(backup, bytes, {flag: 'wx', mode: 0o600});
  const temporary = containedProjectPath(cwd, path.relative(cwd, file) + '.' + id + '.tmp');
  try {
    writeFileSync(temporary, result, {flag: 'wx', mode: info.mode & 0o777});
    // Detect external changes observed before committing; this is not a lock
    // against an unrelated process writing after this comparison.
    if (!readFileSync(file).equals(bytes)) throw Error('File changed during edit; reread and retry.');
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return `Edited ${name}; previous file: ${backupName}`;
}
