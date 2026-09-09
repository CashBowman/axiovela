import {runTitle} from './research-model.mjs';

const label = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
const key = value => label(value).toLowerCase();

// Group only recorded relationships. Never infer scientific topics from filenames.
export function organizeFigures(artifacts = [], runs = [], selection = '') {
  const byId = new Map(runs.map(run => [run.id, run]));
  const groups = new Map();
  // Populate planned/running experiment names even before their first figure.
  for (const run of runs) {
    const name = label(run.experiment);
    const groupId = name ? `experiment:${key(name)}` : `run:${run.id}`;
    if (!groups.has(groupId)) groups.set(groupId, {id: groupId, label: name || runTitle(run), runs: new Map()});
    groups.get(groupId).runs.set(run.id, runTitle(run));
  }
  const entries = artifacts.map(artifact => {
    const explicit = [...new Set([artifact.runId, ...(Array.isArray(artifact.runIds) ? artifact.runIds : [])].filter(id => typeof id === 'string' && id))];
    const ids = explicit.length ? explicit : runs.filter(run => (Array.isArray(run.artifacts) ? run.artifacts : []).some(item => (typeof item === 'string' ? item : item?.path) === artifact.path)).map(run => run.id);
    const memberships = ids.map(id => {
      const run = byId.get(id);
      const name = label(run?.experiment);
      const groupId = name ? `experiment:${key(name)}` : `run:${id}`;
      if (!groups.has(groupId)) groups.set(groupId, {id: groupId, label: name || (run ? runTitle(run) : id), runs: new Map()});
      groups.get(groupId).runs.set(id, run ? runTitle(run) : id);
      return groupId;
    });
    return {artifact, ids, memberships, topic: label(artifact.topic) || 'Figures', runLabel: ids.map(id => byId.has(id) ? runTitle(byId.get(id)) : id).join(' · ') || 'No run linked'};
  });
  const options = [...groups.values()].map(group => ({...group, runs: [...group.runs].map(([id, name]) => ({id: `run:${id}`, label: name}))}));
  const unlinked = entries.some(entry => !entry.ids.length);
  const valid = !selection || (selection === 'unlinked' && unlinked) || options.some(group => group.id === selection || group.runs.some(run => run.id === selection));
  const active = valid ? selection : '';
  const visible = entries.filter(entry => !active || (active === 'unlinked' ? !entry.ids.length : entry.memberships.includes(active) || entry.ids.some(id => `run:${id}` === active)));
  const topics = new Map();
  for (const entry of visible) {
    const topicKey = key(entry.topic);
    if (!topics.has(topicKey)) topics.set(topicKey, {title: entry.topic, entries: []});
    topics.get(topicKey).entries.push(entry);
  }
  return {options, unlinked, active, visible, sections: [...topics.values()]};
}
