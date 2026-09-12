import React from 'react';

export default function PromptQueue({items, controls, chatKey}) {
  if (!items.length && !controls.queueError) return null;
  const paused = items.find(item => item.paused);
  return <section className="promptQueue" aria-label="Queued messages">
    <div className="queueHeading"><strong role="status">{paused ? 'Queue paused' : 'Queued'} · {items.length} {items.length === 1 ? 'message' : 'messages'}</strong>{paused && <button className="textButton" onClick={() => controls.resumeQueue(chatKey)}>Resume queue</button>}</div>
    {paused && <p>{paused.paused}</p>}
    {controls.queueError && <p role="alert">{controls.queueError}</p>}
    <div className="queueItems">{items.map((item, index) => <div className="queueItem" key={item.id}>
      <small>{item.sending ? 'Starting…' : item.editing ? 'Editing queued message' : `Queued ${index + 1}`}{item.body.agenticMode ? ' · Agentic' : ''}</small>
      {item.editing ? <><textarea aria-label="Edit queued message" value={item.draft} onChange={event => controls.draftQueued(item.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); controls.saveQueued(item.id); } }}/><div className="queueActions"><button className="textButton" disabled={!item.draft?.trim()} onClick={() => controls.saveQueued(item.id)}>Save message</button><button className="textButton" onClick={() => controls.cancelEditQueued(item.id)}>Cancel edit</button></div></> : <><p>{item.body.message}</p>{item.body.artifactPath && <small>Attached: {item.body.artifactPath}</small>}<div className="queueActions"><button className="textButton" disabled={item.sending} onClick={() => controls.editQueued(item.id)}>Edit</button><button className="textButton" disabled={item.sending} aria-label="Remove queued message" onClick={() => controls.removeQueued(item.id)}>Remove</button></div></>}
    </div>)}</div>
  </section>;
}
