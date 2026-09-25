import {navigateItems} from './item-navigation.mjs';
import {useEffect, useRef, useState} from 'react';
import './conversation-history.css';

const date = value => value ? new Date(value).toLocaleString() : '';
const identity = item => `${item.projectId}:${item.id}`;
export default function ConversationHistory({request, root, onOpen, onUpdated, disabled}) {
  const dialog = useRef(null), api = useRef(request), callbacks = useRef({onOpen, onUpdated});
  api.current = request; callbacks.current = {onOpen, onUpdated};
  const [open, setOpen] = useState(false), [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(null);
  const [query, setQuery] = useState(''), [archived, setArchived] = useState(false), [offset, setOffset] = useState(0), [revision, setRevision] = useState(0);
  const [data, setData] = useState({conversations: [], warnings: [], total: 0}), [loading, setLoading] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('');
  const [focused, setFocused] = useState('');
  const entry = data.conversations.some(item => identity(item) === focused) ? focused : data.conversations[0] && identity(data.conversations[0]);
  const [editing, setEditing] = useState(''), [title, setTitle] = useState('');
  useEffect(() => {
    if (!open) return;
    dialog.current.showModal();
    let active = true;
    setProjectId(null); setError(''); setData({conversations: [], warnings: [], total: 0});
    api.current('/api/projects').then(result => {
      if (!active) return;
      const current = result.projects.find(p => p.root === root);
      setProjects(current ? [current] : []); setProjectId(current?.id || null);
      if (!current) setError('Open this project before browsing its conversations.');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [open, root]);
  useEffect(() => {
    if (!open || projectId === null) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({q: query, projectId, archived: archived ? '1' : '0', offset: String(offset)});
      api.current(`/api/assistant/history/search?${params}`, {signal: controller.signal}).then(result => {
        if (!controller.signal.aborted) setData(result);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, projectId, query, archived, offset, revision]);
  function close() { dialog.current?.close(); setOpen(false); setEditing(''); }
  function filter(set, value) { set(value); setOffset(0); setEditing(''); }
  async function update(item, patch) {
    setWorking(true); setError('');
    try {
      // Opening a saved project is explicit; catalogue search alone grants no write access.
      if (item.projectRoot !== root) throw Error('Open this conversation before editing its history metadata.');
      const {conversation} = await api.current(`/api/assistant/conversations/${item.id}`, {method: 'PUT', headers: {'x-axiovela-project': item.projectRoot}, body: JSON.stringify(patch)});
      callbacks.current.onUpdated(conversation, item.projectRoot); setEditing(''); setRevision(v => v + 1);
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function openItem(item) {
    setWorking(true); setError('');
    try { await callbacks.current.onOpen(item); close(); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  return <><button onClick={() => { setOffset(0); setQuery(''); setArchived(false); setOpen(true); }} disabled={disabled}>History</button>
    <dialog ref={dialog} className="conversationHistory" aria-labelledby="conversation-history-title" onCancel={() => { setOpen(false); setEditing(''); }}>
      <header><div><h2 id="conversation-history-title">Conversation history</h2><p>Find work in this project by topic or a phrase you remember.</p></div><button onClick={close} aria-label="Close conversation history">Close</button></header>
      <div className="historyFilters">
        <label>Search<input autoFocus aria-label="Search conversations" placeholder="Search titles and messages" value={query} maxLength={200} onChange={e => filter(setQuery, e.target.value)}/></label>
        <label>Project<select aria-label="History project" value={projectId || ''} onChange={e => filter(setProjectId, e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.available ? '' : ' (unavailable)'}</option>)}</select></label>
        <label>Show<select aria-label="History visibility" value={archived ? 'archived' : 'active'} onChange={e => filter(setArchived, e.target.value === 'archived')}><option value="active">Active</option><option value="archived">Archived</option></select></label>
      </div>
      {error && <p role="alert" className="renderError">{error}</p>}
      {data.warnings.map(w => <p key={w} className="historyNotice">{w}</p>)}
      <p role="status">{loading || projectId === null ? 'Searching…' : `${data.total} conversation${data.total === 1 ? '' : 's'}`}</p>
      <div className="historyResults" aria-busy={loading} onKeyDown={event => navigateItems(event, '.historyOpen')}>
        {!loading && !data.conversations.length && <p>No conversations found. Try another search phrase or Archived.</p>}
        {!loading && data.conversations.map((item, index) => <section key={identity(item)} className="historyItem">
          {(index === 0 || Boolean(data.conversations[index - 1].pinned) !== Boolean(item.pinned)) && <h3>{item.pinned ? 'Pinned' : 'Recent'}</h3>}
          <button className="historyOpen" tabIndex={identity(item) === entry ? 0 : -1} onFocus={() => setFocused(identity(item))} disabled={working || disabled} onClick={() => openItem(item)} title={item.title}><strong>{item.title}</strong><small>{item.projectName} · {item.role === 'writing' ? 'Writing' : 'Research'} · {date(item.updatedAt)} · {item.id.slice(-8)}</small><span>{item.excerpt || 'No messages yet'}</span></button>
          <div className="historyActions">
            <button disabled={working || item.projectRoot !== root} onClick={() => { setEditing(identity(item)); setTitle(item.title); }}>Rename</button>
            <button disabled={working || item.projectRoot !== root} onClick={() => update(item, {pinned: !item.pinned})}>{item.pinned ? 'Unpin' : 'Pin'}</button>
            <button disabled={working || item.projectRoot !== root} onClick={() => update(item, {archived: !item.archived})}>{item.archived ? 'Unarchive' : 'Archive'}</button>
            {item.projectRoot !== root && <small>Open to manage</small>}
          </div>
          {editing === identity(item) && <form className="historyRename" onSubmit={e => { e.preventDefault(); void update(item, {title}); }}><input aria-label="Conversation title" value={title} maxLength={160} onChange={e => setTitle(e.target.value)} autoFocus/><button disabled={working || !title.trim()}>Save title</button><button type="button" onClick={() => setEditing('')}>Cancel</button></form>}
        </section>)}
      </div>
      <footer><button disabled={loading || !offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous page</button><button disabled={loading || data.nextOffset == null} onClick={() => setOffset(data.nextOffset)}>Next page</button><small>Archiving hides a conversation from Recents. Messages, experiments, and results are preserved.</small></footer>
    </dialog></>;
}
