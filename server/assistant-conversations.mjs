import {randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile, rename} from 'node:fs/promises';
import path from 'node:path';
import {projectFile} from './assistant-api.mjs';

export const conversationIdFor = record => record.conversationId || `legacy-${record.role || 'experiment'}`;

export async function listConversations(root, records) {
  const conversations = new Map();
  if (!root) return [];
  try {
    const directory = await projectFile(root, 'assistant/conversations');
    for (const name of await readdir(directory)) {
      if (!/^conversation-[a-f0-9-]{36}\.json$/.test(name)) continue;
      const value = JSON.parse(await readFile(await projectFile(root, `assistant/conversations/${name}`), 'utf8'));
      if (value.id + '.json' === name && ['experiment', 'writing'].includes(value.role)) conversations.set(value.id, {...value, count: 0});
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const record of records) {
    const id = conversationIdFor(record);
    const conversation = conversations.get(id) || {id, role: record.role || 'experiment', title: record.message?.replace(/\s+/g, ' ').slice(0, 72) || 'Previous conversation', createdAt: record.startedAt, count: 0};
    conversation.count++;
    conversation.updatedAt = record.startedAt;
    conversation.status = record.status;
    conversations.set(id, conversation);
  }
  return [...conversations.values()].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createConversation(root, role) {
  if (!root) throw new Error('Open a project before starting a conversation.');
  const conversation = {id: `conversation-${randomUUID()}`, role, title: 'New conversation', createdAt: new Date().toISOString(), count: 0};
  await saveConversation(root, conversation);
  return conversation;
}

async function saveConversation(root, conversation) {
  const file = await projectFile(root, `assistant/conversations/${conversation.id}.json`, true);
  await mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(conversation), {mode: 0o600});
  await rename(temporary, file);
}

export async function selectConversation(root, body, role, records) {
  const conversations = await listConversations(root, records);
  let conversation = body.newSession ? null : body.conversationId
    ? conversations.find(item => item.id === body.conversationId && item.role === role)
    : conversations.find(item => item.role === role);
  if (body.conversationId && !body.newSession && !conversation) throw Object.assign(new Error('Conversation not found in this project and assistant.'), {status: 404});
  if (!conversation) conversation = await createConversation(root, role);
  if (!conversation.count && conversation.id.startsWith('conversation-')) {
    conversation.title = body.message.replace(/\s+/g, ' ').slice(0, 72);
    await saveConversation(root, conversation);
  }
  return conversation;
}

// Include failed user requests: they may never have reached the native session.
export function conversationContext(records) {
  return records.slice(-8).map(job => `User: ${job.message.slice(-4000)}${job.artifactPath ? "\nAttached project figure: " + job.artifactPath : ""}\nAssistant (${job.status}): ${(job.output || job.error || 'No response recorded.').slice(-2000)}`).join('\n\n').slice(-24000);
}
