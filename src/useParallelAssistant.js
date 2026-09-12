import {useEffect, useRef, useState} from 'react';

export const conversationKey = (root, role, conversationId = '') => JSON.stringify([root || '', role, conversationId]);

const queueStorageKey = 'axiovela-assistant-queue-v1';
function restoredQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(queueStorageKey) || '[]');
    return Array.isArray(saved) ? saved.filter(q => q?.id && q.root && q.body?.message && q.key === conversationKey(q.root, q.body.role, q.body.conversationId)).map(q => ({...q, sending: false, paused: q.sending ? 'Delivery was interrupted. Check the conversation before resuming.' : 'Restored after reopening. Resume when ready.'})) : [];
  } catch { return []; }
}

// Work belongs to a conversation, never to the currently visible tab. Requests
// retain a settings snapshot, so a queued turn cannot inherit another chat's model.
export default function useParallelAssistant({request, onStarted, onComplete}) {
  const [records, setRecords] = useState({});
  const [pending, setPending] = useState({});
  const [queue, setQueue] = useState(restoredQueue);
  const [queueError, setQueueError] = useState('');
  const flights = useRef(new Set());
  const canceledStarts = useRef(new Set());
  const queued = useRef(queue);
  const jobs = useRef({});
  const callbacks = useRef({request, onStarted, onComplete});
  callbacks.current = {request, onStarted, onComplete};
  const mounted = useRef(true);
  const updateQueue = next => {
    queued.current = next;
    if (mounted.current) setQueue(next);
    try { localStorage.setItem(queueStorageKey, JSON.stringify(next)); if (mounted.current) setQueueError(''); }
    catch { if (mounted.current) setQueueError('Queued messages are kept in this window, but could not be saved for reopening.'); }
  };
  const pauseQueue = (key, reason, item) => {
    const items = item && !queued.current.some(q => q.id === item.id) ? [item, ...queued.current] : queued.current;
    updateQueue(items.map(q => q.key === key ? {...q, sending: false, paused: reason} : q));
  };
  const put = record => {
    if (jobs.current[record.id]?.status !== 'running' && jobs.current[record.id] && record.status === 'running') return;
    jobs.current = {...jobs.current, [record.id]: record};
    if (mounted.current) setRecords(jobs.current);
  };
  const busy = key => flights.current.has(key) || Object.values(jobs.current).some(r => r.status === 'running' && conversationKey(r.projectRoot, r.role, r.conversationId) === key);
  const launch = async item => {
    const key = item.key;
    flights.current.add(key);
    updateQueue(queued.current.map(q => q.id === item.id ? {...q, sending: true} : q));
    if (mounted.current) setPending(current => ({...current, [key]: item}));
    try {
      const started = await callbacks.current.request('/api/assistant', {method: 'POST', body: JSON.stringify(item.body), headers: {'x-axiovela-project': item.root}});
      put(started);
      updateQueue(queued.current.filter(q => q.id !== item.id));
      const nextKey = conversationKey(started.projectRoot, started.role, started.conversationId);
      updateQueue(queued.current.map(q => q.key === key ? {...q, key: nextKey, root: started.projectRoot, body: {...q.body, conversationId: started.conversationId}} : q));
      callbacks.current.onStarted?.(started, item);
      if (canceledStarts.current.has(key)) {
        try { put(await callbacks.current.request(`/api/assistant/${started.id}/cancel`, {method: 'POST', headers: {'x-axiovela-project': started.projectRoot}})); }
        catch (error) { put({...started, stage: `Cancellation failed: ${error.message}`}); }
      }
    } catch (error) {
      put({id: item.id, projectRoot: item.root, role: item.body.role, conversationId: item.body.conversationId || '', message: item.body.message, status: 'failed', error: `The assistant could not start: ${error.message}`, startedAt: new Date().toISOString(), events: []});
      pauseQueue(key, 'Could not confirm delivery. Check the conversation, then resume or edit.', item);
    } finally {
      flights.current.delete(key);
      canceledStarts.current.delete(key);
      if (mounted.current) setPending(current => { const next = {...current}; delete next[key]; return next; });
    }
  };
  const submit = (root, body) => {
    const key = conversationKey(root, body.role, body.conversationId);
    const item = {id: crypto.randomUUID(), key, root, body: structuredClone(body)};
    if (busy(key) || queued.current.some(q => q.key === key)) updateQueue([...queued.current, {...item, paused: queued.current.find(q => q.key === key && q.paused)?.paused}]);
    else void launch(item);
  };
  const adopt = history => {
    for (const record of history.jobs || []) put(record);
  };
  const latest = useRef({launch, busy, put, updateQueue, pauseQueue});
  latest.current = {launch, busy, put, updateQueue, pauseQueue};
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const polling = new Map();
    const tick = () => {
      for (const prior of Object.values(jobs.current).filter(r => r.status === 'running')) {
        if (polling.has(prior.id)) continue;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        polling.set(prior.id, controller);
        void callbacks.current.request(`/api/assistant/${prior.id}`, {headers: {'x-axiovela-project': prior.projectRoot}, signal: controller.signal}).then(record => {
          if (!active || jobs.current[prior.id]?.status !== 'running') return;
          latest.current.put(record);
          if (record.status !== 'running') {
            const key = conversationKey(record.projectRoot, record.role, record.conversationId);
            if (record.status !== 'complete') latest.current.pauseQueue(key, record.status === 'canceled' ? 'Task stopped. Resume when ready.' : 'Previous task failed. Resume when ready.');
            callbacks.current.onComplete?.(record);
          }
        }).catch(error => {
          if (active && jobs.current[prior.id]?.status === 'running') latest.current.put({...jobs.current[prior.id], statusError: error.message || 'Status request failed'});
        }).finally(() => { clearTimeout(timeout); polling.delete(prior.id); });
      }
      // Neither another provider's slow status response nor a hidden tab can
      // hold up dispatch for an idle conversation.
      const seen = new Set();
      for (const item of [...queued.current]) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        if (item.paused || item.editing || item.sending || latest.current.busy(item.key)) continue;
        void latest.current.launch(item);
      }
    };
    tick();
    const timer = setInterval(tick, 650);
    return () => { active = false; mounted.current = false; clearInterval(timer); for (const controller of polling.values()) controller.abort(); };

  }, []);
  const cancel = async (key, record) => {
    pauseQueue(key, 'Task stopped. Resume when ready.');
    if (!record) { if (flights.current.has(key)) canceledStarts.current.add(key); return; }
    try { put(await request(`/api/assistant/${record.id}/cancel`, {method: 'POST', headers: {'x-axiovela-project': record.projectRoot}})); }
    catch (error) { put({...record, stage: `Cancellation failed: ${error.message}`}); }
  };
  return {records: Object.values(records), pending, queue, queueError, submit, adopt, cancel,
    editQueued: id => updateQueue(queued.current.map(q => q.id === id && !q.sending ? {...q, editing: true, draft: q.body.message} : q)),
    draftQueued: (id, draft) => updateQueue(queued.current.map(q => q.id === id && q.editing ? {...q, draft} : q)),
    saveQueued: id => updateQueue(queued.current.map(q => q.id === id && q.editing && q.draft?.trim() ? {...q, editing: false, body: {...q.body, message: q.draft.trim()}, draft: undefined} : q)),
    cancelEditQueued: id => updateQueue(queued.current.map(q => q.id === id ? {...q, editing: false, draft: undefined} : q)),
    resumeQueue: key => updateQueue(queued.current.map(q => q.key === key ? {...q, paused: undefined} : q)),
    removeQueued: id => updateQueue(queued.current.filter(q => q.id !== id))};
}
