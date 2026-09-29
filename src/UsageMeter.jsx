import React, {useEffect, useId, useRef, useState} from 'react';
import './usage-meter.css';
const number = n => new Intl.NumberFormat(undefined, {notation: 'compact', maximumFractionDigits: 1}).format(n);
export default function UsageMeter({usage, label = 'Provider'}) {
  const [open, setOpen] = useState(false), ref = useRef(null), id = useId();
  useEffect(() => { const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, []);
  const c = usage?.contextUsage;
  const known = typeof c?.tokens === 'number' && Number.isFinite(c.tokens) && c.tokens >= 0 && Number.isFinite(c.contextWindow) && c.contextWindow > 0;
  const percent = known ? Math.min(100, Math.round(c.tokens / c.contextWindow * 100)) : null;
  return <span className="usageMeter" ref={ref} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); ref.current.querySelector('button').focus(); e.stopPropagation(); } }}>
    <button type="button" className="usageMeterButton" aria-label="Context and usage" aria-expanded={open} aria-controls={id} title={known ? `${percent}% context used · Click for account usage` : 'Context and remaining usage'} onClick={() => setOpen(v => !v)}><span className="usageRing" style={{'--usage': `${percent || 0}%`}} aria-hidden="true"/>{known ? `${percent}%` : 'Usage'}</button>
    {open && <span className="usagePopover" id={id} role="region" aria-label="Context and usage details"><strong>{label} · Context &amp; usage</strong><span>{known ? `${number(c.tokens)} / ${number(c.contextWindow)} tokens (${percent}% context used)` : 'Context size not reported by this connection.'}</span>{known && <meter min="0" max="100" value={percent} aria-label="Context used"/>}<span className="usageCaption">Remaining account allowance</span>{usage?.limits?.length ? usage.limits.map((w, i) => <span key={i}>{w.bucket} · {w.minutes ? (w.minutes >= 1440 ? `${number(w.minutes / 1440)}d` : `${number(w.minutes / 60)}h`) : w.window}: <b>{Math.round(w.remaining)}% left</b>{w.resetsAt && <small>Resets {new Date(w.resetsAt * 1000).toLocaleString()}</small>}</span>) : <span>Not reported by this connection. Check your provider account for limits.</span>}<small>{usage?.measuredAt ? `Snapshot: ${new Date(usage.measuredAt).toLocaleString()}. ` : ''}Updates when the provider reports usage during a turn. Account allowance is shared; context is specific to this conversation. Context may decrease after compaction.</small></span>}
  </span>;
}
