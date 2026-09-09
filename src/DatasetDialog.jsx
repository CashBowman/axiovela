import React, {useEffect, useRef, useState} from 'react';
import {X} from 'lucide-react';
import DataPicker from './DataPicker.jsx';
import {importData, importSummary} from './data-import.mjs';

function fileSize(bytes) {
  const unit = Math.min(3, Math.floor(Math.log2(Math.max(1, bytes)) / 10));
  return `${(bytes / 1024 ** unit).toLocaleString(undefined, {maximumFractionDigits: 1})} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}

export default function DatasetDialog({apiRequest, datasets, refresh, close}) {
  const dialog = useRef(null);
  const [sourcePath, setSourcePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  useEffect(() => { const previous = document.activeElement; const node = dialog.current; node.showModal(); return () => { node.close(); previous?.focus(); }; }, []);
  const perform = async work => { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (e) { setError(e.message); } finally { try { await refresh(); } catch (e) { setError(e.message); } setBusy(false); } };
  const upload = selection => perform(async () => {
    if (selection.error) throw selection.error;
    const items = await importData(apiRequest, selection, setNotice);
    setNotice(importSummary(items));
  });
  return <dialog className="datasetDialog" ref={dialog} aria-labelledby="dataset-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><header><h2 id="dataset-dialog-title">Link dataset</h2><button onClick={close} disabled={busy} aria-label="Close datasets"><X/></button></header><p>Add data to the active project. Uploads and local imports create independent workspace copies; original files are never modified.</p>
    <div className="datasetUpload"><DataPicker onSelect={upload} disabled={busy}/><small>Any format, including PDF and MP3. No file-size cap; copies use project disk space. Folders keep their structure. Credential paths and symbolic links are excluded.</small></div>
    <details><summary>Import by path</summary><form onSubmit={event => { event.preventDefault(); upload({paths: [sourcePath]}); }}><label>File or folder path<input value={sourcePath} onChange={event => setSourcePath(event.target.value)} placeholder="Absolute path to data" disabled={busy}/></label><button className="lightBtn" disabled={busy || !sourcePath.trim()}>Import copy</button></form></details>
    {busy && <p role="status">Working…</p>}{error && <p role="alert" className="renderError">{error}</p>}{notice && <p role="status">{notice}</p>}
    <h3>Workspace datasets · {datasets.length}</h3>{!datasets.length && <p>No datasets yet. Link data here or ask the assistant to create a synthetic dataset.</p>}
    <div className="datasetList">{datasets.map(item => <article key={item.id}><div><b>{item.name}</b><small>{fileSize(item.bytes)} · {item.kind === 'directory' ? `${item.fileCount} file${item.fileCount === 1 ? '' : 's'}` : item.format}</small><code>{item.path}</code></div><button className="textButton" disabled={busy} onClick={() => perform(async () => setPreview(await apiRequest(`/api/datasets/${item.id}/preview`)))}>Preview</button><button className="textButton" disabled={busy} onClick={() => perform(async () => { await apiRequest(`/api/datasets/${item.id}/remove`, {method: 'POST'}); setPreview(null); setNotice('Removed from the catalog. The workspace copy is preserved in datasets/.'); })}>Unlink</button></article>)}</div>
    {preview && <section><h3>{preview.dataset.name}</h3><p>{preview.note || (preview.truncated ? 'First 64 KB shown; the complete file remains in the workspace.' : 'Complete text preview.')}</p>{preview.text !== null && <pre className="datasetPreview">{preview.text}</pre>}</section>}
  </dialog>;
}
