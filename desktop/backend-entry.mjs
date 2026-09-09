// Bootstrap the existing backend using Electron's bundled Node runtime. The
// per-launch credential travels over IPC, never through argv or the environment.
import {configureDesktop} from '../server/desktop-session.mjs';
import {useProviderStorage} from '../server/provider-settings.mjs';
const pending = new Map();
let nextId = 0;
function storage(operation, value) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    // Allow time for a real Keychain permission prompt without freezing the UI.
    const expiresAt = Date.now() + 120000;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Secure storage timed out. Resolve the operating system keyring prompt, then retry.')); }, 120000);
    pending.set(id, {resolve, reject, timer});
    process.send({type: 'storage', id, operation, value, expiresAt});
  });
}
process.on('message', message => {
  if (message?.type !== 'storage-result') return;
  const request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer); pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error));
  else request.resolve(message.value);
});
process.once('message', async message => {
  if (message?.type !== 'configure' || !/^[a-f0-9]{64}$/.test(message.token)) process.exit(1);
  configureDesktop(message.token);
  useProviderStorage({read: () => storage('read'), write: value => storage('write', value)});
  try { await import('../server/index.mjs'); }
  catch (error) { process.send({type: 'startup-error', code: typeof error.code === 'string' ? error.code : error.name}); process.exit(1); }
});
process.on('disconnect', () => process.emit('SIGTERM'));
