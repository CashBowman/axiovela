import {readdir, readFile, stat} from 'node:fs/promises';
import {containedProjectPath} from './project-paths.mjs';
import {listConversations, conversationIdFor} from './assistant-conversations.mjs';

const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
function excerpt(text, query) {
  const value = normalize(text), at = query ? value.toLowerCase().indexOf(query) : 0;
  const start = Math.max(0, at - 65);
  return (start ? '…' : '') + value.slice(start, start + 220) + (value.length > start + 220 ? '…' : '');
}

// Read-only, on-demand index of explicitly catalogued projects. This endpoint
// never opens/initializes projects or grants access to other project endpoints.
export async function searchConversations(projects, {query = '', projectId = '', archived = false, offset = 0} = {}) {
  const q = normalize(query).toLowerCase().slice(0, 200), results = [], warnings = [];
  const selected = projects.filter(p => !projectId || p.id === projectId);
  if (selected.length > 100) warnings.push('Search covers the first 100 saved projects. Select a project to narrow the search.');
  let bytes = 0;
  for (const project of selected.slice(0, 100)) {
    if (!project.available) { warnings.push(`${project.name}: ${project.issue || 'Folder unavailable'}`); continue; }
    try {
      let entries;
      try { entries = await readdir(containedProjectPath(project.root, 'assistant'), {withFileTypes: true}); }
      catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      const names = entries.filter(e => e.isDirectory() && /^assistant-[A-Za-z0-9-]{8,80}$/.test(e.name)).map(e => e.name).sort().reverse();
      if (names.length > 5000) warnings.push(`${project.name}: searched up to 5,000 turn records.`);
      const records = [];
      for (const name of names.slice(0, 5000)) {
        const file = containedProjectPath(project.root, `assistant/${name}/job.json`);
        const size = (await stat(file)).size;
        if (size > 4 * 1024 * 1024) { warnings.push(`${project.name}: skipped an oversized turn record.`); continue; }
        if (bytes + size > 64 * 1024 * 1024) { warnings.push('Search reached its 64 MB read limit. Narrow the project filter.'); break; }
        bytes += size;
        const record = JSON.parse(await readFile(file, 'utf8'));
        if (record.id === name && ['experiment', 'writing', undefined].includes(record.role)) records.push(record);
      }
      const conversations = await listConversations(project.root, records, {migrate: false});
      const messages = new Map();
      for (const record of records) {
        const id = conversationIdFor(record);
        const previous = messages.get(id);
        const match = [record.message, record.output].find(text => typeof text === 'string' && normalize(text).toLowerCase().includes(q));
        if (match && (!previous || String(record.startedAt) > previous.at)) messages.set(id, {text: match, at: String(record.startedAt)});
      }
      for (const conversation of conversations) {
        if (Boolean(conversation.archived) !== Boolean(archived)) continue;
        const match = messages.get(conversation.id);
        if (q && !conversation.title.toLowerCase().includes(q) && !match) continue;
        const {sessions, ...summary} = conversation;
        results.push({...summary, projectId: project.id, projectName: project.name, projectRoot: project.root, excerpt: excerpt(match?.text || '', q), sessionCount: sessions.length});
      }
    } catch (error) { warnings.push(`${project.name}: ${error.message}`); }
    if (bytes >= 64 * 1024 * 1024) break;
  }
  results.sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)) || `${a.projectId}:${a.id}`.localeCompare(`${b.projectId}:${b.id}`));
  const start = Math.max(0, Math.min(100000, Math.floor(Number(offset) || 0)));
  return {conversations: results.slice(start, start + 50), total: results.length, nextOffset: start + 50 < results.length ? start + 50 : null, warnings: [...new Set(warnings)]};
}
