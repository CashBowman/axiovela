import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {executeResearchTool} from '../server/assistant-api.mjs';

test('focused file edits preserve math and unrelated text, back up, and reject unsafe/stale edits', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'axi-edit-'));
  const signal = new AbortController().signal;
  const run = (args, mode = 'auto') => executeResearchTool('edit_file', args, {cwd, mode, signal});
  try {
    await fs.mkdir(path.join(cwd, 'writeups'));
    const file = path.join(cwd, 'writeups/main.tex');
    const source = '\uFEFFKeep exact $x^2$ and citations.\nTarget paragraph.\nUnrelated result.\n';
    await fs.writeFile(file, source);
    const args = {path: 'writeups/main.tex', old_text: 'Target paragraph.', new_text: 'Corrected $y^2$ and literal $&.'};
    await assert.rejects(run(args, 'ask'), /does not permit/);
    assert.equal(await fs.readFile(file, 'utf8'), source);
    const result = await run(args);
    assert.equal(await fs.readFile(file, 'utf8'), source.replace('Target paragraph.', () => args.new_text));
    const backup = result.split('previous file: ')[1];
    assert.ok(backup.startsWith('writeups/backups/'));
    assert.equal(await fs.readFile(path.join(cwd, backup), 'utf8'), source);
    await assert.rejects(run(args), /exactly once/);
    await fs.writeFile(file, 'duplicate duplicate');
    await assert.rejects(run({...args, old_text: 'duplicate'}), /exactly once/);
    await assert.rejects(run({...args, old_text: ''}), /nonempty/);
    assert.equal(await fs.readFile(file, 'utf8'), 'duplicate duplicate');
    for (const bad of ['../outside', '.env', 'providers.json']) await assert.rejects(run({...args, path: bad}));
    if (process.platform !== 'win32') {
      await fs.symlink(file, path.join(cwd, 'link'));
      await assert.rejects(run({...args, path: 'link'}), /Symlinks/);
    }
    await fs.writeFile(file, 'First. Second.');
    await Promise.all([run({...args, old_text:'First.', new_text:'One.'}), run({...args, old_text:'Second.', new_text:'Two.'})]);
    assert.equal(await fs.readFile(file,'utf8'),'One. Two.');
    await fs.writeFile(file, Buffer.from([0xff,0xfe,0x61]));
    await assert.rejects(run({...args, old_text:'a'}));
    await fs.writeFile(file, 'x'.repeat(1_000_001));
    await assert.rejects(run({...args, old_text:'x'}), /below 1 MB/);
    const cancel = new AbortController(); cancel.abort();
    await assert.rejects(executeResearchTool('edit_file', args, {cwd,mode:'full',signal:cancel.signal}), /canceled/);
  } finally { await fs.rm(cwd, {recursive:true, force:true}); }
});
