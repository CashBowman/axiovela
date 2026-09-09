import React, {useState, useLayoutEffect, useRef} from 'react';
import {Copy, Check} from 'lucide-react';
export function CopyMessage({text}) {
  const [status, setStatus] = useState('');
  return <button className="textButton messageCopy" title="Copy message" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setStatus('Copied'); }
    catch { setStatus('Copy failed. Select the text to copy.'); }
  }}>{status === 'Copied' ? <Check size={12}/> : <Copy size={12}/>}<span role="status">{status || 'Copy'}</span></button>;
}
export function PromptText({text}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 360 || text.split('\n').length > 5;
  return <><span className={long && !expanded ? 'collapsedPrompt' : 'promptText'}>{text}</span>{long && <button className="textButton" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show full prompt'}</button>}</>;
}
export function ChatTextarea(props) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; el.style.height = '0px'; el.style.height = `${Math.min(el.scrollHeight, 300)}px`; }, [props.value]);
  return <textarea {...props} ref={ref} rows={1}/>;
}
export function ActivityAge({busy, events}) {
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => { if (!busy) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [busy]);
  const last = events.at(-1)?.at;
  const seconds = last ? Math.max(0, Math.floor((now - Date.parse(last)) / 1000)) : 0;
  return busy && seconds >= 15 ? <small role="status">Waiting for the next provider update · {seconds}s since last activity</small> : null;
}
