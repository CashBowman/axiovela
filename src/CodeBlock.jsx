import React, {useRef, useState} from 'react';

export default function CodeBlock({children}) {
  const code = useRef(null);
  const [status, setStatus] = useState('Copy');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.current.textContent);
      setStatus('Copied');
    } catch { setStatus('Select to copy'); }
  };
  const language = children?.props?.className?.replace(/^language-/, '') || 'Code';
  return <div className="copyableCode"><div className="codeToolbar"><span>{language}</span><button type="button" onClick={copy} aria-label="Copy code"><span aria-live="polite">{status}</span></button></div><pre ref={code}>{children}</pre></div>;
}
