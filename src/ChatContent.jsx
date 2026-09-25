import {FeedbackContext} from './WorkspaceFeedback.jsx';
import {outputDirectives,sourceForReference} from '../shared/assistant-output.mjs';
import {DocumentReader} from './Library.jsx';
import {downloadSource, exportRenderedPdf} from './document-export.js';
import React, {useContext,useMemo,useState} from 'react';
import MarkdownPreview from './MarkdownPreview.jsx';

export default function ChatContent({source, assetUrl, renderDocument}) {
  const context=useContext(FeedbackContext),formatted=useMemo(()=>outputDirectives(source),[source]);
  const readable=useMemo(()=>formatted.text.replace(/\[Source (\d+)\]\(axiovela-source:(\d+)\)/g,(_,number,index)=>{const p=sourceForReference(formatted.references[Number(index)],context?.sources||[]);return p?'['+p.title.replace(/[\[\]]/g,'')+'](#library-source-'+p.id+')':'[Source '+number+']';}).replace(/\[([^\]]+)\]\(axiovela-followup:\d+\)/g,'$1'),[formatted,context?.sources]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const documents = useMemo(() => { const documents = [...source.matchAll(/```(latex|tex|markdown|md)\s*\n([\s\S]*?)```/gi)].map(match => ({format: /^(latex|tex)$/i.test(match[1]) ? 'latex' : 'markdown', source: match[2]}));
  if (!documents.length && /^\s*\\documentclass/.test(source)) documents.push({format: 'latex', source});
  return documents; }, [source]);
  const render = async (document, pdf = false) => {
    setBusy(true); setError('');
    try { const rendered = await renderDocument(document); setResult(rendered); if (pdf) await exportRenderedPdf(rendered); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="chatContent"><MarkdownPreview copyCode source={readable} assetUrl={assetUrl} onLink={href=>{const p=context?.sources?.find(p=>href===p.sourceUrl||href==="#library-source-"+p.id);if(p){context.openSource(p.id);return true;}return false;}}/>{formatted.followups.map((f,i)=><button className="chatDocumentButton" key={i} onClick={()=>context?.draftFollowup(f.prompt)}>{f.label}</button>)}{documents.map((document, i) => <span key={i}><button className="chatDocumentButton" onClick={() => downloadSource(document.format, document.source)}>Export source</button><button className="chatDocumentButton" disabled={busy} onClick={() => render(document, true)}>Export PDF</button><button className="chatDocumentButton" disabled={busy} onClick={() => render(document)}>{busy ? 'Rendering…' : `Render ${document.format === 'latex' ? 'LaTeX PDF' : 'Markdown document'}${documents.length > 1 ? ` ${i + 1}` : ''}`}</button></span>)}{error && <p role="alert" className="renderError">{error}</p>}{result?.url && <div className="chatDocumentPreview"><a href={result.url} target="_blank" rel="noopener noreferrer">Open rendered document</a>{result.format === 'latex' && <DocumentReader title="Chat LaTeX document" url={result.url}/>}</div>}</div>;
}
