import {useEffect, useRef, useState} from 'react';

export const conversationKey = (root, role, conversationId = '') => JSON.stringify([root || '', role, conversationId]);

// Work belongs to a conversation, never to the currently visible tab. Requests
// retain a settings snapshot, so a queued turn cannot inherit another chat's model.
export default function useParallelAssistant({request, onStarted, onComplete}) {
  const [records, setRecords] = useState({});
  const [pending, setPending] = useState({});
  const [queue, setQueue] = useState([]);
  const flights = useRef(new Set());
  const canceledStarts = useRef(new Set());
  const queued = useRef([]);
  const jobs = useRef({});
  const callbacks = useRef({request, onStarted, onComplete});
  callbacks.current = {request, onStarted, onComplete};
  const mounted = useRef(true);
  const updateQueue = next => { queued.current = next; if (mounted.current) setQueue(next); };
  const put = record => {
    if (jobs.current[record.id]?.status !== 'running' && jobs.current[record.id] && record.status === 'running') return;
    jobs.current = {...jobs.current, [record.id]: record};
    if (mounted.current) setRecords(jobs.current);
  };
  const busy = key => flights.current.has(key) || Object.values(jobs.current).some(r => r.status === 'running' && conversationKey(r.projectRoot, r.role, r.conversationId) === key);
  const launch = async item => {
    const key = item.key;
    flights.current.add(key);
    if (mounted.current) setPending(current => ({...current, [key]: item}));
    try {
      const started = await callbacks.current.request('/api/assistant', {method: 'POST', body: JSON.stringify(item.body), headers: {'x-axiovela-project': item.root}});
      put(started);
      if (canceledStarts.current.has(key)) {
        put(await callbacks.current.request(`/api/assistant/${started.id}/cancel`, {method: 'POST', headers: {'x-axiovela-project': started.projectRoot}}));
        return;
      }
      const nextKey = conversationKey(started.projectRoot, started.role, started.conversationId);
      updateQueue(queued.current.map(q => q.key === key ? {...q, key: nextKey, root: started.projectRoot, body: {...q.body, conversationId: started.conversationId}} : q));
      callbacks.current.onStarted?.(started, item);
    } catch (error) {
      put({id: item.id, projectRoot: item.root, role: item.body.role, conversationId: item.body.conversationId || '', message: item.body.message, status: 'failed', error: `The assistant could not start: ${error.message}`, startedAt: new Date().toISOString(), events: []});
      updateQueue(queued.current.filter(q => q.key !== key));
    } finally {
      flights.current.delete(key);
      canceledStarts.current.delete(key);
      if (mounted.current) setPending(current => { const next = {...current}; delete next[key]; return next; });
    }
  };
  const submit = (root, body) => {
    const key = conversationKey(root, body.role, body.conversationId);
    const item = {id: crypto.randomUUID(), key, root, body: structuredClone(body)};
    if (busy(key)) updateQueue([...queued.current, item]);
    else void launch(item);
  };
  const adopt = history => {
    for (const record of history.jobs || []) put(record);
  };
  const latest = useRef({launch, busy, put, updateQueue});
  latest.current = {launch, busy, put, updateQueue};
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
            if (record.status !== 'complete') latest.current.updateQueue(queued.current.filter(q => q.key !== key));
            callbacks.current.onComplete?.(record);
          }
        }).catch(error => {
          if (active && jobs.current[prior.id]?.status === 'running') latest.current.put({...jobs.current[prior.id], statusError: error.message || 'Status request failed'});
        }).finally(() => { clearTimeout(timeout); polling.delete(prior.id); });
      }
      // Neither another provider's slow status response nor a hidden tab can
      // hold up dispatch for an idle conversation.
      for (const item of [...queued.current]) {
        if (latest.current.busy(item.key)) continue;
        latest.current.updateQueue(queued.current.filter(q => q.id !== item.id));
        void latest.current.launch(item);
      }
    };
    tick();
    const timer = setInterval(tick, 650);
    return () => { active = false; mounted.current = false; clearInterval(timer); for (const controller of polling.values()) controller.abort(); };

  }, []);
  const cancel = async (key, record) => {
    updateQueue(queued.current.filter(q => q.key !== key));
    if (!record) { if (flights.current.has(key)) canceledStarts.current.add(key); return; }
    try { put(await request(`/api/assistant/${record.id}/cancel`, {method: 'POST', headers: {'x-axiovela-project': record.projectRoot}})); }
    catch (error) { put({...record, stage: `Cancellation failed: ${error.message}`}); }
  };
  return {records: Object.values(records), pending, queue, submit, adopt, cancel, removeQueued: id => updateQueue(queued.current.filter(q => q.id !== id))};
}
