import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, writeFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import atomic from '../server/atomic-file.cjs';
import credentials from '../desktop/credentials.cjs';

test('interrupted saves keep the original file and remove partial temporary data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-atomic-test-'));
  const file = path.join(root, 'document');
  try {
    await writeFile(file, 'previous contents');
    async function* failedWrite() { yield 'partial replacement'; throw Object.assign(new Error('Disk full fixture'), {code: 'ENOSPC'}); }
    await assert.rejects(atomic.atomicWriteFile(file, failedWrite()), {code: 'ENOSPC'});
    assert.equal(await readFile(file, 'utf8'), 'previous contents');
    assert.deepEqual(await readdir(root), ['document']);
    await assert.rejects(atomic.atomicWriteFile(file, 'expired', {signal: AbortSignal.abort()}));
    assert.equal(await readFile(file, 'utf8'), 'previous contents');
    await atomic.atomicWriteFile(file, 'complete replacement');
    assert.equal(await readFile(file, 'utf8'), 'complete replacement');
    if (process.platform !== 'win32') {
      const link = path.join(root, 'link'); await symlink(file, link);
      await assert.rejects(atomic.atomicWriteFile(link, 'wrong file'), /symbolic link/);
      assert.equal(await readFile(file, 'utf8'), 'complete replacement');
    }
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('Mac credential storage awaits async Keychain and refuses expired writes without changing the vault', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-keychain-fixture-'));
  const file = path.join(root, 'vault');
  let release;
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    decryptStringAsync: async bytes => ({result: bytes.toString(), shouldReEncrypt: false}),
    encryptStringAsync: text => new Promise(resolve => { release = () => resolve(Buffer.from(text)); }),
    isEncryptionAvailable: () => { throw new Error('Synchronous Mac access is forbidden'); },
  };
  try {
    await writeFile(file, JSON.stringify({previous: 'synthetic'}));
    const store = credentials.credentialStore(file, safeStorage, {platform: 'darwin'});
    assert.deepEqual(await store.read(), {previous: 'synthetic'});
    const controller = new AbortController();
    const pending = store.write({next: 'synthetic'}, {signal: controller.signal});
    await new Promise(resolve => setImmediate(resolve));
    controller.abort(); release();
    await assert.rejects(pending);
    assert.deepEqual(await store.read(), {previous: 'synthetic'});
    const saved = store.write({next: 'synthetic'});
    await new Promise(resolve => setImmediate(resolve)); release(); await saved;
    assert.deepEqual(await store.read(), {next: 'synthetic'});
    safeStorage.isAsyncEncryptionAvailable = async () => false;
    await assert.rejects(store.write({next: 'no'}), /No API key was saved/);
  } finally { await rm(root, {recursive: true, force: true}); }
});
