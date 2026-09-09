import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverApi, runApi, executeResearchTool, projectFile} from '../server/assistant-api.mjs';
import {saveProvider, getProvider, validateEndpoint} from '../server/provider-settings.mjs';
import {renderMarkdown} from '../server/markdown-render.mjs';
import {normalizeMath} from '../src/markdown-format.mjs';

const cwd = await mkdtemp(path.join(os.tmpdir(), 'workbench-provider-test-'));
process.env.WORKBENCH_PROVIDER_SETTINGS_PATH = path.join(cwd, 'private', 'providers.json');
const originalFetch = globalThis.fetch;
const signal = new AbortController().signal;
try {
  assert.throws(() => validateEndpoint('http://example.com/v1'), /HTTPS/);
  assert.throws(() => validateEndpoint('https://user:password@example.com'), /credentials/);
  assert.equal(validateEndpoint('http://127.0.0.1:1234/v1/'), 'http://127.0.0.1:1234/v1');
  for (const id of ['openai-api', 'anthropic-api', 'gemini-api', 'compatible-api']) {
    await saveProvider(id, {apiKey: 'fixture-key', ...(id === 'compatible-api' ? {endpoint: 'http://127.0.0.1:1234/v1'} : {})});
    let round = 0, sessionId, lastRequest;
    const modelId = id === 'openai-api' ? 'gpt-5' : id === 'gemini-api' ? 'gemini-3-flash-preview' : 'fixture-model';
    const tool = {path: 'research/result.md', content: '# Real file\n\\(x^2\\)'};
    globalThis.fetch = async (url, init) => {
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers[id === 'anthropic-api' ? 'x-api-key' : id === 'gemini-api' ? 'x-goog-api-key' : 'authorization'], id === 'anthropic-api' || id === 'gemini-api' ? 'fixture-key' : 'Bearer fixture-key');
      if (init.method === 'GET') return Response.json(id === 'gemini-api' ? {models: [{name: `models/${modelId}`, thinking: true, supportedGenerationMethods: ['generateContent']}]} : {data: [{id: modelId, capabilities: {effort: {high: {supported: true}}, thinking: {types: {adaptive: {supported: true}}}}}]});
      const body = JSON.parse(init.body); lastRequest = body; round++;
      if (id !== 'gemini-api') assert.equal(body.model, modelId);
      const first = round === 1;
      if (id === 'openai-api') return Response.json({status: 'completed', output: first ? [{type: 'function_call', call_id: 'call-1', name: 'write_file', arguments: JSON.stringify(tool)}] : [{type: 'message', content: [{type: 'output_text', text: '**Complete** $x^2$'}]}]});
      if (id === 'anthropic-api') return Response.json({stop_reason: first ? 'tool_use' : 'end_turn', content: first ? [{type: 'tool_use', id: 'call-1', name: 'write_file', input: tool}] : [{type: 'text', text: '**Complete** $x^2$'}]});
      if (id === 'gemini-api') { assert.ok(body.tools[0].functionDeclarations[0].parametersJsonSchema); return Response.json({candidates: [{finishReason: 'STOP', content: {role: 'model', parts: first ? [{functionCall: {id: 'call-1', name: 'write_file', args: tool}, thoughtSignature: 'opaque'}] : [{text: '**Complete** $x^2$'}]}}]}); }
      return Response.json({choices: [{finish_reason: first ? 'tool_calls' : 'stop', message: {role: 'assistant', content: first ? null : '**Complete** $x^2$', ...(first ? {tool_calls: [{id: 'call-1', type: 'function', function: {name: 'write_file', arguments: JSON.stringify(tool)}}]} : {})}}]});
    };
    const catalog = await discoverApi(id);
    assert.equal(catalog.available, true); assert.equal(catalog.models[0].id, modelId);
    assert.equal(JSON.stringify(catalog).includes('fixture-key'), false);
    const model = catalog.models[0];
    const options = {selection: {adapterId: id, modelId, effort: model.efforts.includes('high') ? 'high' : ''}, cwd, mode: 'auto', prompt: 'Write the file.', signal, onSession: value => {sessionId = value;}, onEvent: () => {}, onOutput: () => {}, onEffective: () => {}};
    assert.match(await runApi(options, model), /Complete/);
    assert.equal(await readFile(path.join(cwd, tool.path), 'utf8'), tool.content);
    assert.equal(round, 2);
    if (id === 'openai-api') { assert.equal(lastRequest.reasoning.effort, 'high'); assert.ok(lastRequest.input.some(m => m.type === 'function_call_output')); }
    if (id === 'anthropic-api') assert.equal(lastRequest.output_config.effort, 'high');
    if (id === 'gemini-api') { assert.equal(lastRequest.generationConfig.thinkingConfig.thinkingLevel, 'high'); assert.ok(lastRequest.contents.some(c => c.parts.some(p => p.thoughtSignature))); }
    await runApi({...options, sessionId, prompt: 'Continue.'}, model);
    assert.equal(JSON.parse(await readFile(path.join(cwd, `assistant/sessions/${sessionId}.json`), 'utf8')).messages.length, 4);
    for (let turn = 0; turn < 12; turn++) {
      await runApi({...options, sessionId, prompt: `Follow-up ${turn}: retain the conversation.`}, model);
      const sent = id === 'gemini-api' ? lastRequest.contents : id === 'openai-api' ? lastRequest.input : lastRequest.messages;
      assert.ok(sent.length <= 20, 'current prompt must fit inside the 20-message history budget');
      assert.equal(sent[0].role, 'user');
      assert.ok(JSON.parse(await readFile(path.join(cwd, `assistant/sessions/${sessionId}.json`), 'utf8')).messages.length <= 20);
    }
    globalThis.fetch = async () => new Response('SECRET upstream details', {status: 401});
    await assert.rejects(runApi({...options, sessionId: undefined}, model), error => /HTTP 401/.test(error.message) && !error.message.includes('SECRET'));
    // A failed first turn still has a restorable empty session.
    assert.deepEqual(JSON.parse(await readFile(path.join(cwd, `assistant/sessions/${sessionId}.json`), 'utf8')).messages, []);
  }
  const context = {cwd, mode: 'auto', signal, compileDocument: async format => ({format, status: 'complete'})};
  await assert.rejects(executeResearchTool('write_file', {path: 'x', content: 'x'}, {...context, mode: 'ask'}), /does not permit/);
  await assert.rejects(readFile(path.join(cwd, 'x')), {code: 'ENOENT'});
  await executeResearchTool('write_file', {path: 'access-check.txt', content: 'auto write'}, context);
  await assert.rejects(executeResearchTool('write_file', {path: 'access-check.txt', content: 'forbidden overwrite'}, {...context, mode: 'ask'}), /does not permit/);
  assert.equal(await readFile(path.join(cwd, 'access-check.txt'), 'utf8'), 'auto write');
  await executeResearchTool('write_file', {path: 'access-check.txt', content: 'full write'}, {...context, mode: 'full'});
  assert.equal(await readFile(path.join(cwd, 'access-check.txt'), 'utf8'), 'full write');
  await assert.rejects(executeResearchTool('run_command', {command: 'echo not-run'}, context), /Full access/);
  await assert.rejects(executeResearchTool('compile_document', {format: 'latex', source: 'x'}, context), /Full access/);
  assert.match(await executeResearchTool('compile_document', {format: 'markdown', source: '# Hi'}, context), /complete/);
  assert.match(await executeResearchTool('run_command', {command: 'echo fixture-command'}, {...context, mode: 'full'}), /fixture-command/);
  for (const file of ['../outside', '.env', '.codex/auth.json', 'providers.json']) await assert.rejects(projectFile(cwd, file, true));
  if (process.platform !== 'win32') { await symlink(os.tmpdir(), path.join(cwd, 'link')); await assert.rejects(projectFile(cwd, 'link/file', true), /Symlinks/); }
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(executeResearchTool('list_files', {path: '.'}, {...context, signal: canceled.signal}), /canceled/);
  delete process.env.OPENAI_API_KEY;
  await saveProvider('openai-api', {apiKey: 'must-not-be-saved', clearKey: true});
  assert.equal((await getProvider('openai-api')).key, '');
  const markdown = '# Heading\n\n**Bold** and \\(x^2\\).\n\n\\[\\sum_i x_i\\]\n\n```tex\n\\(literal\\)\n```\n\n<script>alert(1)</script>';
  const html = renderMarkdown(markdown);
  assert.match(html, /<h1>Heading/); assert.match(html, /<strong>Bold/); assert.match(html, /class="katex"/); assert.match(html, /katex-display/);
  assert.ok(!html.includes('<script>')); assert.match(html, /\\\(literal\\\)/);
  assert.equal(normalizeMath('`\\(x\\)`'), '`\\(x\\)`');
  assert.doesNotThrow(() => renderMarkdown('$\\unknown{x}$'));
  console.log('Provider smoke passed: four wire protocols, model discovery, reasoning, tools, resume/failure recovery, permission boundaries, secret filtering, Markdown/math.');
} finally { globalThis.fetch = originalFetch; await rm(cwd, {recursive: true, force: true}); }
