import {homedir} from 'node:os';
import path from 'node:path';
import {mkdir, readFile, writeFile, rename, chmod} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export const apiProviders = {
  'openai-api': {name: 'OpenAI API', keyEnv: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1', wire: 'openai'},
  'anthropic-api': {name: 'Anthropic API', keyEnv: 'ANTHROPIC_API_KEY', endpoint: 'https://api.anthropic.com/v1', wire: 'anthropic'},
  'gemini-api': {name: 'Google Gemini API', keyEnv: 'GEMINI_API_KEY', endpoint: 'https://generativelanguage.googleapis.com/v1beta', wire: 'gemini'},
  'compatible-api': {name: 'OpenAI-compatible / local API', keyEnv: 'WORKBENCH_COMPATIBLE_API_KEY', endpoint: '', wire: 'compatible'},
};

let privateStorage = null;
export function useProviderStorage(storage) { privateStorage = storage; }

function settingsPath() {
  if (process.env.WORKBENCH_PROVIDER_SETTINGS_PATH) return path.resolve(process.env.WORKBENCH_PROVIDER_SETTINGS_PATH);
  const base = process.platform === 'win32' ? process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming') : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  return path.join(base, 'ml-theory-workbench', 'providers.json');
}
async function readSettings() {
  if (privateStorage) return privateStorage.read();
  try { const value = JSON.parse(await readFile(settingsPath(), 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Cannot read private provider settings. Check the local configuration file.'); }
}
export async function getProvider(id) {
  const spec = apiProviders[id];
  if (!Object.hasOwn(apiProviders, id)) throw new Error('Unknown API provider.');
  const stored = (await readSettings())[id] || {};
  return {...spec, key: stored.key || process.env[spec.keyEnv] || (id === 'gemini-api' ? process.env.GOOGLE_API_KEY : '') || '', endpoint: stored.endpoint || spec.endpoint};
}
export function validateEndpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Endpoint must not contain credentials, query parameters, or a fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS, or HTTP on loopback for a local model server.');
  return url.href.replace(/\/$/, '');
}
export async function saveProvider(id, body) {
  if (!Object.hasOwn(apiProviders, id)) throw new Error('Unknown API provider.');
  const settings = await readSettings();
  const old = settings[id] || {};
  if (body.clearKey) delete old.key;
  if (!body.clearKey && body.apiKey !== undefined && body.apiKey !== '') {
    if (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) throw new Error('Invalid API key.');
    old.key = body.apiKey.trim();
  }
  if (id === 'compatible-api' && body.endpoint !== undefined) old.endpoint = validateEndpoint(body.endpoint);
  settings[id] = old;
  if (privateStorage) { await privateStorage.write(settings); return {saved: true}; }
  const file = settingsPath();
  await mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(settings), {mode: 0o600, flag: 'wx'});
  await rename(temporary, file); await chmod(file, 0o600);
  return {saved: true}; // Never echo credentials, including partially masked keys.
}

export async function providerRequest(provider, route, {body, signal} = {}) {
  const headers = {'content-type': 'application/json'};
  if (provider.wire === 'anthropic') Object.assign(headers, {'x-api-key': provider.key, 'anthropic-version': '2023-06-01'});
  else if (provider.wire === 'gemini') headers['x-goog-api-key'] = provider.key;
  else if (provider.key) headers.authorization = `Bearer ${provider.key}`;
  const response = await fetch(`${provider.endpoint}/${route}`, {method: body ? 'POST' : 'GET', headers, ...(body ? {body: JSON.stringify(body)} : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(15000), redirect: 'error'});
  if (!response.ok) throw new Error(`${provider.name} returned HTTP ${response.status}. Check authentication, model access, quota, and request settings.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Provider returned an empty response.');
  const chunks = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8_000_000) { await reader.cancel(); throw new Error('Provider response exceeded the size limit.'); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { throw new Error('Provider returned invalid JSON.'); }
}
