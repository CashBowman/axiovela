import {randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {projectFile} from './assistant-api.mjs';
import atomic from './atomic-file.cjs';

export const conversationIdFor = record => record.conversationId || `legacy-${record.role || 'experiment'}`;
const validId = id => /^(conversation-[a-f0-9-]{36}|legacy-(experiment|writing))$/.test(id);
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const tails = new Map();
function serialize(root, fn) {
  const next = (tails.get(root) || Promise.resolve()).catch(() => {}).then(fn);
  tails.set(root, next);
  return next.finally(() => { if (tails.get(root) === next) tails.delete(root); });
}
const boilerplate = value => /^(?:New conversation$|Previous conversation\b|You are (?:the mathematical research|the user-facing Axiovela)|You are reviewing manuscript annotat)/i.test(clean(value));

// Only original user requests reach this function, never an assembled provider prompt.
// Ambiguous old handoffs are left untitled rather than guessing where history ends.
export function conversationTitle(message, role = 'experiment') {
  const request = typeof message === 'string' ? message.trim() : '';
  const line = request.split(/\r?\n/).map(line => line.replace(/^#{1,6}\s+/, '').trim()).find(Boolean) || '';
  if (!line || boilerplate(line)) return role === 'writing' ? 'Writing conversation' : 'Research conversation';
  const title = clean(line);
  return title.length > 96 ? `${title.slice(0, 95).trimEnd()}…` : title;
}

async function saveConversation(root, conversation) {
  if (!validId(conversation.id)) throw fail('Invalid conversation identity.');
  const file = await projectFile(root, `assistant/conversations/${conversation.id}.json`, true);
  await mkdir(path.dirname(file), {recursive: true});
  // Counts, status, timestamps and native-session lineage are derived from original job records.
  const {count, status, updatedAt, sessions, ...metadata} = conversation;
  await atomic.atomicWriteFile(file, JSON.stringify(metadata, null, 2) + '\n', {mode: 0o600});
}

async function readMetadata(root) {
  const values = new Map();
  let names;
  try { names = await readdir(await projectFile(root, 'assistant/conversations')); }
  catch (error) { if (error.code === 'ENOENT') return values; throw error; }
  if (names.length > 10000) throw fail('Conversation metadata exceeds the 10,000-file limit.', 413);
  let bytes = 0;
  for (const name of names) {
    if (!name.endsWith('.json') || !validId(name.slice(0, -5))) continue;
    const file = await projectFile(root, `assistant/conversations/${name}`);
    const size = (await stat(file)).size;
    if (size > 256000 || (bytes += size) > 16 * 1024 * 1024) throw fail(`Conversation metadata exceeds its read limit: ${name}`, 413);
    const original = await readFile(file, 'utf8'), value = JSON.parse(original);
    if (value.id + '.json' !== name || !['experiment', 'writing'].includes(value.role)) throw fail(`Invalid conversation metadata: ${name}`, 409);
    if (value.schemaVersion !== undefined && ![1, 2].includes(value.schemaVersion)) throw fail(`Unsupported conversation metadata: ${name}`, 409);
    if (value.schemaVersion === 2 && (typeof value.title !== 'string' || !value.title.trim())) throw fail(`Invalid conversation title: ${name}`, 409);
    values.set(value.id, {value, original});
  }
  return values;
}

async function listUnlocked(root, records, migrate) {
  if (!root) return [];
  const stored = await readMetadata(root), grouped = new Map();
  for (const record of records) {
    const id = conversationIdFor(record);
    if (!validId(id)) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(record);
  }
  const conversations = [];
  for (const id of new Set([...stored.keys(), ...grouped.keys()])) {
    const jobs = (grouped.get(id) || []).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    const saved = stored.get(id), first = jobs[0];
    const value = saved?.value || {id, role: first.role || 'experiment', createdAt: first.startedAt};
    let metadata = {...value};
    if (metadata.schemaVersion !== 2) {
      // Preserve unknown/custom titles. Old Axiovela generated exactly this prefix.
      const generated = !['manual', 'preserved'].includes(metadata.titleSource) && (!metadata.title || boilerplate(metadata.title) || metadata.title === clean(first?.message).slice(0, 72));
      metadata = {...metadata, schemaVersion: 2, title: generated ? conversationTitle(first?.message, value.role) : metadata.title,
        titleSource: generated ? 'generated' : 'preserved', pinned: Boolean(metadata.pinned), archived: Boolean(metadata.archived)};
      if (migrate) {
        if (saved) {
          const backup = await projectFile(root, `assistant/conversation-backups/v1/${id}.json`, true);
          await mkdir(path.dirname(backup), {recursive: true});
          try { await stat(backup); }
          catch (error) { if (error.code !== 'ENOENT') throw error; await atomic.atomicWriteFile(backup, saved.original, {mode: 0o600}); }
        }
        await saveConversation(root, metadata);
      }
    }
    const sessions = [];
    for (const job of jobs) if (job.sessionId && !sessions.some(s => s.id === job.sessionId && s.adapterId === job.selection?.adapterId)) {
      sessions.push({id: job.sessionId, adapterId: job.selection?.adapterId, startedAt: job.startedAt, jobId: job.id});
    }
    const last = jobs.at(-1);
    conversations.push({...metadata, count: jobs.length, updatedAt: last?.completedAt || last?.startedAt || metadata.createdAt, status: last?.status, sessions});
  }
  return conversations.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.id.localeCompare(b.id));
}

export function listConversations(root, records, {migrate = true} = {}) {
  return serialize(root, () => listUnlocked(root, records, migrate));
}
async function createUnlocked(root, role) {
  if (!root) throw fail('Open a project before starting a conversation.');
  if (!['experiment', 'writing'].includes(role)) throw fail('Invalid assistant role.');
  const conversation = {schemaVersion: 2, id: `conversation-${randomUUID()}`, role, title: 'New conversation', titleSource: 'generated', pinned: false, archived: false, createdAt: new Date().toISOString(), count: 0};
  await saveConversation(root, conversation);
  return conversation;
}
export function createConversation(root, role) { return serialize(root, () => createUnlocked(root, role)); }

export function updateConversation(root, id, patch, records) {
  return serialize(root, async () => {
    if (!validId(id)) throw fail('Conversation not found in this project.', 404);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['title', 'pinned', 'archived'].includes(key))) throw fail('Only title, pinned and archived may be edited.');
    if ('title' in patch && (typeof patch.title !== 'string' || !clean(patch.title) || patch.title.length > 160)) throw fail('Choose a title between 1 and 160 characters.');
    for (const key of ['pinned', 'archived']) if (key in patch && typeof patch[key] !== 'boolean') throw fail(`Invalid ${key} value.`);
    const conversation = (await listUnlocked(root, records, true)).find(item => item.id === id);
    if (!conversation) throw fail('Conversation not found in this project.', 404);
    Object.assign(conversation, patch, 'title' in patch ? {title: clean(patch.title), titleSource: 'manual'} : {});
    await saveConversation(root, conversation);
    return conversation;
  });
}

export function selectConversation(root, body, role, records) {
  return serialize(root, async () => {
    const conversations = await listUnlocked(root, records, true);
    let conversation = body.newSession ? null : body.conversationId
      ? conversations.find(item => item.id === body.conversationId && item.role === role)
      : conversations.find(item => item.role === role && !item.archived);
    if (body.conversationId && !body.newSession && !conversation) throw fail('Conversation not found in this project and assistant.', 404);
    if (!conversation) conversation = await createUnlocked(root, role);
    if (!conversation.count && conversation.titleSource === 'generated') {
      conversation.title = conversationTitle(body.message, role);
      await saveConversation(root, conversation);
    }
    return conversation;
  });
}

// Include failed user requests: they may never have reached the native session.
export function conversationContext(records) {
  return records.slice(-8).map(job => `User: ${job.message.slice(-4000)}${job.artifactPath ? "\nAttached project figure: " + job.artifactPath : ""}\nAssistant (${job.status}): ${(job.output || job.error || 'No response recorded.').slice(-2000)}`).join('\n\n').slice(-24000);
}
