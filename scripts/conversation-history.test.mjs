import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink, readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {listConversations, createConversation, updateConversation, selectConversation, conversationTitle} from '../server/assistant-conversations.mjs';
import {searchConversations} from '../server/conversation-search.mjs';
const makeRoot = async t => { const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-history-')); t.after(() => rm(root, {recursive: true, force: true})); return root; };
const put = async (root, file, value) => { await mkdir(path.dirname(path.join(root, file)), {recursive: true}); await writeFile(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const job = (id, extra = {}) => ({id: `assistant-${randomUUID()}`, conversationId: id, role: 'experiment', message: 'Information dimension in ML', output: 'A useful answer about fractal measures.', startedAt: '2026-09-01T12:00:00Z', completedAt: '2026-09-01T12:01:00Z', status: 'complete', selection: {adapterId: 'codex'}, sessionId: 'native-one', ...extra});

test('migration backs up exact metadata and preserves projects, experiments, transcripts and IDs', async t => {
  const root = await makeRoot(t), id = `conversation-${randomUUID()}`, record = job(id);
  const original = JSON.stringify({id, role: 'experiment', title: 'Previous conversation (historical data)', createdAt: record.startedAt}, null, 4);
  await put(root, `assistant/conversations/${id}.json`, original);
  const untouched = {'workbench.project.json': '{"name":"Existing research"}', 'runs/trial/run.json': '{"metrics":{"loss":0.125}}', 'exports/figure.svg': '<svg/>', 'writeups/main.md': '# My existing paper', [`assistant/${record.id}/job.json`]: JSON.stringify(record), 'assistant/sessions/native-one.json': '{"messages":["Original transcript"]}'};
  for (const [file, value] of Object.entries(untouched)) await put(root, file, value);
  const [conversation] = await listConversations(root, [record]);
  assert.equal(conversation.id, id); assert.equal(conversation.title, record.message); assert.equal(conversation.schemaVersion, 2);
  assert.equal(await readFile(path.join(root, `assistant/conversation-backups/v1/${id}.json`), 'utf8'), original);
  const metadata = path.join(root, `assistant/conversations/${id}.json`), before = await stat(metadata);
  await listConversations(root, [record]);
  assert.equal((await stat(metadata)).mtimeMs, before.mtimeMs, 'migration is idempotent');
  for (const [file, value] of Object.entries(untouched)) assert.equal(await readFile(path.join(root, file), 'utf8'), value, file);
});

test('manual and unknown titles survive reload, concurrent metadata edits and first send', async t => {
  const root = await makeRoot(t), conversation = await createConversation(root, 'experiment');
  await updateConversation(root, conversation.id, {title: 'My chosen title'}, []);
  await Promise.all([updateConversation(root, conversation.id, {pinned: true}, []), updateConversation(root, conversation.id, {archived: true}, [])]);
  const selected = await selectConversation(root, {conversationId: conversation.id, message: 'A completely different task'}, 'experiment', []);
  assert.equal(selected.title, 'My chosen title'); assert.equal(selected.pinned, true); assert.equal(selected.archived, true);
  const [reloaded] = await listConversations(root, []); assert.equal(reloaded.titleSource, 'manual');
  const legacy = `conversation-${randomUUID()}`;
  await put(root, `assistant/conversations/${legacy}.json`, {id: legacy, role: 'experiment', title: 'Custom old title', createdAt: '2025-01-01'});
  assert.equal((await listConversations(root, [job(legacy)])).find(c => c.id === legacy).title, 'Custom old title');
  assert.notEqual((await selectConversation(root, {message: 'New task'}, 'experiment', [])).id, conversation.id, 'implicit resume excludes archived chats');
});

test('provider lineage stays beneath one conversation and identical titles never merge', async t => {
  const root = await makeRoot(t), first = await createConversation(root, 'experiment'), second = await createConversation(root, 'experiment');
  const records = [job(first.id), job(first.id, {sessionId: 'native-two', startedAt: '2026-09-02', selection: {adapterId: 'pi'}}), job(second.id)];
  const result = await listConversations(root, records);
  assert.equal(result.length, 2); assert.equal(result.find(c => c.id === first.id).sessions.length, 2);
  assert.equal(result.find(c => c.id === second.id).sessions.length, 1);
  assert.equal(conversationTitle('You are the mathematical research assistant.\nPrivate instructions'), 'Research conversation');
  assert.equal(conversationTitle('Previous conversation context (historical messages)\nUser: Old question'), 'Research conversation');
});

test('legacy role conversations remain addressable and metadata cannot escape the project', async t => {
  const root = await makeRoot(t), other = await makeRoot(t), record = job(undefined);
  const [legacy] = await listConversations(root, [record]); assert.equal(legacy.id, 'legacy-experiment');
  await updateConversation(root, legacy.id, {title: 'Legacy research'}, [record]);
  assert.equal((await listConversations(root, [record]))[0].title, 'Legacy research');
  await assert.rejects(updateConversation(other, legacy.id, {title: 'Wrong root'}, []), /not found/);
  await assert.rejects(updateConversation(root, '../outside', {title: 'Unsafe'}, [record]), /not found/);
  await assert.rejects(updateConversation(root, legacy.id, {id: 'replace'}, [record]), /Only title/);
  const linked = await makeRoot(t); await mkdir(path.join(linked, 'assistant')); await symlink(other, path.join(linked, 'assistant/conversations'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createConversation(linked, 'writing'), /Symlinks/);
});

test('unsupported/corrupt metadata is surfaced and never overwritten', async t => {
  const root = await makeRoot(t), id = `conversation-${randomUUID()}`, file = `assistant/conversations/${id}.json`;
  const original = {schemaVersion: 99, id, role: 'experiment', title: 'Future version'};
  await put(root, file, original);
  await assert.rejects(listConversations(root, []), /Unsupported/);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, file), 'utf8')), original);
});

test('search crosses known projects read-only, filters archives, excerpts messages and paginates', async t => {
  const roots = [await makeRoot(t), await makeRoot(t)];
  const projects = roots.map((root, i) => ({root, id: `project-${i}`, name: `Project ${i}`, available: true}));
  for (const [i, root] of roots.entries()) {
    for (let n = 0; n < (i ? 1 : 52); n++) {
      const id = `conversation-${randomUUID()}`, record = job(id);
      await put(root, `assistant/${record.id}/job.json`, record);
      await put(root, `assistant/conversations/${id}.json`, {id, role: 'experiment', title: `Topic ${n}`, createdAt: record.startedAt});
    }
  }
  const first = await searchConversations(projects, {query: 'fractal'});
  assert.equal(first.total, 53); assert.equal(first.conversations.length, 50); assert.equal(first.nextOffset, 50);
  assert.ok(first.conversations.every(c => c.excerpt.includes('fractal')));
  assert.equal((await searchConversations(projects, {query: 'fractal', offset: 50})).conversations.length, 3);
  assert.equal((await searchConversations(projects, {projectId: 'project-1'})).total, 1);
  assert.equal((await searchConversations(projects, {projectId: 'arbitrary-root'})).total, 0);
  assert.deepEqual((await readdir(path.join(roots[0], 'assistant'))).filter(n => n.includes('backup')), [], 'search never migrates metadata');
  const item = first.conversations.find(c => c.projectId === 'project-0');
  await updateConversation(roots[0], item.id, {archived: true}, []);
  assert.equal((await searchConversations(projects, {archived: true})).total, 1);
  assert.equal((await searchConversations(projects)).total, 52);
});
