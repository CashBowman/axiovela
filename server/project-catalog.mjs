import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import atomic from './atomic-file.cjs';
import {containedProjectPath} from './project-paths.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const text = (v, n = 2000) => typeof v === 'string' ? v.trim().slice(0, n) : '';
export const projectRelations = ['related-to', 'extends', 'supports', 'contradicts', 'uses', 'tests', 'motivates'];
const key = (id, run) => run ? `experiment:${id}:${encodeURIComponent(run)}` : `project:${id}`;
async function read(root, relative, fallback = null) {
  try {
    const file = containedProjectPath(root, relative);
    if ((await fs.stat(file)).size > 4 * 1024 * 1024) throw fail('Project metadata is too large.');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
function sourceIdentity(p) {
  if (text(p.doi)) return `doi:${p.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi.org\//, '').trim()}`;
  if (text(p.arxivId)) return `arxiv:${p.arxivId.replace(/v\d+$/, '')}`;
  try {
    const u = new URL(p.canonicalUrl || p.url || p.sourceUrl);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '';
    if (u.hostname === 'doi.org') return `doi:${u.pathname.slice(1).toLowerCase()}`;
    if (u.hostname === 'arxiv.org') return `arxiv:${u.pathname.replace(/^\/(abs|pdf)\//, '').replace(/\.pdf$/, '').replace(/v\d+$/, '')}`;
    u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/.test(k)) u.searchParams.delete(k);
    u.searchParams.sort(); return u.href;
  } catch { return /^[a-f0-9]{64}$/.test(p.contentHash || '') ? `sha256:${p.contentHash}` : ''; }
}

// A device-local index of explicitly selected projects. Never scans home folders,
// initializes indexed projects, or passes other projects to a model.
export function createProjectCatalog(file) {
  let tail = Promise.resolve();
  async function load() {
    try {
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (value.schemaVersion !== 1 || !Array.isArray(value.projects) || !Array.isArray(value.links)) throw fail('Unsupported project catalog. Restore its backup before editing.', 409);
      return value;
    } catch (e) { if (e.code === 'ENOENT') return {schemaVersion: 1, projects: [], links: []}; throw e; }
  }
  const mutate = (fn) => {
    const next = tail.catch(() => {}).then(async () => {
      const data = await load(), result = await fn(data);
      await fs.mkdir(path.dirname(file), {recursive: true});
      await atomic.atomicWriteFile(file, JSON.stringify(data, null, 2) + '\n'); return result;
    }); tail = next; return next;
  };
  async function inspect(root) {
    const canonical = await fs.realpath(root);
    const manifest = await read(canonical, 'workbench.project.json');
    if (!manifest || typeof manifest !== 'object') throw fail('Choose an existing Axiovela project folder.');
    return {root: canonical, name: text(manifest.name, 200) || path.basename(canonical), question: text(manifest.researchQuestion)};
  }
  async function remember(root, {touch = true} = {}) {
    const info = await inspect(root);
    return mutate(data => {
      let entry = data.projects.find(p => p.root === info.root);
      if (!touch && entry?.hidden) return entry;
      if (!entry || entry.hidden) {
        if (data.projects.filter(p=>!p.hidden).length >= 500) throw fail('The project index holds up to 500 folders. Remove an unused entry first.');
        if(!entry){entry = {id: createHash('sha256').update(info.root).digest('hex').slice(0, 24), pinned: false, addedAt: new Date().toISOString()}; data.projects.push(entry);}
      }
      Object.assign(entry, info, {hidden:false}); if (touch) entry.lastOpened = new Date().toISOString(); return entry;
    });
  }
  async function snapshot({details = true} = {}) {
    await tail.catch(() => {});
    const data = await load(), items = [], links = [], sources = new Map(), warnings = [];
    const projects = [];
    let experimentCount = 0;
    for (const p of data.projects.filter(p=>!p.hidden)) {
      let info;
      try { info = await inspect(p.root); if (info.root !== p.root) throw fail('Folder identity changed. Locate the project again.'); }
      catch (e) { projects.push({...p, available: false, issue: e.code === 'ENOENT' ? 'Folder unavailable' : e.message}); continue; }
      const project = {...p, ...info, available: true}; projects.push(project);
      items.push({key: key(p.id), kind: 'project', label: info.name, projectId: p.id, root: p.root, detail: info.question, location: 'workbench.project.json'});
      if (!details) continue;
      try {
        const runs = await fs.readdir(containedProjectPath(p.root, 'runs'), {withFileTypes: true}).catch(e => { if(e.code === 'ENOENT')return []; throw e; });
        if (runs.length > 200) warnings.push(`${info.name}: showing the first 200 recorded experiments.`);
        for (const run of runs.filter(r => r.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)).slice(0, 200)) {
          if(experimentCount>=300){warnings.push("Showing up to 300 experiments across this index. Open a project for its complete run ledger.");break;}
          const r = await read(p.root, `runs/${run.name}/run.json`);
          if (!r) continue;
          experimentCount++;
          const runKey = key(p.id, run.name), label = text(r.name || r.experiment || r.id, 200) || run.name;
          items.push({key: runKey, kind: 'experiment', label, projectId: p.id, root: p.root, runId: run.name, detail: `Recorded experiment in ${info.name}. Status: ${text(r.status, 80) || 'unknown'}.`, location: `runs/${run.name}/run.json`});
          links.push({id: `contains:${runKey}`, from: key(p.id), to: runKey, type: 'contains', description: `${info.name} contains the recorded experiment “${label}”. This is project membership, not evidence of a scientific conclusion.`, location: `runs/${run.name}/run.json`, origin: 'Recorded membership'});
        }
      } catch (e) { warnings.push(`${info.name}: experiments could not be indexed (${e.message}).`); }
      try {
        const catalog = await read(p.root, 'library/catalog.json', {});
        for (const source of (Array.isArray(catalog.papers) ? catalog.papers : []).slice(0, 1000)) {
          const identity = sourceIdentity(source); if (!identity) continue;
          if (!sources.has(identity)) sources.set(identity, new Map());
          sources.get(identity).set(p.id, {name: info.name, title: text(source.title, 300) || identity});
        }
      } catch (e) { warnings.push(`${info.name}: shared sources could not be indexed (${e.message}).`); }
    }
    const pairs = new Map();
    for (const [identity, users] of sources) {
      const ids = [...users.keys()].sort();
      for (let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) {
        const pair = `${ids[i]}:${ids[j]}`;
        if(pairs.size>=1000&&!pairs.has(pair))continue;
        if (!pairs.has(pair)) pairs.set(pair, {a:ids[i], b:ids[j], evidence:[]});
        pairs.get(pair).evidence.push(`${users.get(ids[i]).title} (${identity})`);
      }
    }
    if(pairs.size>=1000)warnings.push("Showing up to 1000 shared-source project connections.");
    for(const [id,pair] of pairs) links.push({id:`shared:${id}`,from:key(pair.a),to:key(pair.b),type:'shares sources with',description:`Both project libraries contain ${pair.evidence.length} matching source${pair.evidence.length===1?'':'s'}. Shared references suggest a useful connection, but do not establish agreement or causation. This relationship is symmetric.`, evidence:pair.evidence,location:'library/catalog.json in both projects',origin:'Exact source match'});
    const ids = new Set(items.map(i=>i.key));
    for(const l of data.links) if(ids.has(l.from) && ids.has(l.to)) links.push({...l,origin:'User connection',manual:true});
    const unavailableLinks = data.links.filter(l=>!ids.has(l.from)||!ids.has(l.to)).length;
    if(unavailableLinks) warnings.push(`${unavailableLinks} saved connection(s) have unavailable endpoints; their records are preserved.`);
    return {schemaVersion:1,projects:projects.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||String(b.lastOpened||'').localeCompare(String(a.lastOpened||''))||a.name.localeCompare(b.name)),items,links,warnings};
  }
  async function edit(body) {
    if(body.action==='remember') return remember(body.path,{touch:false});
    if(body.action==='link') {
      const graph=await snapshot();
      if(body.from===body.to || !graph.items.some(i=>i.key===body.from)||!graph.items.some(i=>i.key===body.to)) throw fail('Choose two available projects or experiments.');
      if(!projectRelations.includes(body.type)||!text(body.description,4000))throw fail('Choose a relationship and explain it.');
      return mutate(data=> {
        let link=body.id?data.links.find(l=>l.id===body.id):null;
        if(body.id&&!link)throw fail('Connection no longer exists.',409);
        if(!link){link={id:randomUUID()};data.links.push(link);}
        Object.assign(link,{from:body.from,to:body.to,type:body.type,description:text(body.description,4000),updatedAt:new Date().toISOString()}); return link;
      });
    }
    const located=body.action==='locate'?await inspect(body.path):null;
    return mutate(data=> {
      if(body.action==='unlink'){data.links=data.links.filter(l=>l.id!==body.id);return;}
      const p=data.projects.find(p=>p.id===body.id);if(!p)throw fail('Project is no longer in the index.',404);
      if(body.action==='pin')p.pinned=body.pinned===true;
      else if(body.action==='forget'){p.hidden=true; /* preserve identity and links for re-adding, including moved folders */}
      else if(body.action==='locate') {if(data.projects.some(x=>x.id!==p.id&&x.root===located.root))throw fail('That folder is already indexed.');Object.assign(p,located);}
      else throw fail('Unknown project index action.');
    });
  }
  return {remember,snapshot,edit};
}
