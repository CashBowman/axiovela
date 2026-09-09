import {downloadSource, exportRenderedPdf} from './document-export.js';
import React, {useState} from 'react';
import MarkdownPreview from './MarkdownPreview.jsx';

export default function ChatContent({source, assetUrl, renderDocument}) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const documents = [...source.matchAll(/```(latex|tex|markdown|md)\s*\n([\s\S]*?)```/gi)].map(match => ({format: /^(latex|tex)$/i.test(match[1]) ? 'latex' : 'markdown', source: match[2]}));
  if (!documents.length && /^\s*\\documentclass/.test(source)) documents.push({format: 'latex', source});
  const render = async (document, pdf = false) => {
    setBusy(true); setError('');
    try { const rendered = await renderDocument(document); setResult(rendered); if (pdf) await exportRenderedPdf(rendered); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="chatContent"><MarkdownPreview copyCode source={source} assetUrl={assetUrl}/>{documents.map((document, i) => <span key={i}><button className="chatDocumentButton" onClick={() => downloadSource(document.format, document.source)}>Export source</button><button className="chatDocumentButton" disabled={busy} onClick={() => render(document, true)}>Export PDF</button><button className="chatDocumentButton" disabled={busy} onClick={() => render(document)}>{busy ? 'Rendering…' : `Render ${document.format === 'latex' ? 'LaTeX PDF' : 'Markdown document'}${documents.length > 1 ? ` ${i + 1}` : ''}`}</button></span>)}{error && <p role="alert" className="renderError">{error}</p>}{result?.url && <div className="chatDocumentPreview"><a href={result.url} target="_blank" rel="noopener noreferrer">Open rendered document</a>{result.format === 'latex' && <iframe title="Chat LaTeX document" src={result.url}/>}</div>}</div>;
}
