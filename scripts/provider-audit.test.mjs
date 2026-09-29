import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {saveProvider, getProvider, useProviderStorage, providerRequest, validateEndpoint} from '../server/provider-settings.mjs';
import {discoverRuntime, runAssistant} from '../server/assistant-runtime.mjs';
import {discoverApi, runApi, executeResearchTool} from '../server/assistant-api.mjs';
import {assistantExecutable} from '../server/assistant-process.mjs';
const callbacks = {onSession() {}, onEvent() {}, onOutput() {}, onEffective() {}};
const ids = ['openai-api', 'anthropic-api', 'gemini-api', 'compatible-api'];
async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'axiovela-provider-audit-'));
  const previous = {...process.env}, fetcher = globalThis.fetch;
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'WORKBENCH_COMPATIBLE_API_KEY']) delete process.env[key];
  process.env.WORKBENCH_PROVIDER_SETTINGS_PATH = path.join(cwd, 'private/providers.json');
  t.after(async () => { useProviderStorage(null); globalThis.fetch = fetcher; for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); await fs.rm(cwd, {recursive: true, force: true}); });
  return cwd;
}
test('concurrent credential transactions preserve every provider and recover after rejection', async t => {
  await fixture(t);
  await Promise.all(ids.map(id => saveProvider(id, {apiKey: 'fixture-' + id})));
  for (const id of ids) assert.equal((await getProvider(id)).key, 'fixture-' + id);
  await assert.rejects(saveProvider('openai-api', {apiKey: 'bad\nkey'}));
  await saveProvider('openai-api', {apiKey: 'replacement'});
  assert.equal((await getProvider('openai-api')).key, 'replacement');
  assert.equal((await fs.stat(process.env.WORKBENCH_PROVIDER_SETTINGS_PATH)).mode & 0o777, 0o600);
  let data = {};
  useProviderStorage({read: async () => structuredClone(data), write: async value => { await new Promise(r => setTimeout(r, 5)); data = structuredClone(value); }});
  await Promise.all(ids.map(id => saveProvider(id, {apiKey: 'desktop-fixture'})));
  assert.deepEqual(Object.keys(data).sort(), [...ids].sort());
  await assert.rejects(saveProvider('compatible-api', {clearKey: true, endpoint: 'http://evil.example'}));
  assert.equal(data['compatible-api'].key, 'desktop-fixture');
});
test('credential changes invalidate cached discovery and key removal preserves environment fallback', async t => {
  const cwd = await fixture(t); let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({data: [{id: 'gpt-5'}]}); };
  assert.equal((await discoverRuntime('openai-api', cwd)).available, false);
  await saveProvider('openai-api', {apiKey: 'fixture'});
  assert.equal((await discoverRuntime('openai-api', cwd)).available, true);
  assert.equal(requests, 1);
  await saveProvider('openai-api', {clearKey: true});
  assert.equal((await discoverRuntime('openai-api', cwd)).available, false);
  process.env.OPENAI_API_KEY = 'environment-fixture';
  assert.equal((await getProvider('openai-api')).key, 'environment-fixture');
});
test('compatible custom models work without a models route, but authentication errors stay visible', async t => {
  const cwd = await fixture(t);
  await saveProvider('compatible-api', {endpoint: 'http://127.0.0.1:5555/v1'});
  globalThis.fetch = async (_url, init) => init.method === 'GET' ? new Response('', {status: 404}) : Response.json({choices: [{finish_reason: 'stop', message: {role: 'assistant', content: 'Custom model works'}}]});
  const catalog = await discoverRuntime('compatible-api', cwd, true);
  assert.equal(catalog.available, true); assert.deepEqual(catalog.models, []); assert.match(catalog.catalogStatus, /not verified/);
  assert.equal(await runAssistant({selection: {adapterId: 'compatible-api', modelId: 'local/model'}, cwd, mode: 'ask', prompt: 'hello', signal: new AbortController().signal, ...callbacks}), 'Custom model works');
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response('private response', {status});
    const failed = await discoverApi('compatible-api'); assert.equal(failed.available, false); assert.match(failed.error, new RegExp(String(status))); assert.doesNotMatch(failed.error, /private response/);
  }
});
test('API access enforcement rejects invalid modes, mutations, shell escalation, traversal and symlinks', async t => {
  const cwd = await fixture(t), signal = new AbortController().signal;
  const options = {cwd, mode: 'ask', signal};
  for (const mode of [undefined, '', 'AUTO', 'invalid']) await assert.rejects(executeResearchTool('write_file', {path: 'bad', content: 'x'}, {...options, mode}), /Unknown access/);
  for (const mode of ['ask', 'auto']) await assert.rejects(executeResearchTool('run_command', {command: 'echo forbidden'}, {...options, mode}), /does not permit|Full access/);
  await assert.rejects(executeResearchTool('compile_document', {format: 'latex', source: 'x'}, {...options, mode: 'auto', compileDocument: () => assert.fail('must not compile')}), /Full access/);
  await assert.rejects(executeResearchTool('write_file', {path: 'bad', content: 'x'}, options), /does not permit/);
  for (const name of ['../escape', '.env', '.git/config', 'sub/../../escape']) await assert.rejects(executeResearchTool('write_file', {path: name, content: 'x'}, {...options, mode: 'auto'}), /project-relative/);
  await fs.symlink(os.tmpdir(), path.join(cwd, 'escape'));
  await assert.rejects(executeResearchTool('write_file', {path: 'escape/blocked', content: 'x'}, {...options, mode: 'auto'}), /Symlinks/);
  for (const args of [null, [], {}, {path: 'x', content: 'x', extra: 'x'}]) await assert.rejects(executeResearchTool('write_file', args, {...options, mode: 'auto'}), /Invalid research/);
  await executeResearchTool('write_file', {path: 'allowed.md', content: 'saved'}, {...options, mode: 'auto'});
  assert.equal(await executeResearchTool('read_file', {path: 'allowed.md'}, options), 'saved');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(executeResearchTool('write_file', {path: 'bad', content: 'x'}, {...options, mode: 'full', signal: controller.signal}), /canceled/);
});
test('all four API wire protocols preserve tool state, auth and enforce restricted tool exposure', async t => {
  const cwd = await fixture(t);
  for (const id of ids) {
    await saveProvider(id, {apiKey: 'isolated-fixture', ...(id === 'compatible-api' ? {endpoint: 'http://127.0.0.1:5555/v1'} : {})});
    let round = 0, session;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body); round++;
      assert.equal(init.redirect, 'error'); assert.ok(init.signal); assert.doesNotMatch(JSON.stringify(body.tools), /run_command/);
      assert.equal(init.headers[id === 'anthropic-api' ? 'x-api-key' : id === 'gemini-api' ? 'x-goog-api-key' : 'authorization'], id === 'anthropic-api' || id === 'gemini-api' ? 'isolated-fixture' : 'Bearer isolated-fixture');
      const args = {path: id + '.md', content: 'verified'};
      if (id === 'openai-api') {
        assert.match(url, /\/responses$/); assert.equal(body.store, false); assert.deepEqual(body.include, ['reasoning.encrypted_content']);
        if (round === 2) { assert.ok(body.input.some(x => x.encrypted_content === 'opaque')); assert.ok(body.input.some(x => x.type === 'function_call_output' && x.call_id === 'c1')); }
        return Response.json({status: 'completed', output: round === 1 ? [{type: 'reasoning', encrypted_content: 'opaque'}, {type: 'function_call', call_id: 'c1', name: 'write_file', arguments: JSON.stringify(args)}] : [{type: 'message', content: [{type: 'output_text', text: 'done'}]}]});
      }
      if (id === 'anthropic-api') {
        assert.match(url, /\/messages$/); assert.equal(init.headers['anthropic-version'], '2023-06-01'); assert.ok(body.tools.every(x => x.input_schema));
        if (round === 2) assert.equal(body.messages.at(-1).content[0].tool_use_id, 'c1');
        return Response.json({stop_reason: round === 1 ? 'tool_use' : 'end_turn', content: round === 1 ? [{type: 'tool_use', id: 'c1', name: 'write_file', input: args}] : [{type: 'text', text: 'done'}]});
      }
      if (id === 'gemini-api') {
        assert.match(url, /:generateContent$/); assert.ok(body.tools[0].functionDeclarations.every(x => x.parametersJsonSchema));
        if (round === 2) { assert.equal(body.contents.at(-2).parts[0].thoughtSignature, 'opaque'); assert.equal(body.contents.at(-1).parts[0].functionResponse.id, 'c1'); }
        return Response.json({candidates: [{finishReason: 'STOP', content: {role: 'model', parts: round === 1 ? [{thoughtSignature: 'opaque', functionCall: {id: 'c1', name: 'write_file', args}}] : [{text: 'done'}]}}]});
      }
      assert.match(url, /\/chat\/completions$/);
      if (round === 2) assert.equal(body.messages.at(-1).tool_call_id, 'c1');
      return Response.json({choices: [{finish_reason: round === 1 ? 'tool_calls' : 'stop', message: {role: 'assistant', content: round === 1 ? null : 'done', ...(round === 1 ? {tool_calls: [{id: 'c1', type: 'function', function: {name: 'write_file', arguments: JSON.stringify(args)}}]} : {})}}]});
    };
    assert.equal(await runApi({selection: {adapterId: id}, cwd, mode: 'auto', prompt: 'write', signal: new AbortController().signal, ...callbacks, onSession: value => { session = value; }}, {id: 'test-model'}), 'done');
    assert.equal(round, 2); assert.equal(await fs.readFile(path.join(cwd, id + '.md'), 'utf8'), 'verified');
    const history = JSON.parse(await fs.readFile(path.join(cwd, 'assistant/sessions', session + '.json'), 'utf8'));
    assert.equal(history.provider, id); assert.equal(history.messages.at(-1).content, 'done');
  }
});
test('blocked and incomplete API responses never execute returned tool calls', async t => {
  const cwd = await fixture(t);
  const responses = {
    'openai-api': {status: 'incomplete', output: [{type: 'function_call', call_id: '1', name: 'write_file', arguments: '{"path":"bad","content":"bad"}'}]},
    'anthropic-api': {stop_reason: 'max_tokens', content: [{type: 'tool_use', id: '1', name: 'write_file', input: {path: 'bad', content: 'bad'}}]},
    'gemini-api': {candidates: [{finishReason: 'SAFETY', content: {parts: [{functionCall: {name: 'write_file', args: {path: 'bad', content: 'bad'}}}]}}]},
    'compatible-api': {choices: [{finish_reason: 'content_filter', message: {content: 'blocked', tool_calls: [{id: '1', function: {name: 'write_file', arguments: '{"path":"bad","content":"bad"}'}}]}}]},
  };
  for (const id of ids) {
    await saveProvider(id, {apiKey: 'fixture', ...(id === 'compatible-api' ? {endpoint: 'http://127.0.0.1:5555/v1'} : {})});
    globalThis.fetch = async () => Response.json(responses[id]);
    await assert.rejects(runApi({selection: {adapterId: id}, cwd, mode: 'full', prompt: 'hello', signal: new AbortController().signal, ...callbacks}, {id: 'test-model'}), /incomplete|blocked|token limit/);
    await assert.rejects(fs.stat(path.join(cwd, 'bad')), {code: 'ENOENT'});
  }
});
test('real HTTP transport rejects redirects, hides error bodies, and honors cancellation', async t => {
  await fixture(t);
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, {location: '/secret'}); res.end(); }
    else if (req.url === '/error') { res.writeHead(401); res.end('private provider body'); }
    else if (req.url === '/invalid') res.end('invalid json');
    else if (req.url !== '/hang') { res.writeHead(200, {'content-type': 'application/json'}); res.end('{"ok":true}'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const provider = {name: 'Fixture', wire: 'compatible', key: 'fixture', endpoint: `http://127.0.0.1:${server.address().port}`};
  assert.deepEqual(await providerRequest(provider, 'ok'), {ok: true});
  await assert.rejects(providerRequest(provider, 'redirect'));
  await assert.rejects(providerRequest(provider, 'error'), error => error.providerStatus === 401 && !error.message.includes('private provider'));
  await assert.rejects(providerRequest(provider, 'invalid'), /invalid JSON/);
  const controller = new AbortController(), request = providerRequest(provider, 'hang', {signal: controller.signal}); controller.abort(); await assert.rejects(request);
  for (const endpoint of ['http://remote.example/v1', 'https://user:pass@example.com', 'https://example.com?key=secret', 'https://example.com#fragment']) assert.throws(() => validateEndpoint(endpoint));
});
test('Windows CLI resolution handles all five npm shims and keeps shell metacharacters literal', () => {
  for (const id of ['codex', 'claude', 'gemini', 'opencode', 'pi']) {
    const args = ['--model', 'literal&echo bad', 'a "quoted" prompt'];
    const [command, argv] = assistantExecutable(id, `C:\\Users\\Test User\\npm\\${id.toUpperCase()}.CMD`, args, {platform: 'win32', exists: () => true});
    if (id === 'claude') { assert.match(command, /Test User\\npm\\node_modules\\.*claude\.exe$/); assert.deepEqual(argv, args); }
    else { assert.equal(command, process.execPath); assert.match(argv[0], /Test User\\npm\\node_modules\\/); assert.deepEqual(argv.slice(1), args); }
    assert.throws(() => assistantExecutable(id, `${id}.cmd`, args, {platform: 'win32', env: {Path: 'C:\\npm'}, exists: () => false}), /native executable/);
  }
  for (const [id, suffix] of [['gemini', 'bundle\\gemini.js'], ['gemini', 'dist\\index.js'], ['pi', 'dist\\bundle\\cli.js'], ['pi', 'dist\\cli.js'], ['claude', 'cli.js']]) {
    const [command, argv] = assistantExecutable(id, `${id}.cmd`, ['--version'], {platform: 'win32', env: {Path: 'C:\\npm'}, exists: value => value.endsWith(suffix)});
    assert.equal(command, process.execPath); assert.ok(argv[0].endsWith(suffix));
  }
});
test('native provider modes use the intended flags and reject unsupported access', async t => {
  const cwd = await fixture(t);
  for (const id of ['codex', 'claude', 'gemini', 'opencode', 'pi']) {
    process.env[`WORKBENCH_${id.toUpperCase()}_PATH`] = path.resolve(`scripts/fixtures/${id === 'codex' ? 'assistant-rpc' : 'provider-cli'}.mjs`);
    const catalog = await discoverRuntime(id, cwd, true);
    for (const mode of ['ask', 'auto', 'full']) {
      const options = {selection: {adapterId: id, modelId: catalog.models[0].id}, cwd, mode, prompt: id === 'codex' ? 'FIXTURE_STATE' : 'STATE', signal: new AbortController().signal, ...callbacks};
      if (!catalog.modes.includes(mode)) { await assert.rejects(runAssistant(options), /supported mode explicitly/); continue; }
      const result = JSON.parse(await runAssistant(options)), args = result.args;
      if (id === 'codex') assert.equal(result.sandbox, {ask: 'read-only', auto: 'workspace-write', full: 'danger-full-access'}[mode]);
      if (id === 'claude') { assert.equal(args[args.indexOf('--permission-mode') + 1], {ask: 'dontAsk', auto: 'auto', full: 'bypassPermissions'}[mode]); if (mode === 'ask') assert.ok(args.includes('Read,Glob,Grep')); }
      if (id === 'gemini') { assert.equal(args[args.indexOf('--approval-mode') + 1], mode === 'ask' ? 'plan' : 'yolo'); assert.equal(args.includes('--sandbox'), mode === 'auto'); }
      if (id === 'opencode') assert.ok(args.includes('--auto'));
      if (id === 'pi') { assert.ok(args.includes('--no-extensions')); assert.equal(args[args.indexOf('--tools') + 1].includes('bash'), mode === 'full'); }
    }
  }
});
test('every native adapter preserves resume IDs and responds to cancellation or provider failure', async t => {
  const cwd = await fixture(t);
  for (const id of ['codex', 'claude', 'gemini', 'opencode', 'pi']) {
    process.env[`WORKBENCH_${id.toUpperCase()}_PATH`] = path.resolve(`scripts/fixtures/${id === 'codex' ? 'assistant-rpc' : 'provider-cli'}.mjs`);
    const catalog = await discoverRuntime(id, cwd, true); let session;
    const options = {selection: {adapterId: id, modelId: catalog.models[0].id}, cwd, mode: id === 'opencode' ? 'full' : 'ask', prompt: id === 'codex' ? 'FIXTURE_STATE' : 'STATE', signal: new AbortController().signal, ...callbacks, onSession: value => { session = value; }};
    await runAssistant(options); const original = session;
    await runAssistant({...options, sessionId: original}); assert.equal(session, original, id);
    // The Codex fixture has its own error scenarios in providers.test.mjs.
    if (id !== 'codex') await assert.rejects(runAssistant({...options, prompt: 'FAIL'}), /failed|successfully|exited/i);
    const controller = new AbortController();
    const started = runAssistant({...options, prompt: id === 'codex' ? 'FIXTURE_HANG' : 'HANG', signal: controller.signal, onSession: () => controller.abort()});
    await assert.rejects(started, /canceled|closed/i, id);
  }
});
test('API conversation resumes retained context and the tool loop has a hard round bound', async t => {
  const cwd = await fixture(t);
  await saveProvider('openai-api', {apiKey: 'fixture'}); let session, round = 0;
  const options = {selection: {adapterId: 'openai-api'}, cwd, mode: 'ask', prompt: 'original question', signal: new AbortController().signal, ...callbacks, onSession: value => { session = value; }};
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); round++; if (round === 2) { assert.ok(body.input.some(x => x.content === 'original question')); assert.ok(body.input.some(x => x.content === 'first answer')); } return Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: 'first answer'}]}]}); };
  await runApi(options, {id: 'gpt-5'}); await runApi({...options, sessionId: session, prompt: 'follow up'}, {id: 'gpt-5'}); assert.equal(round, 2);
  round = 0;
  globalThis.fetch = async () => { round++; return Response.json({status: 'completed', output: [{type: 'function_call', call_id: String(round), name: 'list_files', arguments: '{"path":"."}'}]}); };
  await assert.rejects(runApi(options, {id: 'gpt-5'}), /40 tool rounds/); assert.equal(round, 40);
});
test('full current API requests reach the provider without silent truncation', async t => {
  const cwd = await fixture(t), prompt = 'IMPORTANT PREFIX\n' + 'x'.repeat(40000) + '\nEND';
  await saveProvider('openai-api', {apiKey: 'fixture'});
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).input.at(-1).content, prompt);
    return Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: 'done'}]}]});
  };
  await runApi({selection: {adapterId: 'openai-api'}, cwd, mode: 'ask', prompt, signal: new AbortController().signal, ...callbacks}, {id: 'fixture'});
});
test('desktop packaging excludes nested credentials and private development paths', async () => {
  const {default: config} = await import('../forge.config.cjs');
  for (const file of ['/server/.env', '/server/providers.json', '/desktop/keys/private.pem', '/shared/reports/log.txt', '/node_modules/.bin/cli']) assert.equal(config.packagerConfig.ignore(file), true, file);
  for (const file of ['/server/assistant-api.mjs', '/desktop/main.cjs', '/src/markdown-format.mjs', '/node_modules/@scope/library/index.js']) assert.equal(config.packagerConfig.ignore(file), false, file);
});
