import React, {useEffect, useId, useRef, useState} from 'react';
import {MoreVertical} from 'lucide-react';

export const defaultFormatKey = 'axiovela-default-writeup-format';
export function defaultWriteupFormat() {
  try { if (localStorage.getItem(defaultFormatKey) === 'latex') return 'latex'; } catch {}
  return 'markdown';
}

export default function WriteupFormatMenu({value, onChange}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef(null), button = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="writeupFormatMenu" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current.focus(); }
  }}>
    <button ref={button} className="textButton" aria-label="Write-up default format" title={`Default: ${value === 'latex' ? 'LaTeX' : 'Markdown'}`} aria-expanded={open} aria-controls={id} onClick={() => { setError(''); setOpen(!open); }}><MoreVertical size={17}/></button>
    {open && <div id={id} className="writeupFormatOptions"><fieldset><legend>Default write-up format</legend>{[['markdown', 'Markdown'], ['latex', 'LaTeX']].map(([format, label]) => <label key={format}><input type="radio" name={id} value={format} checked={value === format} onChange={() => {
      try { onChange(format); setOpen(false); button.current.focus(); }
      catch { setError('Could not save this preference. Please try again.'); }
    }}/>{label}</label>)}</fieldset><p>For initial experiment write-ups on this device. Existing drafts stay unchanged.</p>{error && <p role="alert">{error}</p>}</div>}
  </div>;
}
