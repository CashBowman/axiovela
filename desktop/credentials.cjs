const fs = require('node:fs/promises');
const path = require('node:path');
const {atomicWriteFile} = require('../server/atomic-file.cjs');

function credentialStore(file, safeStorage, {platform = process.platform} = {}) {
  // Keep Linux's explicit no-plaintext-backend check. Mac Keychain access must
  // not block Electron's UI thread while waiting for an OS permission prompt.
  const asynchronous = platform === 'darwin';
  async function requireEncryption() {
    const available = asynchronous ? await safeStorage.isAsyncEncryptionAvailable() : safeStorage.isEncryptionAvailable();
    if (!available || (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('Secure credential storage is unavailable. Unlock or enable your operating system keyring, then restart Axiovela. No API key was saved.');
    }
  }
  return {
    async read() {
      let contents;
      try { contents = await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
      await requireEncryption();
      try { return JSON.parse(asynchronous ? (await safeStorage.decryptStringAsync(contents)).result : safeStorage.decryptString(contents)); }
      catch { throw new Error('Cannot unlock desktop provider settings. Check your operating system keyring.'); }
    },
    async write(value, {signal} = {}) {
      await requireEncryption();
      const encrypted = asynchronous ? await safeStorage.encryptStringAsync(JSON.stringify(value)) : safeStorage.encryptString(JSON.stringify(value));
      signal?.throwIfAborted();
      await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
      await atomicWriteFile(file, encrypted, {mode: 0o600, signal});
    },
  };
}
module.exports = {credentialStore};
