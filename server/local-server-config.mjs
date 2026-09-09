export function localServerConfig(env = process.env, {allowEphemeral = false} = {}) {
  const host = env.WORKBENCH_HOST || '127.0.0.1';
  const port = Number(env.WORKBENCH_PORT || 8787);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) throw new Error('Axiovela requires a loopback host (127.0.0.1, localhost, or ::1). Remote access is not authenticated.');
  if (!Number.isInteger(port) || port < (allowEphemeral ? 0 : 1) || port > 65535) throw new Error('WORKBENCH_PORT must be an integer from 1 to 65535.');
  return {host: host.replace(/^\[|\]$/g, ''), port, url: `http://${host.includes(':') ? '[::1]' : host}:${port}`};
}
