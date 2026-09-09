const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const {randomUUID} = require('node:crypto');

// Same-directory replacement keeps the previous file intact if writing or
// flushing fails. This does not claim protection against every power failure.
async function atomicWriteFile(file, contents, {mode, signal} = {}) {
  let existing;
  try { existing = await fs.lstat(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.isSymbolicLink()) throw new Error('Refusing to replace a symbolic link.');
  if (existing) await fs.access(file, constants.W_OK);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    signal?.throwIfAborted();
    handle = await fs.open(temporary, 'wx', mode ?? (existing ? existing.mode & 0o777 : 0o600));
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close(); handle = null;
    signal?.throwIfAborted();
    await fs.rename(temporary, file);
  } finally {
    try { await handle?.close(); }
    finally { await fs.rm(temporary, {force: true}); }
  }
}
module.exports = {atomicWriteFile};
