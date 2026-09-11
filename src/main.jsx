import useParallelAssistant, {conversationKey} from './useParallelAssistant.js';
import {exportRenderedPdf} from './document-export.js';
import {CopyMessage, PromptText, ChatTextarea, ActivityAge} from './ChatMessageTools.jsx';
import WriteupFormatMenu, {defaultWriteupFormat, defaultFormatKey} from './WriteupFormatMenu.jsx';
import AgenticSetupDialog from './AgenticSetupDialog.jsx';
import DataPicker from './DataPicker.jsx';
import {importData, importSummary} from './data-import.mjs';
import {dropLineOffset, insertBlock} from './writeup-insertion.mjs';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import React, {lazy, Suspense, useEffect, useId, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import UpdateNotice from './UpdateNotice.jsx';
import {ArrowUpRight, Check, ChevronDown, CircleHelp, Download, FileText, LayoutPanelTop, Paperclip, Play, Plus, RefreshCcw, Send, Sparkles, Square, X} from 'lucide-react';
import './style.css';
import './research-ui.css';
import ModelPicker from './ModelPicker.jsx';
import FigureGallery from './FigureGallery.jsx';
import {ResearchLeft, ResearchMiddle} from './ResearchPanels.jsx';
import DatasetDialog from './DatasetDialog.jsx';
import useChatScroll from './useChatScroll.js';
import {chatMarkdown, figureTitle} from './research-model.mjs';

const MarkdownPreview = lazy(() => import('./MarkdownPreview.jsx'));
const ChatContent = lazy(() => import('./ChatContent.jsx'));

const tabs = ['Results', 'Methods', 'Trials', 'Write-up'];

const messages0 = [
  ['bot', 'Describe the experiment you want to run or the results you want to understand.'],
];
const agenticWelcome = `${messages0[0][1]} In Agentic mode, I route independent work to up to three Pi workers through Herdr, then review and validate the combined result. This mode uses Full access.`;

const codeSample = `import numpy as np

seeds = np.arange(12)
noise = np.linspace(0.18, 0.42, 12)
guided_error = 0.34 - 0.18 * noise + np.random.default_rng(7).normal(0, 0.008, 12)
baseline_error = 0.39 - 0.10 * noise + np.random.default_rng(11).normal(0, 0.011, 12)

lift = baseline_error - guided_error
print({
    "guided_mean": round(float(guided_error.mean()), 3),
    "baseline_mean": round(float(baseline_error.mean()), 3),
    "wins": int((lift > 0).sum()),
})`;

const visualAssets = [
  {id: 'chart', label: 'Primary error curve', type: 'curve'},
  {id: 'heatmap', label: 'Residual heatmap', type: 'heatmap'},
  {id: 'bars', label: 'Uncertainty bars', type: 'bars'},
  {id: 'scatter', label: 'Seed scatter', type: 'scatter'},
];

const formulaAssets = [
  {label: 'Recovery error', latex: '\\[\\mathcal{E}(\\hat{x}, x)=\\lVert \\hat{x}-x\\rVert_2 / \\lVert x\\rVert_2\\]', description: 'Primary lower-is-better metric.'},
  {label: 'Matched-seed lift', latex: '\\[\\Delta_s = E_{\\text{baseline},s}-E_{\\text{guided},s}\\]', description: 'Per-seed improvement used in diagnostics.'},
  {label: 'High-noise caveat', latex: '\\[\\operatorname{Var}(\\Delta_s\\mid \\sigma=\\sigma_{max})\\text{ remains wide}\\]', description: 'Definition of the uncertainty flag.'},
];

const projectScaffold = {
  root: './ml-theory-workbench-project',
  artifacts: 'artifacts/figures/',
  runs: 'runs/',
  writeups: 'writeups/',
  exports: 'exports/',
};

const layoutStorageKey = 'ml-theory-workbench-layout-v1';
const permissionStorageKey = 'ml-theory-workbench-permission-v1';
const defaultLayout = {
  columnWidths: [37, 33, 30],
  rowSplits: {left: 61, middle: 57, right: 58},
};
const commandPreview = 'node workflows/seed-matched-comparison.mjs --run-id <run-id> --no-network';
const apiBase = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

async function unscopedRequest(path, options = {}) {
  if (options.headers?.['x-axiovela-project']) options = {...options, headers: {...options.headers, 'x-axiovela-project': encodeURIComponent(options.headers['x-axiovela-project'])}};
  const response = await fetch(`${apiBase}${path}`, {...options, headers: {...(options.body instanceof FormData ? {} : {'content-type': 'application/json'}), ...(options.headers || {})}});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Backend request failed (${response.status})`);
    error.code = payload.error?.code || 'request_failed';
    error.details = payload.error?.details || null;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function ensureLatexPackage(source, packageName) {
  if (new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\b${packageName}\\b[^}]*\\}`).test(source)) return source;
  const documentClass = source.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
  if (!documentClass) return source;
  return source.replace(documentClass[0], `${documentClass[0]}\n\\usepackage{${packageName}}`);
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').at(-1) || '');
    reader.onerror = () => reject(new Error('The dropped image could not be read'));
    reader.readAsDataURL(file);
  });
}

function assistantReply(record) {
  if (record.status === 'running') return record.output || '';
  if (record.status === 'complete') return record.output?.trim() || 'Task complete. Project files and dashboard data have been refreshed.';
  if (record.status === 'canceled') return 'Task canceled. No additional work will be started.';
  return `Task failed: ${record.error || record.output || 'the provider did not return a final response'}`;
}

function assistantHistoryMessages(records = []) {
  if (!records.length) return messages0;
  return [messages0[0], ...records.flatMap(record => [
    ['user', record.message, `${record.id}-user`, record.role || 'experiment', record],
    ...((['complete', 'failed', 'canceled'].includes(record.status) || record.output) ? [['bot', assistantReply(record), record.id, record.role || 'experiment', record]] : []),
  ])];
}

const paneHints = {
  'Executive brief': 'Start here: conclusion, confidence, and the next safe action.',
  'Recommended next moves': 'Queue follow-up studies and review project folders before running more work.',
  'Evidence': 'Read the primary metric curve, then open Evidence for supporting diagnostics.',
  'Evidence ledger': 'Use this as the short audit trail behind the conclusion.',
  'Diagnostic summary': 'Scan what the visuals say before adding evidence to a write-up.',
  'Available visuals': 'Drag visuals into the write-up or inspect them in the middle panel.',
  'Evidence visuals': 'Compare diagnostics side by side; drag mini versions from the left rail.',
  'Diagnostics ledger': 'Check uncertainty and outlier flags before broadening claims.',
  'Current experiment': 'Shows why this run exists and what question it answers.',
  'Method guardrails + diagnostics': 'Review controls, inputs, metric, and claim scope.',
  'Runnable method code': 'Edit and run the local method snippet.',
  'Execution output': 'Read local CLI output, tests, and artifact paths produced by real project work.',
  'Run control': 'Start or inspect the current tracked run.',
  'Run metadata': 'Confirms project, run, artifact, write-up, and export locations.',
  'Live progress': 'Watch status updates while the run advances.',
  'Metrics stream': 'Monitor headline metrics while the run is active.',
  'Mini visuals': 'Drag thumbnails directly into the raw write-up editor.',
  'Editor notes': 'Use this as a compact checklist for export and artifact conventions.',
  'Rendered write-up preview': 'Preview generated prose and export from this pane.',
  'Write-up Assistant': 'Send write-up instructions; the assistant writes into the middle editor.',
  'Formula library': 'Drag rendered formulas, theorems, or definitions into the editor.',
  'Project structure': 'Shows where the active research project stores code, runs, artifacts, and writing.',
  'Project setup': 'Versioning, compute, tracking, and isolated execution settings for the active project.',
  'Bibliography': 'Manage the project BibTeX library and insert citations into either source format.',
  'Project code': 'The AI creates and edits reproducible research code in the active directory.',
  'Results and artifacts': 'Figures discovered in the project appear here automatically.',
  'Experiment record': 'Recorded measurements for the selected experiment. Expand exact values for full precision.',
  'Recorded metrics': 'Inspect the latest run metrics exactly as they were written.',
};

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function visualPath(label) {
  return `${projectScaffold.artifacts}${slugify(label)}.svg`;
}

function visualSvg(label) {
  const asset = visualAssets.find(item => item.label === label) || visualAssets[0];
  const title = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (asset.type === 'heatmap') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e7edf2"/><text x="34" y="42" fill="#203040" font-family="Arial" font-size="22" font-weight="700">${title}</text>${Array.from({length: 36}, (_, i) => `<rect x="${44 + (i % 9) * 62}" y="${78 + Math.floor(i / 9) * 52}" width="48" height="38" rx="8" fill="#caa760" opacity="${0.22 + (i % 6) * 0.12}"/>`).join('')}</svg>`;
  }
  if (asset.type === 'bars') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e7edf2"/><text x="34" y="42" fill="#203040" font-family="Arial" font-size="22" font-weight="700">${title}</text>${[420, 310, 500, 260].map((w, i) => `<rect x="80" y="${96 + i * 54}" width="${w}" height="24" rx="12" fill="#4d7898"/><line x1="${72 + w}" y1="${108 + i * 54}" x2="${108 + w}" y2="${108 + i * 54}" stroke="#735c2e" stroke-width="4"/>`).join('')}</svg>`;
  }
  if (asset.type === 'scatter') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e7edf2"/><text x="34" y="42" fill="#203040" font-family="Arial" font-size="22" font-weight="700">${title}</text><line x1="72" y1="302" x2="590" y2="302" stroke="#465b6b" opacity=".35"/><line x1="72" y1="78" x2="72" y2="302" stroke="#465b6b" opacity=".35"/>${Array.from({length: 12}, (_, i) => `<circle cx="${102 + i * 39}" cy="${260 - (i % 5) * 32}" r="9" fill="#4d7898" stroke="#ffffff" stroke-width="3"/>`).join('')}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e7edf2"/><text x="34" y="42" fill="#203040" font-family="Arial" font-size="22" font-weight="700">${title}</text><path d="M50 262 C130 250 178 198 248 206 S384 136 454 118 S564 80 604 86" fill="none" stroke="#4d7898" stroke-width="8" stroke-linecap="round"/><path d="M50 286 C142 266 190 246 250 250 S396 198 456 202 S566 164 604 172" fill="none" stroke="#caa760" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round"/><circle cx="454" cy="118" r="11" fill="#4d7898" stroke="#ffffff" stroke-width="5"/></svg>`;
}

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadStoredLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutStorageKey));
    if (Array.isArray(parsed?.columnWidths) && parsed?.rowSplits) return parsed;
  } catch {
    // Use defaults when localStorage is unavailable or malformed.
  }
  return defaultLayout;
}

function loadPermissionMode() {
  try { const mode = localStorage.getItem(permissionStorageKey); return ['ask', 'auto', 'full'].includes(mode) ? mode : 'auto'; }
  catch { return 'auto'; }
}

function latexTemplate(visuals = []) {
  return `\\documentclass{article}
\\usepackage{graphicx,amsmath,amssymb,natbib}
\\begin{document}
\\title{Research Project}
\\author{}
\\date{}
\\maketitle

\\section{Research Question}
State the research question, estimand, and hypotheses here.

\\subsection{Primary Metric}
Define the primary outcome and uncertainty procedure.

\\subsection{Evidence}
${visuals.map(label => `\\begin{figure}[h]
  \\centering
  \\includegraphics[width=.85\\linewidth]{${visualPath(label)}}
  \\caption{${label} from the project evidence.}
\\end{figure}`).join('\n\n') || '% Experiment figures created by the assistant appear in artifacts/figures/.'}

\\subsection{Conclusion and Limitations}
Summarize findings only after the experiment has produced evidence.

% Cite with \\citet{key} or \\citep{key}; edit references.bib in the Bibliography panel.
\\bibliographystyle{plainnat}
\\bibliography{../references}
\\end{document}`;
}

function markdownTemplate(visuals = []) {
  return `---
title: Research Project
bibliography: ../references.bib
---

# Research Project

## Research Question
State the research question, estimand, hypotheses, and assumptions here.

## Evidence
${visuals.map(label => `![${label}](${visualPath(label)})`).join('\n') || '<!-- Experiment figures created by the assistant appear in artifacts/figures/. -->'}

## Conclusion and Limitations
Summarize findings only after the experiment has produced evidence.

<!-- Cite with [@key]. The preview resolves keys from references.bib. -->`;
}

function citationLabel(entry) {
  const familyNames = (entry?.authors || []).map(author => author.split(',')[0]).filter(Boolean);
  const author = familyNames.length > 2 ? `${familyNames[0]} et al.` : familyNames.join(' & ') || entry?.id || 'Unknown';
  return `${author}, ${entry?.year || 'n.d.'}`;
}

function markdownWithCitations(source, bibliography = []) {
  const entries = new Map(bibliography.map(entry => [entry.id, entry]));
  const cited = new Set();
  const body = source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\[([^\]]*@[A-Za-z0-9_.:+/-]+[^\]]*)\]/g, (match, contents) => {
    const keys = [...contents.matchAll(/@([A-Za-z0-9_.:+/-]+)/g)].map(item => item[1]);
    if (!keys.length) return match;
    return `(${keys.map(key => { cited.add(key); return entries.has(key) ? citationLabel(entries.get(key)) : `?${key}`; }).join('; ')})`;
  });
  if (!cited.size) return body;
  const references = [...cited].map(key => {
    const entry = entries.get(key);
    if (!entry) return `**${key}.** Missing from references.bib.`;
    const authors = entry.authors.length ? entry.authors.join('; ') : 'Unknown author';
    const venue = entry.container ? ` *${entry.container}*.` : '';
    const link = entry.doi ? ` https://doi.org/${entry.doi}` : entry.url ? ` ${entry.url}` : '';
    return `**${key}.** ${authors} (${entry.year || 'n.d.'}). “${entry.title}.”${venue}${link}`;
  });
  return `${body.trim()}\n\n## References\n\n${references.join('\n\n')}`;
}

function markdownAssetUrl(src = '', root = '') {
  const normalized = src.replace(/^\.\.\//, '').replace(/^\.\//, '');
  return /^(artifacts\/figures|exports)\//.test(normalized) ? `${apiBase}/api/artifacts/file?path=${encodeURIComponent(normalized)}&workspace=${encodeURIComponent(root)}` : src;
}

function Pill({children, tone = 'blue'}) {
  return <span className={'pill ' + tone}>{children}</span>;
}

function Pane({title, children, tag, action}) {
  return <section className="pane"><header className="paneHead"><div>{tag && <Pill tone={tag.tone}>{tag.label}</Pill>}<strong>{title}</strong></div>{action}</header>{paneHints[title] && <p className="paneHint paneIntro">{paneHints[title]}</p>}{children}</section>;
}

function Chart() {
  return <div className="chart"><div className="yLabels"><span>.42</span><span>.30</span><span>.18</span></div><svg viewBox="0 0 500 190" preserveAspectRatio="none" aria-label="Error comparison by noise"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#4d7898" stopOpacity=".2"/><stop offset="1" stopColor="#4d7898" stopOpacity="0"/></linearGradient></defs><path className="area" d="M14 139 C71 135 82 115 137 121 S209 82 263 94 S343 43 400 55 S453 30 490 33 L490 165 L14 165Z"/><path className="curve baseline" d="M14 148 C67 140 93 129 137 132 S212 108 263 112 S350 82 400 86 S456 65 490 70"/><path className="curve guided" d="M14 139 C71 135 82 115 137 121 S209 82 263 94 S343 43 400 55 S453 30 490 33"/><circle cx="400" cy="55" r="5" className="dot"/></svg><div className="legend"><span><i className="blueLine"/> Guided sampler</span><span><i className="greyLine"/> Baseline</span></div><span className="axis">noise →</span></div>;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function flattenChildren(children) {
  return React.Children.toArray(children).flatMap(child => child?.type === React.Fragment ? flattenChildren(child.props.children) : [child]);
}

function ResizeColumn({children, className = '', split = 60, onSplitChange}) {
  const ref = useRef(null);
  const panes = flattenChildren(children);

  const startRowResize = event => {
    if (panes.length < 2 || !ref.current) return;
    event.preventDefault();
    const startY = event.clientY;
    const startSplit = split;
    const height = ref.current.getBoundingClientRect().height;
    const move = moveEvent => onSplitChange(clamp(startSplit + ((moveEvent.clientY - startY) / height) * 100, 18, 86));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, {once: true});
  };

  if (panes.length < 2) {
    return <div ref={ref} className={`${className} singlePaneColumn`}>{panes}</div>;
  }

  return <div ref={ref} className={`${className} resizableColumn`} style={{gridTemplateRows: `${split}fr 8px ${100 - split}fr`}}>{panes[0]}<button className="rowResizeHandle" onPointerDown={startRowResize} onKeyDown={event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); onSplitChange(clamp(split + (event.key === 'ArrowDown' ? 4 : -4), 18, 86)); } }} aria-label="Resize adjacent panels vertically" title="Drag to resize adjacent panels"/>{panes[1]}</div>;
}

function ResultsLeft({setTab, setNewStudy}) {
  return <>
    <Pane title="Executive brief" tag={{label: 'CONCLUSION', tone: 'green'}}><div className="brief"><p className="eyebrow">ANSWER TO THE HYPOTHESIS</p><h1>Guided sampling improves recovery under noise.</h1><p className="summary">The improvement is reliable enough to advance, but not broad enough to generalize beyond the tested geometry and noise range.</p><div className="stats"><div><small>DECISION</small><b>Run robustness check</b></div><div><small>CONFIDENCE</small><b>Moderate</b></div></div><div className="warning"><CircleHelp size={16}/><span><b>Caveat:</b> one high-noise setting has a wide uncertainty interval.</span></div><button className="evidenceLink" onClick={() => setTab('Evidence')}>See supporting evidence <ArrowUpRight size={15}/></button></div></Pane>
    <Pane title="Recommended next moves"><div className="moves"><div><i/><b>Replicate across seeds</b><p>Reduce uncertainty at the high-noise boundary.</p></div><div><i/><b>Ablate guidance strength</b><p>Identify whether the gain is stable or tuned.</p></div><ProjectStructure/><button className="textButton" onClick={() => setNewStudy(true)}>Propose a follow-up <Plus size={14}/></button></div></Pane>
  </>;
}

function ResultsMiddle() {
  return <>
    <Pane title="Evidence" tag={{label: 'PRIMARY COMPARISON', tone: 'blue'}}><Chart/><div className="reading"><b>Reading:</b> the guided method has lower error across the tested range. The gap grows as noise increases.</div><div className="chartFoot"><span>12 matched evaluations</span><span>Metric: recovery error ↓</span></div></Pane>
    <Pane title="Evidence ledger"><div className="ledger"><div><span className="ledgerIcon good"><Check size={15}/></span><section><b>Baseline comparison</b><p>Guided sampler wins 10 / 12 matched evaluations.</p></section></div><div><span className="ledgerIcon good"><Check size={15}/></span><section><b>Reliability</b><p>No constraint violations. One uncertainty flag remains.</p></section></div><div><span className="ledgerIcon neutral"><FileText size={14}/></span><section><b>Scope</b><p>Supported only for the active data, geometry, and stated noise interval.</p></section></div></div></Pane>
  </>;
}

function MiniVisual({asset, compact = false}) {
  return <div className={'miniVisual ' + asset.type + (compact ? ' compact' : '')} draggable onDragStart={event => event.dataTransfer.setData('text/plain', asset.label)}>
    {asset.type === 'curve' && <svg viewBox="0 0 110 55"><path d="M7 39 C22 37 31 29 42 30 S64 20 77 18 S94 10 104 12"/><circle cx="77" cy="18" r="3"/></svg>}
    {asset.type === 'heatmap' && <div className="heatCells miniHeat">{Array.from({length: 18}, (_, i) => <span key={i} style={{opacity: 0.25 + (i % 6) * 0.12}}/> )}</div>}
    {asset.type === 'bars' && <div className="barStack miniBars"><span style={{width: '58%'}}/><span style={{width: '42%'}}/><span style={{width: '71%'}}/><span style={{width: '35%'}}/></div>}
    {asset.type === 'scatter' && <div className="scatterPlot miniScatter">{Array.from({length: 10}, (_, i) => <i key={i} style={{left: `${8 + i * 8}%`, bottom: `${18 + (i % 5) * 12}%`}}/> )}</div>}
    <b>{asset.label}</b>
    <span>{compact ? 'Drag into editor' : 'Dashboard visual'}</span>
  </div>;
}

function ProjectStructure({root = projectScaffold.root}) {
  return <div className="projectPaths">{Object.entries({...projectScaffold, root}).map(([key, value]) => <div key={key}><small>{key}</small><code>{value}</code></div>)}</div>;
}

function EmptyResearchPane({title, children}) {
  return <Pane title={title}><div className="emptyResearch"><Sparkles size={18}/><p>{children}</p></div></Pane>;
}

function ArtifactGallery({artifacts = []}) {
  if (!artifacts.length) return <div className="emptyResearch"><FileText size={18}/><p>No artifacts yet. Ask the chatbot to design and run an experiment; figures placed in <code>artifacts/figures/</code> load here automatically.</p></div>;
  return <div className="artifactGallery">{artifacts.map(artifact => artifact.type === 'pdf' ? <a key={artifact.path} href={`${apiBase}/api/artifacts/file?path=${encodeURIComponent(artifact.path)}`} target="_blank" rel="noreferrer"><FileText size={22}/><b>{artifact.name}</b><span>Open PDF</span></a> : <figure key={artifact.path}><img src={`${apiBase}/api/artifacts/file?path=${encodeURIComponent(artifact.path)}`} alt={artifact.name}/><figcaption>{artifact.name}</figcaption></figure>)}</div>;
}

function InfrastructureSummary({infrastructure, openSettings}) {
  const config = infrastructure?.config;
  const git = infrastructure?.collaboration;
  const enabledAdapters = (config?.experimentTracking?.adapters || []).filter(adapter => adapter.enabled !== false);
  const isolation = infrastructure?.isolation;
  return <div className="infrastructureSummary">
    <div className="infraRow"><span><b>Versioning</b><small>{git?.available ? `${git.branch || 'detached'} · ${git.clean ? 'clean' : `${git.changes} changed file${git.changes === 1 ? '' : 's'}`}` : 'This project has not initialized Git yet'}</small></span><Pill tone={git?.available ? 'green' : 'blue'}>{git?.available ? 'GIT' : 'LOCAL'}</Pill></div>
    <div className="infraRow"><span><b>Compute</b><small>{(config?.computeProfiles || []).map(profile => `${profile.label || profile.id} (${profile.type})`).join(' · ') || 'Configure after selecting a project'}</small></span></div>
    <div className="infraRow"><span><b>Tracking</b><small>{enabledAdapters.length ? enabledAdapters.map(adapter => `${adapter.type} · ${infrastructure?.discovered?.[adapter.type] || 0} run${infrastructure?.discovered?.[adapter.type] === 1 ? '' : 's'}`).join(' · ') : 'No experiment tracker enabled'}</small></span></div>
    {config?.security?.adversarialExecution && <div className="infraRow"><span><b>Isolated commands</b><small>{isolation?.available ? `${isolation.runtime} ready · no network · read-only root` : 'Install Podman or Docker to run untrusted candidate commands'}</small></span><Pill tone={isolation?.available ? 'green' : 'blue'}>{isolation?.available ? 'READY' : 'SETUP'}</Pill></div>}
    <button className="lightBtn" onClick={openSettings} disabled={!config}>Configure project</button>
  </div>;
}

function FileInventory({files = []}) {
  if (!files.length) return <div className="emptyResearch"><p>No research code yet. Ask the chatbot to create the study, dependencies, tests, and experiment entrypoints.</p></div>;
  return <div className="fileInventory">{files.slice(0, 40).map(file => <code key={file}>{file}</code>)}</div>;
}

function scratchLeftPanes({tab, project, openInfrastructure}) {
  const selected = Boolean(project?.root);
  const question = project?.manifest?.researchQuestion?.trim();
  if (tab === 'Methods') return <><EmptyResearchPane title="Research question">{question || (selected ? 'Describe the estimand, hypothesis, data, baselines, and constraints in the chatbot. The project manifest will update as the AI develops the study.' : 'Choose a project, or ask the chatbot to create one in a specific directory. Then describe the research question and constraints.')}</EmptyResearchPane><Pane title="Project setup"><InfrastructureSummary infrastructure={project?.infrastructure} openSettings={openInfrastructure}/></Pane></>;
  if (tab === 'Evidence') return <><EmptyResearchPane title="Evidence summary">{project?.artifacts?.length ? `${project.artifacts.length} artifact${project.artifacts.length === 1 ? '' : 's'} discovered. Inspect the recorded metrics and figures before asking the assistant to draft a claim.` : 'Completed experiment evidence will be summarized here without claims being invented before results exist.'}</EmptyResearchPane><EmptyResearchPane title="Artifact inventory">Figures and result artifacts are discovered automatically from the active project.</EmptyResearchPane></>;
  return <><EmptyResearchPane title="Project overview">{!selected ? 'No project is open. Select Project to open any directory, or tell the chatbot where to create a new research project.' : project?.hasResults ? `${project.runs?.length || 0} recorded run${project.runs?.length === 1 ? '' : 's'} and ${project.artifacts?.length || 0} visible artifact${project.artifacts?.length === 1 ? '' : 's'} are available in ${project.name}.` : `${project.name} is ready for research from scratch. State a question in the chatbot and ask it to write the code, run the experiment, and save reproducible evidence.`}</EmptyResearchPane><EmptyResearchPane title="Recommended next moves">{project?.hasResults ? 'Ask the assistant to interpret the recorded evidence, test robustness, or draft a carefully scoped write-up.' : selected ? (question ? `Develop and test the current question: ${question}` : 'Define the research question, data, estimand, baselines, and success criteria before running the first experiment.') : 'Create or open a project. The workbench remembers the last project you intentionally selected.'}</EmptyResearchPane></>;
}

function scratchMiddlePanes({tab, project}) {
  const latest = project?.runs?.[0];
  if (tab === 'Methods') return <><Pane title="Project code"><FileInventory files={project?.files}/></Pane><EmptyResearchPane title="Execution output">{latest ? `${latest.id} is ${latest.status}. Open Trials for its durable progress, metrics, logs, and artifacts.` : 'Concise coding and test activity appears in chat while work is running. Experiment logs and metrics appear on Trials after a run record is created.'}</EmptyResearchPane></>;
  return <><Pane title={tab === 'Evidence' ? 'Evidence visuals' : 'Results and artifacts'}><ArtifactGallery artifacts={project?.artifacts}/></Pane><Pane title={tab === 'Evidence' ? 'Recorded metrics' : 'Experiment record'}><div className="metricsJson">{project?.latestMetrics ? <pre>{JSON.stringify(project.latestMetrics, null, 2)}</pre> : <div className="emptyResearch"><p>No metrics have been recorded. Save run metrics as <code>runs/&lt;run-id&gt;/metrics.json</code>.</p></div>}</div></Pane></>;
}

function EvidenceLeft({setTab}) {
  return <>
    <Pane title="Diagnostic summary" tag={{label: 'INTERPRETATION', tone: 'green'}}><div className="brief compactBrief"><p className="eyebrow">VISUAL DIAGNOSTICS</p><h1>Signal is strongest at higher noise.</h1><p className="summary">Diagnostics emphasize the same conclusion from several angles: matched seeds, uncertainty, residual shape, and run-to-run stability.</p><div className="stats"><div><small>WINS</small><b>10 / 12</b></div><div><small>MAX GAP</small><b>0.11 error</b></div></div><button className="evidenceLink" onClick={() => setTab('Write-up')}>Open write-up editor <ArrowUpRight size={15}/></button></div></Pane>
    <Pane title="Available visuals"><div className="assetList">{visualAssets.map(asset => <MiniVisual asset={asset} key={asset.id}/>)}</div></Pane>
  </>;
}

function EvidenceMiddle() {
  return <>
    <Pane title="Evidence visuals" tag={{label: 'DIAGNOSTICS', tone: 'blue'}}><div className="diagnostics"><Chart/><div className="visualGrid"><div className="visualCard heatmap"><b>Residual heatmap</b><div className="heatCells">{Array.from({length: 24}, (_, i) => <span key={i} style={{opacity: 0.25 + (i % 6) * 0.12}}/> )}</div><p>Residuals remain structured but shrink under guidance.</p></div><div className="visualCard"><b>Uncertainty interval</b><div className="barStack"><span style={{width: '58%'}}/><span style={{width: '42%'}}/><span style={{width: '71%'}}/><span style={{width: '35%'}}/></div><p>One high-noise interval needs replication.</p></div><div className="visualCard scatter"><b>Seed consistency</b><div className="scatterPlot">{Array.from({length: 12}, (_, i) => <i key={i} style={{left: `${8 + i * 7}%`, bottom: `${20 + (i % 5) * 12}%`}}/> )}</div><p>Matched seeds mostly favor the guided run.</p></div></div></div></Pane>
    <Pane title="Diagnostics ledger"><div className="ledger"><div><span className="ledgerIcon good"><Check size={15}/></span><section><b>Noise sweep</b><p>Improvement grows from low to high noise settings.</p></section></div><div><span className="ledgerIcon neutral"><FileText size={14}/></span><section><b>Outlier review</b><p>Seed 09 is responsible for most uncertainty width.</p></section></div></div></Pane>
  </>;
}

function MethodsLeft() {
  return <>
    <Pane title="Current experiment" tag={{label: 'WHY THIS RAN', tone: 'green'}}><div className="brief compactBrief"><p className="eyebrow">ACTIVE STUDY</p><h1>Guided sampler robustness check</h1><p className="summary">This run tests whether the recovery-error gain remains stable under the active noise sweep before making a broader claim.</p><div className="stats"><div><small>QUESTION</small><b>Does guidance hold?</b></div><div><small>TRIGGER</small><b>High-noise caveat</b></div></div></div></Pane>
    <Pane title="Method guardrails + diagnostics"><div className="visualGrid methodCards"><div className="visualCard"><b>Matched seeds</b><p>Both samplers use identical geometry, compute budget, and initialization.</p></div><div className="visualCard"><b>Inputs</b><p>12 seeds · 12 noise settings · 2 sampler variants.</p></div><div className="visualCard"><b>Primary metric</b><p>Recovery error, lower is better.</p></div><div className="visualCard"><b>Scope control</b><p>Claims stay inside the active data and stated noise interval.</p></div></div></Pane>
  </>;
}

function MethodsMiddle({code, setCode, runCode, output, runnerStatus, runnerApproved, approveRunner, cancelRunner, runnerLogs, backendOnline}) {
  return <>
    <Pane title="Runnable method code" tag={{label: runnerStatus.toUpperCase(), tone: runnerApproved ? 'green' : 'blue'}}><div className="methodPanel"><p className="eyebrow">SAFE LOCAL BACKEND RUNNER</p><h2>Seed-matched comparison</h2><p>Edit the research note, review the fixed allowlisted command, approve it, then start a real local backend job. The backend never runs arbitrary browser text.</p><div className="commandPreview"><small>COMMAND PREVIEW</small><code>{commandPreview}</code></div><textarea aria-label="Editable method code" value={code} onChange={event => setCode(event.target.value)} spellCheck="false"/><div className="runControls"><button className="lightBtn" onClick={approveRunner}><Check size={15}/> {runnerApproved ? 'Approved' : 'Approve command'}</button><button className="newBtn" onClick={runCode} disabled={!runnerApproved || runnerStatus === 'running'}><Play size={15}/> Start runner</button><button className="lightBtn" onClick={cancelRunner} disabled={runnerStatus !== 'running'}><Square size={14}/> Cancel</button></div></div></Pane>
    <Pane title="Execution output" tag={{label: 'SAFE RUNNER LOGS', tone: 'green'}}><div className="outputPanel"><pre>{output}</pre><div className="runLogList">{runnerLogs.map((line, index) => <p key={index}>{line}</p>)}</div><div className="chartFoot"><span>Status: {runnerStatus}</span><span>{backendOnline ? 'Local backend connected; logs are polled from the run record' : 'Backend offline; start npm run backend for real execution'}</span></div></div></Pane>
  </>;
}

function BibliographyPane({bibliography, format, editBibliography, insertCitation}) {
  return <Pane title="Bibliography" tag={{label: 'REFERENCES.BIB', tone: 'blue'}}><div className="bibliographyPane"><div className="bibliographyTools"><span>{bibliography?.entries?.length || 0} reference{bibliography?.entries?.length === 1 ? '' : 's'}</span><button className="textButton" onClick={editBibliography}>Edit BibTeX</button></div>{bibliography?.error && <p className="renderError">{bibliography.error}</p>}{bibliography?.entries?.length ? <div className="citationList">{bibliography.entries.map(entry => <div className="citationCard" key={entry.id}><b>{entry.title}</b><span>{citationLabel(entry)}</span><code>@{entry.id}</code><button className="textButton" onClick={() => insertCitation(entry.id)}>Insert {format === 'latex' ? `\\citep{${entry.id}}` : `[@${entry.id}]`}</button></div>)}</div> : <div className="emptyResearch compactEmpty"><p>No references yet. Paste BibTeX here or ask the assistant to add verified sources to <code>references.bib</code>.</p><button className="lightBtn" onClick={editBibliography}>Open bibliography</button></div>}</div></Pane>;
}

function WriteupAssetsPane({projectRoot, artifacts = [], runs = [], bibliography, editBibliography, insertArtifact, projectActive}) {
  return <Pane title="Project figures" tag={{label: 'AUTO-DISCOVERED', tone: 'blue'}}><div className="writeupAssetPanel"><div className="writeupAssetTools"><span>Enlarge to inspect. Insert or drag into the source editor.</span></div><FigureGallery projectRoot={projectRoot} runs={runs} artifacts={artifacts.filter(item => item.type !== 'pdf')} apiBase={apiBase} insertArtifact={insertArtifact}/></div></Pane>;
}

function RenderedWriteup({format, exportWriteup, exportPdf, pdfBusy, draftText, compileResult, compileLatex, bibliography, projectActive, projectRoot}) {
  const renderedMarkdown = markdownWithCitations(draftText, bibliography?.entries || []);
  const empty = !draftText.trim();
  return <article className="renderedWriteup"><div className="previewToolbar"><p className="eyebrow">{format === 'latex' ? 'PDF DOCUMENT PREVIEW' : 'MARKDOWN PREVIEW'}</p><span className="previewButtons">{format === 'latex' && <button className="newBtn" onClick={compileLatex} disabled={!projectActive || empty || compileResult?.status === 'running'}>{compileResult?.status === 'running' ? 'Rendering…' : 'Render document'}</button>}<button className="lightBtn" onClick={exportWriteup} disabled={!projectActive || empty}><Download size={15}/> Export source</button><button className="lightBtn" onClick={exportPdf} disabled={!projectActive || empty || pdfBusy}>{pdfBusy ? 'Exporting…' : 'Export PDF'}</button></span></div>{compileResult?.error ? <div className="compileError"><b>Document could not be rendered</b><p>{compileResult.error}</p>{compileResult.details?.hint && <p>{compileResult.details.hint}</p>}{compileResult.details?.log && <code>{compileResult.details.log}</code>}</div> : format === 'latex' ? compileResult?.url ? <iframe className="pdfPreview" title="Compiled LaTeX document" src={`${apiBase}${compileResult.url}#toolbar=0`}/> : <div className="emptyResearch"><FileText size={20}/><p>{projectActive ? (empty ? 'No document yet. Write here or ask the Research Assistant to create a complete LaTeX paper, then select Render document.' : 'Select Render document to compile the complete LaTeX source with Tectonic.') : 'Choose or create a project to start a LaTeX or Markdown document.'}</p></div> : empty ? <div className="emptyResearch"><FileText size={20}/><p>{projectActive ? 'No Markdown document yet. Write here or ask the Research Assistant to create one.' : 'Choose or create a project to start a document.'}</p></div> : <Suspense fallback={<div className="markdownPreview"/>}><MarkdownPreview source={renderedMarkdown} assetUrl={src => markdownAssetUrl(src, projectRoot)}/></Suspense>}</article>;
}

function EditorNotes({format}) {
  return <div className="ledger"><div><span className="ledgerIcon good"><Check size={15}/></span><section><b>Full document rendering</b><p>Edit the complete source, then render it to PDF with the local Tectonic engine.</p></section></div><div><span className="ledgerIcon neutral"><FileText size={14}/></span><section><b>Export path</b><p>Saves {format === 'latex' ? `${projectScaffold.writeups}research-writeup.tex` : `${projectScaffold.writeups}research-writeup.md`}; generated figures remain in {projectScaffold.artifacts}.</p></section></div><div><span className="ledgerIcon neutral"><FileText size={14}/></span><section><b>AI editing</b><p>Ask the Research Assistant to revise the source, add citations, or incorporate recorded artifacts.</p></section></div></div>;
}

function WriteupEditorPane({editBibliography, initialFormat, setInitialFormat, drafts, editorRef, format, setFormat, draftText, setDraftText, handleWriteupDrop, projectActive, uploadStatus, saveSource, sourceStatus, sourceSaving, reloadDisk, sourceConflict}) {
  return <section className="pane writeupFullPane"><header className="paneHead writeupEditorHead"><div><Pill tone="blue">{format === 'latex' ? 'LATEX SOURCE' : 'MARKDOWN SOURCE'}</Pill><strong>Write-up</strong></div><button className="textButton" onClick={saveSource} disabled={!projectActive || sourceSaving}>{sourceSaving ? 'Saving…' : 'Save source'}</button>{sourceConflict && <button className="textButton" onClick={reloadDisk}>Reload disk source</button>}<div className="formatToggle" aria-label="Write-up format">{[['markdown', 'Markdown'], ['latex', 'LaTeX']].map(([key, label]) => { const hasContent = drafts[key]; return <button key={key} aria-label={label} aria-description={hasContent ? 'Contains a draft' : 'Empty'} aria-pressed={format === key} title={`${label}: ${hasContent ? 'contains a draft' : 'empty'}`} className={format === key ? 'selected' : ''} onClick={() => setFormat(key)}>{label}<small className={'draftIndicator' + (hasContent ? ' hasDraft' : '')}>{hasContent ? 'Draft' : 'Empty'}</small></button>; })}</div><button className="textButton" title="Edit references.bib" onClick={editBibliography} disabled={!projectActive}>Bibliography</button><WriteupFormatMenu value={initialFormat} onChange={setInitialFormat}/></header><p className="paneHint paneIntro">{sourceStatus || uploadStatus || (projectActive ? 'Write the complete paper here, ask the assistant to revise it, or drop an image on the source line where it belongs. Insert uses the cursor position.' : 'Choose or create a project. The source stays blank until you begin writing.')}</p><div className="writeupEditor"><textarea ref={editorRef} aria-label="Write-up source" value={draftText} onChange={event => setDraftText(event.target.value)} onDragOver={event => { event.preventDefault(); const editor = event.currentTarget; const scroll = editor.scrollTop; const at = dropLineOffset(editor, event.clientY); editor.focus({preventScroll: true}); editor.setSelectionRange(at, at); editor.scrollTop = scroll; }} onDrop={handleWriteupDrop} placeholder={projectActive ? `Start a ${format === 'latex' ? 'LaTeX' : 'Markdown'} paper, or ask the Research Assistant to draft it…` : 'Choose a project to begin…'} disabled={!projectActive} spellCheck="false"/></div></section>;
}

function WriteupPreviewPane(props) {
  return <Pane title="Rendered write-up preview"><RenderedWriteup {...props}/></Pane>;
}

function WriteupAssistantPane({format, prompt, setPrompt, generateWriteup}) {
  return <Pane title="Write-up Assistant" tag={{label: 'WRITE-UP ASSISTANT', tone: 'purple'}}><div className="ai"><div className="context"><span className="online"/><div><b>Write-up context</b><p>{format === 'latex' ? 'LaTeX' : 'Markdown'} draft · generate only when prompted</p></div></div><label className="mode">Write-up mode<select><option>Math/statistics paper style</option><option>Concise methods summary</option><option>Extended research note</option></select></label><div className="chat"><div className="message ai"><Sparkles size={14}/><span>Tell me what the write-up should emphasize. I will draft into the middle editor only when you send a prompt.</span></div><div className="message user"><span>Use selected diagnostics and keep claims scoped.</span></div><div className="message ai"><Sparkles size={14}/><span>Ready. Drag formulas or visuals into the editor first if they should be included.</span></div></div><div className="composer"><input value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => event.key === 'Enter' && generateWriteup()} placeholder="Prompt the write-up assistant…"/><button onClick={generateWriteup} aria-label="Send write-up prompt"><Send size={16}/></button></div><p className="fine">Future LLM prompt work should tune this role for mathematical statistics and research-paper writing style.</p></div></Pane>;
}

function FormulaLibraryPane() {
  return <Pane title="Formula library" tag={{label: 'DRAG FORMULAS', tone: 'blue'}}><div className="formulaLibrary"><p className="paneHint">Drag rendered formulas, theorems, or definitions into the write-up editor.</p>{formulaAssets.map(item => <div className="formulaCard" draggable key={item.label} onDragStart={event => event.dataTransfer.setData('application/x-workbench-snippet', item.latex)}><b>{item.label}</b><div className="formulaRendered">{item.latex.replace(/\\\[|\\\]/g, '')}</div><span>{item.description}</span></div>)}</div></Pane>;
}

const compactCount = value => Number(value || 0) >= 1000 ? `${(Number(value) / 1000).toFixed(Number(value) >= 100000 ? 0 : 1)}k` : String(Number(value || 0));
const workerLabel = name => String(name || 'Pi worker').replace(/^mf_[a-z0-9]+_/, '').replace(/[_-]+/g, ' ').replace(/^./, character => character.toUpperCase());
const agentStatusLabel = status => ({working: 'working', idle: 'ready', done: 'done', blocked: 'needs input', failed: 'failed', unknown: 'checking'})[status] || 'checking';

function AgentRoster({activity}) {
  const workers = activity?.workers || [];
  return <div className="agentRoster" aria-label="Agent activity"><span className="agentChip"><i className="agentDot working"/><b>Pi router</b><small>working</small></span>{workers.map(worker => <span className="agentChip" key={worker.name} title={`${worker.name}: ${agentStatusLabel(worker.status)}`}><i className={`agentDot ${worker.status}`}/><b>{workerLabel(worker.name)}</b><small>{agentStatusLabel(worker.status)}</small></span>)}{activity?.checkedAt && workers.length === 0 && <span className="routerOnly">No workers yet</span>}</div>;
}

function ChatbotPane({title = 'Experiment Chatbot', messages, input, setInput, send, attach, dropAttachment, attachmentName, clearAttachment, busy, attachmentBusy, assistantProgress, assistantEvents = [], lastActivityAt, statusError, agenticActivity, permissionMode, setPermissionMode, cancelAssistant, modelControl, conversationControl, engineName, renderDocument, supportedModes, projectRoot, ready, agenticMode = false, setAgenticMode, agentic, agenticStarting}) {
  const accessHelpId = useId();
  const [accessHelpOpen, setAccessHelpOpen] = useState(false);
  const accessHelp = 'Access applies to the next message. Read-only does not show approval dialogs; native integrations retain their own tool policies. Full access can change files, install packages, and run commands with your account’s permissions.' + (agenticMode ? ' Agentic mode uses Pi with Full access.' : engineName === 'Pi' ? ' Pi supports Read-only and Full access; Auto-approve is unavailable.' : '');
  const welcome = title === 'Research Assistant' ? 'I can help outline and revise your paper, explain recorded results, place figures, manage citations, and prepare Markdown or LaTeX.' : agenticMode ? agenticWelcome : messages0[0][1];
  const scroll = useChatScroll(messages, projectRoot + title);
  const activityTrail = assistantEvents.reduce((labels, event) => event?.label && labels.at(-1) !== event.label ? [...labels, event.label] : labels, []).filter(label => label !== assistantProgress).slice(-2);
  const agenticAction = setAgenticMode && <div className={`agenticHeaderControl ${agenticMode ? 'enabled' : ''}`} title={agenticStarting ? 'Checking Pi and starting Herdr…' : 'Enable Pi workers with Herdr. Missing tools open setup instructions.'}><span><b>{agenticStarting ? 'Starting…' : 'Agentic mode'}</b></span><label className="switch"><input type="checkbox" aria-label="Agentic mode" checked={agenticMode} onChange={event => setAgenticMode(event.target.checked)} disabled={busy || agenticStarting || !projectRoot}/><span aria-hidden="true"/></label></div>;
  return <Pane title={title} tag={{label: engineName, tone: 'purple'}} action={agenticAction}><div className="ai cleanChat">
    {conversationControl}
    <div ref={scroll.viewport} onScroll={scroll.onScroll} className="chat" aria-label="Conversation"><div ref={scroll.content} className="chatMessages">
      {messages.map(([who, text, id, role, record], i) => <div key={id || i} className={'message ' + (who === 'bot' ? 'ai' : who)}><div className="messageBody">
        {who === 'bot' ? <Suspense fallback={<span>{!id ? welcome : text}</span>}><ChatContent source={chatMarkdown(!id ? welcome : text, projectRoot)} assetUrl={src => /^(?:\.\.?\/)?(?:artifacts\/figures|exports)\//.test(src) ? markdownAssetUrl(src, projectRoot) : ''} renderDocument={renderDocument}/></Suspense> : <PromptText text={text}/>}
        {id && <CopyMessage text={text}/>}
        {who === 'bot' && record?.effective && <details className="chatRunDetails"><summary>{record.agenticMode ? 'Agentic run' : 'Model used'}</summary><p>{record.agenticMode ? 'Pi router' : record.selection?.adapterId} · {record.effective.modelId || 'Not reported'} · {record.effective.effort || 'Runtime default'}</p>{record.agenticMode && <p>{record.agenticActivity?.workers?.length ? `Herdr workers: ${record.agenticActivity.workers.map(worker => `${workerLabel(worker.name)} (${agentStatusLabel(worker.status)})`).join(', ')}.` : record.agenticActivity?.checkedAt ? 'Router only; no Herdr workers were launched for this task.' : 'Worker activity was not recorded for this earlier run.'}</p>}{record.usage?.tokens && <p>{record.agenticMode ? 'Router usage' : 'Usage'}: {compactCount(record.usage.tokens.input + record.usage.tokens.output)} input/output · {compactCount(record.usage.tokens.cacheRead)} cached{record.usage.cost ? ` · $${record.usage.cost.toFixed(3)}` : ''}.</p>}{record.handoff && <p>Recent conversation context restored.</p>}</details>}
        {who === 'user' && record?.artifactPath && <small className="attachedFigureLabel">Attached figure: {record.artifactPath}</small>}
      </div></div>)}
      {attachmentBusy && <p role="status">Importing data into the project…</p>}
      {busy && !attachmentBusy && <div className="assistantActivity"><div className="activityHead"><span className="activityPulse"/><b>{assistantProgress || 'Working in the active project'}</b><button className="stopTask" onClick={cancelAssistant}><Square size={11}/> Stop task</button></div><ActivityAge busy={busy} events={assistantEvents} lastActivityAt={lastActivityAt} statusError={statusError} agenticActivity={agenticActivity}/>{activityTrail.length > 0 && <div className="activityTrail" aria-label="Recent task updates">{activityTrail.map(label => <span key={label}><i/>{label}</span>)}</div>}{agenticMode && <AgentRoster activity={agenticActivity}/>}</div>}
    </div></div>
    {scroll.showLatest && <button className="jumpLatest" onClick={scroll.jump}>Jump to latest ↓</button>}
    {attachmentName && <div className="attachmentChip"><Paperclip size={13}/><span>{attachmentName}</span><button onClick={clearAttachment} aria-label="Remove attachment"><X size={13}/></button></div>}
    <div className="composer chatDropTarget" onDragOver={event => { if (event.dataTransfer.types.includes('application/x-workbench-artifact') || event.dataTransfer.files.length) event.preventDefault(); }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); if (!busy && projectRoot) { const directory = [...event.dataTransfer.items].some(item => item.webkitGetAsEntry?.()?.isDirectory); attach(directory ? {error: new Error('Use Attach folder to import a directory with its contents.')} : {files: [...event.dataTransfer.files]}); } return; } if (!event.dataTransfer.types.includes('application/x-workbench-artifact')) return; event.preventDefault(); if (!busy) dropAttachment(event.dataTransfer.getData('application/x-workbench-artifact')); }}>
      <ChatTextarea aria-label={`${title} message`} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder={busy ? 'Write a follow-up to queue…' : title === 'Research Assistant' ? 'Ask for a draft, revision, citation, or figure…' : 'Ask about this project or drop a figure…'} disabled={attachmentBusy}/>
      <DataPicker compact onSelect={attach} disabled={busy || !projectRoot}/>
      <button onClick={() => send()} aria-label={busy ? "Queue message" : "Send"} title={busy ? "Send after the current task finishes" : "Send message"} disabled={!ready || attachmentBusy || !input.trim() || !supportedModes.includes(permissionMode)}><Send size={16}/></button>
    </div>
    <div className="chatFooter"><div className="modelControl">{modelControl}</div><div className="chatToolbar"><label>Access<select value={permissionMode} onChange={event => setPermissionMode(event.target.value)} disabled={busy || agenticMode}>
      <option value="ask" disabled={!supportedModes.includes('ask')}>Read-only</option><option value="auto" disabled={!supportedModes.includes('auto')}>Auto-approve</option><option value="full" disabled={!supportedModes.includes('full')}>Full access</option>
    </select></label><span className="accessHelp" onMouseEnter={() => setAccessHelpOpen(true)} onMouseLeave={() => setAccessHelpOpen(false)}><button type="button" className="accessHelpButton" aria-label="About access permissions" aria-describedby={accessHelpOpen ? accessHelpId : undefined} onFocus={() => setAccessHelpOpen(true)} onBlur={() => setAccessHelpOpen(false)} aria-expanded={accessHelpOpen} onClick={() => setAccessHelpOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setAccessHelpOpen(false); }}>?</button><span id={accessHelpId} role="tooltip" className={accessHelpOpen ? 'accessTooltip visible' : 'accessTooltip'}>{accessHelp}</span></span></div></div>
    {!supportedModes.includes(permissionMode) && <p className="permissionWarning">{supportedModes.length ? 'Choose a supported access mode to send a message with this connection.' : 'Set up a connection using the model button to send a message.'}</p>}

  </div></Pane>;
}

function StudyPlanner({question, setQuestion, plan, createPlan, close, startPlan}) {
  return <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="study-planner-title"><div className="modal studyPlanner"><button className="close" onClick={close} aria-label="Close new study modal"><X/></button><Pill tone="purple">NEW STUDY</Pill><h2 id="study-planner-title">{plan ? 'Review experiment plan' : 'What should we learn next?'}</h2>{plan ? <><p className="planQuestion">{plan.question}</p><div className="planGrid"><div><small>HYPOTHESIS</small><b>Guidance improves recovery under the selected noise conditions.</b></div><div><small>PRIMARY OUTCOME</small><b>Matched-seed recovery error, lower is better.</b></div><div><small>SCOPE</small><b>12 matched local evaluations · no network access.</b></div><div><small>EXPECTED RECORD</small><b>Metrics, comparison figure, and reproducible run manifest.</b></div></div><div className="warning"><CircleHelp size={16}/><span><b>Approval required:</b> starting this plan runs the allowlisted local workflow after you review its exact command in Methods.</span></div><div><button className="cancel" onClick={close}>Keep as proposal</button><button className="newBtn" onClick={startPlan}>Review &amp; run in Methods <ArrowUpRight size={16}/></button></div></> : <><p>Describe the question in plain language. The workbench will make the proposed hypothesis, evidence, scope, and approval boundary visible before anything runs.</p><textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="For example: test whether the gain persists with more seeds at high noise…"/><div><button className="cancel" onClick={close}>Cancel</button><button className="newBtn" onClick={createPlan} disabled={!question.trim()}>Create proposal <ArrowUpRight size={16}/></button></div></>}</div></div>;
}

function ProjectDialog({pathValue, setPathValue, close, openProject, error, busy}) {
  const [initializeGit, setInitializeGit] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const browse = async () => {
    try { setPickerError(''); const selected = await window.methodflowDesktop.chooseFolder(); if (selected) setPathValue(selected); }
    catch { setPickerError('Could not open the folder picker. You can enter a folder path below.'); }
  };
  return <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><div className="modal"><button className="close" onClick={close} aria-label="Close project dialog"><X/></button><Pill tone="blue">LOCAL PROJECT</Pill><h2 id="project-dialog-title">Open or create a research project</h2><p>Enter any local directory. If it does not exist, the workbench creates it with folders for workflows, runs, figures, exports, prompts, and write-ups.</p><input aria-label="Project folder" className="projectPathInput" value={pathValue} onChange={event => setPathValue(event.target.value)} placeholder="Path to your research folder" autoFocus/>{window.methodflowDesktop && <button className="lightBtn" onClick={browse} disabled={busy}>Browse folders…</button>}<label className="projectGitChoice"><input type="checkbox" checked={initializeGit} onChange={event => setInitializeGit(event.target.checked)}/> Enable Git version history (requires Git)</label>{pickerError && <p className="renderError">{pickerError}</p>}{error && <p className="renderError">{error}</p>}<div><button className="cancel" onClick={close}>Cancel</button><button className="newBtn" onClick={() => openProject(pathValue, initializeGit)} disabled={busy || !pathValue.trim()}>{busy ? 'Opening…' : 'Open or create'}</button></div></div></div>;
}

function SourceDialog({kind, source, setSource, save, close, error, busy}) {
  const bibliography = kind === 'bibliography';
  return <div className="modalBack" role="dialog" aria-modal="true" aria-labelledby="source-dialog-title"><div className="modal sourceDialog"><button className="close" onClick={close} aria-label="Close editor"><X/></button><Pill tone="blue">{bibliography ? 'BIBTEX LIBRARY' : 'PROJECT INFRASTRUCTURE'}</Pill><h2 id="source-dialog-title">{bibliography ? 'references.bib' : 'config/workbench.json'}</h2><p>{bibliography ? 'Paste BibTeX exported from a journal, DOI service, Zotero, or another reference manager. Citation keys are shared by LaTeX and Markdown.' : 'Keep secrets out of this file. SSH profiles use your operating system’s SSH configuration; Slurm profiles submit with sbatch on the remote host.'}</p><textarea aria-label={bibliography ? "Bibliography source" : "Project infrastructure source"} className="sourceDialogEditor" value={source} onChange={event => setSource(event.target.value)} spellCheck="false" autoFocus/>{error && <p className="renderError">{error}</p>}<div><button className="cancel" onClick={close}>Cancel</button><button className="newBtn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div></div></div>;
}

function LatexSetupDialog({problem, close}) {
  return <div className="modalBack" role="alertdialog" aria-modal="true" aria-labelledby="latex-setup-title"><div className="modal"><button className="close" onClick={close} aria-label="Close LaTeX setup"><X/></button><Pill tone="blue">LATEX SETUP</Pill><h2 id="latex-setup-title">PDF rendering needs Tectonic</h2><p>Axiovela could not find or start the local LaTeX engine. Desktop builds include Tectonic; use <b>Tools → Select Tectonic executable…</b> or reinstall the latest build. For a source installation, run <code>npm run setup:latex</code> or set <code>WORKBENCH_LATEX_PATH</code>, then restart Axiovela.</p>{problem?.setup && <p>{problem.setup}</p>}<div><button className="newBtn" onClick={close}>Got it</button></div></div></div>;
}

function WorkbenchMark() {
  return <img src="/workbench-mark.png" alt="" aria-hidden="true"/>;
}

function preferredWriteupFormat(root, drafts) {
  try { const saved = localStorage.getItem(`ml-workbench-writeup-format:${root}`); if (['latex', 'markdown'].includes(saved)) return saved; } catch {}
  if (drafts?.latex && !drafts?.markdown) return 'latex';
  if (drafts?.markdown && !drafts?.latex) return 'markdown';
  return defaultWriteupFormat();
}

function App() {
  const [tab, setTab] = useState('Results');
  const [drawer, setDrawer] = useState(false);
  const [newStudy, setNewStudy] = useState(false);
  const [studyQuestion, setStudyQuestion] = useState('Test whether guided sampling remains reliable under high noise with matched seeds.');
  const [studyPlan, setStudyPlan] = useState(null);
  const [messages, setMessages] = useState(messages0);
  const role = tab === 'Write-up' ? 'writing' : 'experiment';
  const [conversations, setConversations] = useState([]);
  const [activeConversations, setActiveConversations] = useState({});
  const [conversationBusy, setConversationBusy] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const conversationId = activeConversations[role] || '';
  const draftKey = `${role}:${conversationId}`;
  const [inputs, setInputs] = useState({experiment: '', writing: ''});
  const input = inputs[draftKey] || '';
  const setInput = value => setInputs(current => ({...current, [draftKey]: value}));
  const [capabilities, setCapabilities] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [modelError, setModelError] = useState('');
  const [selections, setSelections] = useState({experiment: {adapterId: 'codex', modelId: '', effort: ''}, writing: {adapterId: 'codex', modelId: '', effort: ''}});

  const [attachments, setAttachments] = useState({});
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const chatAttachment = attachments[draftKey];
  const setChatAttachment = value => setAttachments(current => ({...current, [draftKey]: value}));
  const [permissionMode, setPermissionMode] = useState(loadPermissionMode);
  const [agenticMode, setAgenticModeState] = useState(false);
  const [agenticStarting, setAgenticStarting] = useState(false);
  const [agenticProblem, setAgenticProblem] = useState(null);
  const [connectionRequest, setConnectionRequest] = useState(0);
  const agenticAttempt = useRef(false);
  const preAgentic = useRef(null);

  const [projectInfo, setProjectInfo] = useState(null);
  const projectRootRef = useRef(null);
  projectRootRef.current = projectInfo?.root || null;
  // Every request captures its project before yielding. Explicit roots on queued
  // work override the visible project, and stale responses never replace it.
  const apiRequest = (url, options = {}) => {
    const root = options.headers?.['x-axiovela-project'] || projectRootRef.current;
    return unscopedRequest(url, {...options, headers: {...(root ? {'x-axiovela-project': root} : {}), ...options.headers}});
  };
  const parallel = useParallelAssistant({request: unscopedRequest,
    onStarted: (record, item) => {
      if (projectRootRef.current !== item.root) return;
      setActiveConversations(current => {
        if ((current[record.role] || '') !== (item.body.conversationId || '')) return current;
        const next = {...current, [record.role]: record.conversationId};
        try { localStorage.setItem(`ml-workbench-conversations:${record.projectRoot}`, JSON.stringify(next)); } catch {}
        return next;
      });
      setConversations(current => [{id: record.conversationId, role: record.role, title: record.conversationTitle, createdAt: record.startedAt}, ...current.filter(c => c.id !== record.conversationId)]);
      if (record.projectCreated) void openProject(record.projectRoot);
    },
    onComplete: record => {
      if (projectRootRef.current !== record.projectRoot) return;
      void Promise.all([refreshProject(), refreshWriteup(writeupFormatRef.current), refreshBibliography()]).catch(() => {});
    },
  });
  const currentChatKey = conversationKey(projectInfo?.root, role, conversationId);
  const activeRecord = parallel.records.find(r => r.projectRoot === projectInfo?.root && r.role === role && r.conversationId === conversationId && r.status === 'running');
  const chatBusy = Boolean(activeRecord || parallel.pending[currentChatKey]);
  const projectAssistantBusy = parallel.records.some(r => r.projectRoot === projectInfo?.root && r.status === 'running') || Object.values(parallel.pending).some(item => item.root === projectInfo?.root);
  const assistantProgress = activeRecord?.stage || (parallel.pending[currentChatKey] ? 'Starting conversation…' : '');
  const assistantEvents = activeRecord?.events || [];
  const agenticActivity = activeRecord?.agenticActivity || null;
  const queuedPrompts = parallel.queue.filter(item => item.key === currentChatKey);

  const [projectTabs, setProjectTabs] = useState(() => { try { return JSON.parse(localStorage.getItem('axiovela-project-tabs') || '[]').filter(p => typeof p.root === 'string' && typeof p.name === 'string'); } catch { return []; } });
  const projectDrafts = useRef({});
  useEffect(() => { if (projectInfo?.root) setProjectTabs(current => current.some(p => p.root === projectInfo.root) ? current.map(p => p.root === projectInfo.root ? {root: projectInfo.root, name: projectInfo.name} : p) : [...current, {root: projectInfo.root, name: projectInfo.name}]); }, [projectInfo?.root]);
  useEffect(() => { localStorage.setItem('axiovela-project-tabs', JSON.stringify(projectTabs)); }, [projectTabs]);
  const [projectDialog, setProjectDialog] = useState(false);
  const [datasetDialog, setDatasetDialog] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runError, setRunError] = useState('');
  const selectedRun = projectInfo?.runs?.find(run => run.id === selectedRunId) || projectInfo?.runs?.[0];
  const [projectPath, setProjectPath] = useState('');
  const [projectError, setProjectError] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);
  const [bibliography, setBibliography] = useState({source: '', entries: [], error: null});
  const [bibliographyDialog, setBibliographyDialog] = useState(false);
  const [bibliographySource, setBibliographySource] = useState('');
  const [infrastructureDialog, setInfrastructureDialog] = useState(false);
  const [infrastructureSource, setInfrastructureSource] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [code, setCode] = useState(codeSample);
  const [output, setOutput] = useState('Runner idle. Approve the allowlisted command before starting.');
  const [runnerStatus, setRunnerStatus] = useState('idle');
  const [runnerApproved, setRunnerApproved] = useState(false);
  const [runnerLogs, setRunnerLogs] = useState(['No command has run. Start the local backend for real execution.']);
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendRunId, setBackendRunId] = useState(null);
  const [runRecords, setRunRecords] = useState([]);
  const [runnerApprovalToken, setRunnerApprovalToken] = useState(null);
  const [progress, setProgress] = useState(36);
  const [isRunning, setIsRunning] = useState(false);
  const [updates, setUpdates] = useState([
    {time: '00:00', text: 'Run initialized with 12 matched seeds.'},
    {time: '00:42', text: 'Loaded geometry and baseline checkpoint.'},
    {time: '01:18', text: '4 / 12 evaluations complete; error gap remains positive.'},
  ]);
  const [includedVisuals, setIncludedVisuals] = useState([]);
  const [writeupGenerated, setWriteupGenerated] = useState(false);
  const [initialWriteupFormat, setInitialWriteupFormat] = useState(defaultWriteupFormat);
  const saveInitialWriteupFormat = format => { localStorage.setItem(defaultFormatKey, format); setInitialWriteupFormat(format); };
  const [writeupFormat, setWriteupFormat] = useState(defaultWriteupFormat);
  const writeupFormatRef = useRef(writeupFormat);
  writeupFormatRef.current = writeupFormat;
  const [draftText, setDraftTextState] = useState('');
  const draftDirty = useRef(false);
  const draftRevision = useRef(0);
  const sourceBaseline = useRef('');
  const draftValue = useRef('');
  const writeupEditorRef = useRef(null);
  const sourceIdentity = useRef({root: '', format: 'latex'});
  const saveFlight = useRef(null);
  const saveLatest = useRef(null);
  const assistantWorking = useRef(projectAssistantBusy);
  assistantWorking.current = projectAssistantBusy;
  const sourceConflict = useRef(false);
  const [sourceReady, setSourceReady] = useState(false);
  const recoveryKey = (root, format) => `ml-workbench-draft:${root}:${format}`;
  const rememberDraft = () => { const {root, format} = sourceIdentity.current; if (root) try { localStorage.setItem(recoveryKey(root, format), JSON.stringify({source: draftValue.current, baseline: sourceBaseline.current})); } catch { /* beforeunload still warns if recovery storage is full */ } };
  const [sourceStatus, setSourceStatus] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const setDraftText = value => { const next = typeof value === 'function' ? value(draftValue.current) : value; draftValue.current = next; draftRevision.current++; draftDirty.current = true; setSourceStatus(sourceConflict.current ? 'Disk conflict. Your draft is retained; export it before reconciling.' : assistantWorking.current ? 'Draft retained in this browser while the assistant is working.' : 'Saving automatically…'); setDraftTextState(next); rememberDraft(); };
  const loadEditorSource = (writeup, format, root) => {
    let recovered;
    try { recovered = JSON.parse(localStorage.getItem(recoveryKey(root, format))); } catch { /* no recovery */ }
    const disk = writeup.source || '';
    const pending = typeof recovered?.source === 'string' && typeof recovered?.baseline === 'string' && recovered.source !== disk;
    sourceIdentity.current = {root, format}; sourceBaseline.current = pending ? recovered.baseline : disk;
    draftValue.current = pending ? recovered.source : disk; draftDirty.current = pending;
    sourceConflict.current = pending && recovered.baseline !== disk;
    draftRevision.current++; setDraftTextState(draftValue.current); setSourceReady(true);
    setSourceStatus(sourceConflict.current ? 'Recovered draft conflicts with newer disk changes. Export it before reconciling.' : pending ? 'Recovered unsaved draft. Saving automatically…' : 'All changes saved.');
  };
  const [writeupPrompt, setWriteupPrompt] = useState('Draft a concise mathematical research write-up from the selected diagnostics.');
  const [compileResult, setCompileResult] = useState(null);
  const [latexSetupProblem, setLatexSetupProblem] = useState(null);
  const [figureUploadStatus, setFigureUploadStatus] = useState('');
  const workspaceRef = useRef(null);
  const [layout, setLayout] = useState(loadStoredLayout);
  const {columnWidths, rowSplits} = layout;

  useEffect(() => {
    let active = true;
    apiRequest('/api/health').then(async () => {
      if (!active) return;
      setBackendOnline(true);
      parallel.adopt(await apiRequest('/api/assistant/activity'));
      const project = await apiRequest('/api/project');
      if (!active) return;
      setProjectInfo(project);
      setProjectPath(project.root || '');
      setRunRecords(project.runs || []);
      if (!project.root) {
        // Loading an empty workspace is not an edit. Otherwise first launch
        // immediately warns about an unsaved document that cannot be saved.
        draftValue.current = ''; draftDirty.current = false; draftRevision.current++;
        setDraftTextState('');
        setMessages(messages0);
        return;
      }
      const savedFormat = preferredWriteupFormat(project.root, project.writeups);
      setWriteupFormat(savedFormat);
      const [writeup, citations, history] = await Promise.all([apiRequest(`/api/writeups/source?format=${savedFormat}`), apiRequest('/api/bibliography'), apiRequest('/api/assistant?allConversations=1')]);
      if (!active) return;
      setBibliography(citations);
      loadEditorSource(writeup, savedFormat, project.root);
      applyAssistantHistory(history, project.root);

    }).catch(() => { if (active) setBackendOnline(false); }).finally(() => { if (active) setHistoryReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!backendOnline) return undefined;
    const timer = window.setInterval(() => { refreshProject().catch(() => {}); }, 3000);
    return () => window.clearInterval(timer);
  }, [backendOnline]);

  useEffect(() => {
    if (!backendRunId) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const record = await apiRequest(`/api/runs/${backendRunId}`);
        if (!active) return;
        setProgress(record.progress || 0);
        setRunnerLogs(record.logs || []);
        setOutput(`Backend run ${record.status}.\n\n${(record.logs || []).join('\n')}\n\nArtifacts: ${(record.artifacts || []).join(', ') || 'pending'}`);
        setRunnerStatus(record.status);
        setIsRunning(record.status === 'running');
        setUpdates((record.logs || []).slice(-5).map((text, index) => ({time: index === 0 ? 'now' : `+${index}`, text})));
        if (['complete', 'failed', 'canceled'].includes(record.status)) {
          setBackendRunId(null);
          apiRequest('/api/project').then(project => { setProjectInfo(project); setRunRecords(project.runs || []); }).catch(() => {});
          return;
        }
        timer = window.setTimeout(poll, 500);
      } catch (error) {
        if (!active) return;
        setRunnerLogs(current => [...current, `Polling error: ${error.message}`]);
        timer = window.setTimeout(poll, 1000);
      }
    };
    poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [backendRunId]);

  useEffect(() => {
    try {
      localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    } catch {
      // Keep the dashboard usable if localStorage is blocked.
    }
  }, [layout]);

  useEffect(() => { try { localStorage.setItem(permissionStorageKey, permissionMode); } catch { /* keep current-session selection */ } }, [permissionMode]);

  useEffect(() => {
    const modes = capabilities?.connections?.find(connection => connection.id === selections[role]?.adapterId)?.modes || [];
    if (role === 'experiment' && agenticMode) {
      const pi = capabilities?.connections?.find(connection => connection.id === 'pi');
      if (pi?.available && selections.experiment?.adapterId !== 'pi') setSelections(current => ({...current, experiment: {adapterId: 'pi', modelId: pi.defaultModelId || '', effort: pi.defaultEffort || '', profileId: current.experiment.profileId || 'general'}}));
      if (permissionMode !== 'full') setPermissionMode('full');
      return;
    }
    if (modes.length && !modes.includes(permissionMode) && !(role === 'experiment' && agenticMode)) setPermissionMode(modes.includes('ask') ? 'ask' : modes[0]);
  }, [capabilities, selections, role, permissionMode, agenticMode]);

  const resetLayout = () => setLayout(defaultLayout);
  const refreshModels = async (refresh = false) => {
    setModelLoading(true); setModelError('');
    try { const result = await apiRequest(`/api/assistant/capabilities${refresh ? '?refresh=1' : ''}`); setCapabilities(result); return result; }
    catch (error) { setModelError(error.message); }
    finally { setModelLoading(false); }
  };
  useEffect(() => {
    if (!backendOnline) return;
    let active = true;
    setModelLoading(true);
    apiRequest('/api/assistant/capabilities').then(result => { if (active) { setCapabilities(result); setSelections(result.preferences); setModelError(''); } }).catch(error => { if (active) setModelError(error.message); }).finally(() => { if (active) setModelLoading(false); });
    return () => { active = false; };
  }, [backendOnline, projectInfo?.root]);
  const saveConnection = async (id, config) => { await apiRequest(`/api/assistant/connections/${id}`, {method: 'PUT', body: JSON.stringify(config)}); await refreshModels(true); };
  const renderChatDocument = async document => { const result = await apiRequest('/api/assistant/render', {method: 'POST', body: JSON.stringify(document)}); return {...result, url: `${apiBase}${result.url}`}; };
  const saveResearchProfile = async profileId => {
    if (projectInfo?.root) await apiRequest('/api/assistant/preferences', {method: 'PUT', body: JSON.stringify({role, profileId})});
    setSelections(current => ({...current, [role]: {...current[role], profileId}}));
  };
  const saveModel = async selection => {
    if (projectInfo?.root) await apiRequest('/api/assistant/preferences', {method: 'PUT', body: JSON.stringify({role, selection})});
    setSelections(current => ({...current, [role]: selection}));
    if (role === 'experiment' && agenticMode && selection.adapterId !== 'pi') setAgenticModeState(false);
  };
  const setAgenticMode = async enabled => {
    if (agenticAttempt.current || chatBusy || attachmentBusy) return;
    if (enabled) {
      agenticAttempt.current = true;
      setAgenticStarting(true);
      try {
        const result = await apiRequest('/api/assistant/agentic/enable', {method: 'POST', body: JSON.stringify({projectRoot: projectInfo?.root})});
        const pi = result.pi;
        setCapabilities(current => ({...current, agentic: result.agentic, connections: [...(current?.connections || []).filter(connection => connection.id !== 'pi'), pi]}));
        if (sourceIdentity.current.root && sourceIdentity.current.root !== result.projectRoot) return;
        preAgentic.current = {selection: selections.experiment, permissionMode};
        setSelections(current => ({...current, experiment: {adapterId: 'pi', modelId: pi.defaultModelId || '', effort: pi.defaultEffort || '', profileId: current.experiment.profileId || 'general'}}));
        setPermissionMode('full');

        setAgenticModeState(true);
        setAgenticProblem(null);
      } catch (error) { setAgenticProblem({message: error.message, agentic: error.details?.agentic}); }
      finally { agenticAttempt.current = false; setAgenticStarting(false); }
    } else {
      const previous = preAgentic.current;
      if (previous) { setSelections(current => ({...current, experiment: {...previous.selection, profileId: current.experiment.profileId || 'general'}})); setPermissionMode(previous.permissionMode); }
      preAgentic.current = null;

      setAgenticModeState(false);
    }
  };
  const refreshProject = async () => { const root = projectRootRef.current; const project = await apiRequest('/api/project'); if (projectRootRef.current === root && project.root === root) { setProjectInfo(project); setRunRecords(project.runs || []); } return project; };
  const refreshBibliography = async () => { if (!projectInfo?.root && !projectPath) return null; const root = projectRootRef.current; const result = await apiRequest('/api/bibliography'); if (projectRootRef.current === root) setBibliography(result); return result; };
  const refreshWriteup = async (format = writeupFormatRef.current, force = false, root = sourceIdentity.current.root) => {
    if (!root) return;
    const revision = draftRevision.current;
    const writeup = await apiRequest(`/api/writeups/source?format=${format}`);
    if (revision !== draftRevision.current || saveFlight.current) return writeup;
    if (writeup.projectRoot && writeup.projectRoot !== root) return writeup;
    if (!force && (sourceIdentity.current.root !== root || sourceIdentity.current.format !== format)) return writeup;
    if (!draftDirty.current || force) loadEditorSource(writeup, format, root);
    else if (writeup.source !== sourceBaseline.current) { sourceConflict.current = true; setSourceStatus('New source is available on disk. Your editor draft is preserved; export it before reconciling.'); }
    return writeup;
  };
  const saveSource = async () => {
    while (saveFlight.current) { await saveFlight.current; }
    const {root, format} = sourceIdentity.current;
    if (!root || !draftDirty.current) return;
    const value = draftValue.current, revision = draftRevision.current;
    setSourceSaving(true);
    const task = (async () => {
      try {
        await apiRequest('/api/writeups/source', {method: 'PUT', body: JSON.stringify({projectRoot: root, format, source: value, expectedSource: sourceBaseline.current})});
        if (sourceIdentity.current.root !== root || sourceIdentity.current.format !== format) return;
        sourceBaseline.current = value; sourceConflict.current = false;
        if (revision === draftRevision.current) { draftDirty.current = false; setSourceStatus('All changes saved.'); try { localStorage.removeItem(recoveryKey(root, format)); } catch {} }
        else rememberDraft();
      } catch (error) { sourceConflict.current = /changed on disk|active project changed/.test(error.message); setSourceStatus('Not saved: ' + error.message); rememberDraft(); throw error; }
      finally { setSourceSaving(false); saveFlight.current = null; }
    })();
    saveFlight.current = task;
    await task;
  };
  saveLatest.current = saveSource;
  const reloadDiskSource = async () => {
    if (!window.confirm('Discard the recovered editor draft and load the disk version? Export source first if you need to keep both versions.')) return;
    const {root, format} = sourceIdentity.current;
    try { localStorage.removeItem(recoveryKey(root, format)); } catch {}
    draftDirty.current = false; sourceConflict.current = false;
    try { await refreshWriteup(format, true, root); } catch (error) { setSourceStatus(error.message); }
  };
  useEffect(() => {
    if (!sourceReady || !draftDirty.current || sourceConflict.current || projectAssistantBusy) return;
    const timer = setTimeout(() => { saveLatest.current().catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [draftText, sourceReady, writeupFormat, projectAssistantBusy]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (draftDirty.current && !sourceConflict.current && !assistantWorking.current) saveLatest.current?.().catch(() => {});
      else if (!draftDirty.current && sourceIdentity.current.root) refreshWriteup().catch(() => {});
    }, 3000);
    const leaving = event => { if (draftDirty.current) { rememberDraft(); event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leaving);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', leaving); };
  }, []);
  const chooseConversations = (next, root = projectInfo?.root) => {
    setActiveConversations(next);
    if (root) try { localStorage.setItem(`ml-workbench-conversations:${root}`, JSON.stringify(next)); } catch { /* selection remains available in memory */ }
  };
  const applyAssistantHistory = (history, root) => {
    const available = history.conversations || [];
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`ml-workbench-conversations:${root}`) || '{}'); } catch { /* use most recent conversation */ }
    if (!saved || typeof saved !== 'object') saved = {};
    setConversations(available);
    chooseConversations(Object.fromEntries(['experiment', 'writing'].map(role => [role,
      available.find(item => item.id === saved[role] && item.role === role)?.id ||
      history.jobs?.find(job => job.role === role && job.status === 'running')?.conversationId || available.find(item => item.role === role)?.id || '',
    ])), root);
    parallel.adopt(history);
    setMessages(assistantHistoryMessages(history.jobs));
  };
  const refreshAssistantHistory = async (root = projectInfo?.root) => { const history = await apiRequest('/api/assistant?allConversations=1', {headers: {'x-axiovela-project': root}}); applyAssistantHistory(history, root); return history; };
  const newConversation = async () => {
    if (conversationBusy || !historyReady || !projectInfo?.root) return;
    setConversationBusy(true); setConversationError('');
    try {
      const {conversation} = await apiRequest('/api/assistant/conversations', {method: 'POST', body: JSON.stringify({role})});
      setConversations(current => [conversation, ...current]);
      chooseConversations({...activeConversations, [role]: conversation.id});
    } catch (error) { setConversationError(error.message); }
    finally { setConversationBusy(false); }
  };
  const openProject = async (selectedPath = projectPath, initializeGit = false) => {
    if (projectBusy || attachmentBusy || sourceBusy) return;
    projectDrafts.current[projectInfo?.root] = {inputs, attachments, tab};
    setProjectBusy(true); setProjectError(''); setHistoryReady(false);
    try {
      if (projectAssistantBusy) rememberDraft(); else await saveSource();
      const project = await apiRequest('/api/project/open', {method: 'POST', body: JSON.stringify({path: selectedPath, create: true, initializeGit})});
      projectRootRef.current = project.root;
      const nextFormat = preferredWriteupFormat(project.root, project.writeups);
      setWriteupFormat(nextFormat);
      setInputs(projectDrafts.current[project.root]?.inputs || {}); setAttachments(projectDrafts.current[project.root]?.attachments || {}); setConversationError('');
      setProjectInfo(project); setProjectPath(project.root); setRunRecords(project.runs || []); setCompileResult(null); setFigureUploadStatus(''); await Promise.all([refreshWriteup(nextFormat, true, project.root), refreshBibliography(), refreshAssistantHistory(project.root)]); setProjectDialog(false); setTab(projectDrafts.current[project.root]?.tab || 'Results');
    } catch (error) { setProjectError(error.message); }
    finally { setProjectBusy(false); setHistoryReady(true); }
  };
  const tryDesktopExample = async () => {
    setProjectBusy(true); setProjectError('');
    try { const selected = await window.methodflowDesktop.createExample(); if (selected) await openProject(selected); }
    catch (error) { setProjectError(error.message); setProjectDialog(true); }
    finally { setProjectBusy(false); }
  };
  useEffect(() => window.methodflowDesktop?.onExampleRequest(() => {
    if (projectBusy) { setProjectError('Finish or stop the current task before opening the example.'); setProjectDialog(true); return; }
    void tryDesktopExample();
  }));
  const openBibliographyEditor = () => { setBibliographySource(bibliography.source || ''); setSourceError(''); setBibliographyDialog(true); };
  const saveBibliography = async () => {
    setSourceBusy(true); setSourceError('');
    try { const result = await apiRequest('/api/bibliography', {method: 'PUT', body: JSON.stringify({source: bibliographySource})}); setBibliography(result); setBibliographyDialog(false); await refreshProject(); }
    catch (error) { setSourceError(error.message); }
    finally { setSourceBusy(false); }
  };
  const openInfrastructureEditor = () => { setInfrastructureSource(JSON.stringify(projectInfo?.infrastructure?.config || {}, null, 2)); setSourceError(''); setInfrastructureDialog(true); };
  const saveInfrastructure = async () => {
    setSourceBusy(true); setSourceError('');
    try { const config = JSON.parse(infrastructureSource); const result = await apiRequest('/api/infrastructure', {method: 'PUT', body: JSON.stringify({config})}); setProjectInfo(current => ({...current, infrastructure: result})); setInfrastructureDialog(false); }
    catch (error) { setSourceError(error.message); }
    finally { setSourceBusy(false); }
  };

  const send = async suggestion => {
    const message = (typeof suggestion === 'string' ? suggestion : input).trim();
    if (!message || attachmentBusy || agenticStarting || conversationBusy || !historyReady || modelLoading || !capabilities || !projectInfo?.root) return;
    const root = projectInfo.root;
    const attachment = chatAttachment;
    const activeAgenticMode = role === 'experiment' && agenticMode;
    const pi = capabilities.connections?.find(connection => connection.id === 'pi');
    const selection = activeAgenticMode && selections[role].adapterId !== 'pi'
      ? {adapterId: 'pi', modelId: pi?.defaultModelId || '', effort: pi?.defaultEffort || ''} : selections[role];
    const body = {message, attachment: attachment?.content || '', artifactPath: attachment?.artifactPath, permissionMode, agenticMode: activeAgenticMode, role, writeupFormat, defaultWriteupFormat: initialWriteupFormat, selection, conversationId: conversationId || undefined};
    // Preserve a local editor draft when another conversation may be editing disk.
    try {
      if (projectAssistantBusy) rememberDraft(); else await saveSource();
      parallel.submit(root, body);
      setInput(''); setChatAttachment(null);
    } catch (error) { setConversationError(error.message); }
  };
  const cancelAssistant = () => parallel.cancel(currentChatKey, activeRecord);

  const dropAttachment = raw => {
    try {
      const candidate = JSON.parse(raw);
      const artifact = projectInfo?.artifacts?.find(item => item.path === candidate.path);
      if (artifact) setChatAttachment({name: artifact.title || artifact.name || artifact.path, artifactPath: artifact.path});
    } catch { /* Ignore foreign or malformed drag payloads. */ }
  };
  const attach = async selection => {
    if (!selection) return;
    setAttachmentBusy(true);
    try {
      if (selection.error) throw selection.error;
      const items = await importData(apiRequest, selection.files || selection.paths ? selection : {files: [selection]});
      setChatAttachment({name: items.map(item => item.name).join(', '), content: `Attached workspace data (use appropriate tools to inspect these files):\n${items.map(item => JSON.stringify({name: item.name, path: item.path, bytes: item.bytes, format: item.format})).join('\n')}`});
      if (items.some(item => item.skipped)) setMessages(current => [...current, ['bot', importSummary(items), `attachment-${Date.now()}`, role, {conversationId}]]);
    } catch (error) {
      setMessages(current => [...current, ['bot', `Could not attach data: ${error.message}`, `attachment-${Date.now()}`, role, {conversationId}]]);
    } finally { try { await refreshProject(); } finally { setAttachmentBusy(false); } }
  };
  const approveRunner = async () => {
    if (!backendOnline) {
      setRunnerLogs(current => [...current, 'Approval unavailable: local backend is offline.']);
      setOutput('Start the backend with npm run backend, then request approval again.');
      return;
    }
    try {
      const approval = await apiRequest('/api/approvals', {method: 'POST', body: JSON.stringify({commandId: 'seed-matched-comparison'})});
      setRunnerApprovalToken(approval.approvalToken);
      setRunnerApproved(true);
      setRunnerStatus('approved');
      setOutput(`Approval ready until ${approval.expiresAt}.\n\n${approval.command.command}\n\nWrites: ${approval.command.writes.join(', ')}`);
      setRunnerLogs(current => [...current, 'Allowlisted command approved by user; start is now enabled.']);
    } catch (error) {
      setOutput(`Approval failed: ${error.message}`);
    }
  };
  const beginBackendRun = async () => {
    let token = runnerApprovalToken;
    if (!token) {
      const approval = await apiRequest('/api/approvals', {method: 'POST', body: JSON.stringify({commandId: 'seed-matched-comparison'})});
      token = approval.approvalToken;
      setRunnerApprovalToken(token);
      setRunnerApproved(true);
    }
    const started = await apiRequest('/api/runs', {method: 'POST', body: JSON.stringify({commandId: 'seed-matched-comparison', approvalToken: token})});
    setBackendRunId(started.id);
    setRunnerApprovalToken(null);
    setRunnerApproved(false);
    setRunnerStatus('running');
    setIsRunning(true);
    setProgress(0);
    setOutput(`Backend run ${started.id} started.\n\n${started.command}`);
    setRunnerLogs(['Waiting for backend log events…']);
  };
  const cancelRunner = async () => {
    if (backendRunId && backendOnline) {
      try { await apiRequest(`/api/runs/${backendRunId}/cancel`, {method: 'POST'}); } catch (error) { setRunnerLogs(current => [...current, `Cancellation failed: ${error.message}`]); }
    } else {
      setRunnerStatus('canceled');
      setOutput('No backend run was active.');
    }
  };
  const runCode = async () => {
    if (!runnerApproved) {
      setOutput(`Approval required before any local runner starts.\n\nPreview: ${commandPreview}`);
      setRunnerLogs(current => [...current, 'Start blocked: approval required.']);
      return;
    }
    if (!backendOnline) {
      setOutput('Backend offline. Start it with npm run backend; no browser simulation will run.');
      return;
    }
    try { await beginBackendRun(); } catch (error) { setRunnerStatus('failed'); setOutput(`Backend start failed: ${error.message}`); }
  };
  const startRun = async () => {
    setProgress(0);
    setUpdates([{time: '00:00', text: 'Requesting approval for the allowlisted local workflow.'}]);
    if (!backendOnline) { setIsRunning(false); setUpdates(current => [...current, {time: 'error', text: 'Backend offline; no simulated run was started.'}]); return; }
    try { await beginBackendRun(); } catch (error) { setIsRunning(false); setRunnerStatus('failed'); setUpdates(current => [...current, {time: 'error', text: `Backend start failed: ${error.message}`}]); }
  };
  const changeWriteupFormat = async format => {
    if (format === writeupFormat) return;
    try { await saveSource(); setSourceReady(false); await refreshWriteup(format, true); setWriteupFormat(format); setCompileResult(null); if (projectInfo?.root) try { localStorage.setItem(`ml-workbench-writeup-format:${projectInfo.root}`, format); } catch {} }
    catch (error) { setSourceReady(true); setSourceStatus(error.message); }
  };
  const addVisual = label => {
    setIncludedVisuals(current => current.includes(label) ? current : [...current, label]);
    setDraftText(current => current + (writeupFormat === 'latex' ? `

\\begin{figure}[h]
  \\centering
  \\includegraphics[width=.85\\linewidth]{${visualPath(label)}}
  \\caption{${label} from the dashboard evidence tab.}
\\end{figure}` : `

![${label}](${visualPath(label)})`));
  };
  const insertArtifact = (artifact, offset = writeupEditorRef.current?.selectionStart) => {
    const caption = artifact.caption || figureTitle(artifact);
    const latexCaption = caption.replace(/([#$%&_{}])/g, '\\$1');
    const snippet = writeupFormat === 'latex' ? `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=.9\\linewidth]{${artifact.path}}
  \\caption{${latexCaption}}
\\end{figure}` : `![${caption}](${artifact.path})`;
    let source = draftValue.current;
    let at = offset;
    if (writeupFormat === 'latex' && !source.trim()) { source = latexTemplate(); at = source.indexOf('\\end{document}'); }
    const inserted = insertBlock(source, snippet, at);
    let next = inserted.source;
    if (writeupFormat === 'latex') next = ensureLatexPackage(next, 'graphicx');
    const caret = inserted.caret + next.length - inserted.source.length;
    setDraftText(next);
    requestAnimationFrame(() => { writeupEditorRef.current?.focus(); writeupEditorRef.current?.setSelectionRange(caret, caret); });
    setCompileResult(null);
  };
  const handleWriteupDrop = async event => {
    event.preventDefault();
    const offset = dropLineOffset(event.currentTarget, event.clientY);
    const identity = sourceIdentity.current;
    const revision = draftRevision.current;
    const stillCurrent = () => sourceIdentity.current === identity && draftRevision.current === revision;
    const file = event.dataTransfer.files?.[0];
    if (file) {
      if (!projectInfo?.root) { setFigureUploadStatus('Choose a project before adding a figure.'); return; }
      if (!/\.(?:png|jpe?g|webp|svg)$/i.test(file.name)) { setFigureUploadStatus('Use a PNG, JPEG, WebP, or SVG image.'); return; }
      if (file.size > 10 * 1024 * 1024) { setFigureUploadStatus('Images must be 10 MB or smaller.'); return; }
      setFigureUploadStatus(`Importing ${file.name}…`);
      try {
        const data = await fileAsBase64(file);
        if (!stillCurrent()) { setFigureUploadStatus('The document changed. Drop the image again at the desired line.'); return; }
        const result = await apiRequest('/api/artifacts/upload', {method: 'POST', body: JSON.stringify({name: file.name, data})});
        if (!stillCurrent()) { setFigureUploadStatus('The document changed during import. Insert the uploaded image from Project figures.'); return; }
        insertArtifact(result.artifact, offset);
        await refreshProject();
        setFigureUploadStatus(`${file.name} was imported and inserted safely.`);
      } catch (error) {
        setFigureUploadStatus(`Image import failed: ${error.message}`);
      }
      return;
    }
    const artifactData = event.dataTransfer.getData('application/x-workbench-artifact');
    if (artifactData) {
      try { insertArtifact(JSON.parse(artifactData), offset); return; } catch { /* use the plain-text fallback */ }
    }
    const snippet = event.dataTransfer.getData('application/x-workbench-snippet');
    if (snippet) {
      setDraftText(current => insertBlock(current, snippet, offset).source);
      return;
    }
    const plainText = event.dataTransfer.getData('text/plain');
    if (plainText) addVisual(plainText);
  };
  const insertCitation = key => setDraftText(current => {
    if (writeupFormat === 'markdown') return `${current.trimEnd()}\n\n[@${key}]\n`;
    const citation = `\\citep{${key}}`;
    const anchor = '\n\\bibliographystyle';
    return current.includes(anchor) ? current.replace(anchor, `\n${citation}\n${anchor}`) : `${current.trimEnd()}\n${citation}\n`;
  });
  const generateWriteup = () => { setDraftText(writeupFormat === 'latex' ? latexTemplate(includedVisuals) : markdownTemplate(includedVisuals)); setWriteupGenerated(true); };
  const compileLatex = async () => {
    setCompileResult({status: 'running'});
    try { await saveSource(); const result = await apiRequest('/api/writeups/compile', {method: 'POST', body: JSON.stringify({draftText: draftValue.current, expectedSource: draftValue.current})}); setCompileResult(result); await refreshProject(); }
    catch (error) {
      setCompileResult({status: 'failed', error: error.message, details: error.details});
      if (error.code === 'latex_engine_unavailable') setLatexSetupProblem(error.details || {});
    }
  };
  const [pdfBusy, setPdfBusy] = useState(false);
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      await saveSource();
      const result = await renderChatDocument({format: writeupFormat, source: writeupFormat === 'markdown' ? markdownWithCitations(draftValue.current, bibliography?.entries || []) : draftValue.current});
      await exportRenderedPdf(result);
    } catch (error) { setCompileResult({status: 'failed', error: error.message, details: error.details}); }
    finally { setPdfBusy(false); }
  };
  const exportWriteup = async () => {
    try {
      if (backendOnline) { await saveSource(); await apiRequest('/api/writeups/export', {method: 'POST', body: JSON.stringify({format: writeupFormat, draftText, includedVisuals})}); }
    } catch (error) {
      setRunnerLogs(current => [...current, `Backend export unavailable: ${error.message}; downloaded a local copy.`]);
    }
    downloadText(writeupFormat === 'latex' ? 'research-writeup.tex' : 'research-writeup.md', draftText, writeupFormat === 'latex' ? 'application/x-tex' : 'text/markdown');
  };

  const startColumnResize = (boundary, event) => {
    if (!workspaceRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const start = columnWidths;
    const width = workspaceRef.current.getBoundingClientRect().width;
    const move = moveEvent => {
      const delta = ((moveEvent.clientX - startX) / width) * 100;
      const next = [...start];
      next[boundary] = start[boundary] + delta;
      next[boundary + 1] = start[boundary + 1] - delta;
      if (next[boundary] < 22 || next[boundary + 1] < 22) return;
      setLayout(current => ({...current, columnWidths: next}));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, {once: true});
  };

  const drafts = {...projectInfo?.writeups, ...(sourceReady && sourceIdentity.current.root === projectInfo?.root ? {[writeupFormat]: Boolean(draftText.trim())} : {})};
  const cancelTrial = async id => { setRunError(''); try { await apiRequest(`/api/runs/${id}/cancel`, {method: 'POST'}); await refreshProject(); } catch (error) { setRunError(error.message); } };
  const left = tab === 'Write-up' ? <WriteupEditorPane editBibliography={openBibliographyEditor} initialFormat={initialWriteupFormat} setInitialFormat={saveInitialWriteupFormat} drafts={drafts} editorRef={writeupEditorRef} sourceConflict={sourceConflict.current} reloadDisk={reloadDiskSource} saveSource={() => saveSource().catch(() => {})} sourceStatus={sourceStatus} sourceSaving={sourceSaving} format={writeupFormat} setFormat={changeWriteupFormat} draftText={draftText} setDraftText={setDraftText} handleWriteupDrop={handleWriteupDrop} projectActive={Boolean(projectInfo?.root) && sourceReady} uploadStatus={figureUploadStatus}/> : ResearchLeft({Pane, tab, project: projectInfo, selectedRun, selectRun: setSelectedRunId, infrastructure: <InfrastructureSummary infrastructure={projectInfo?.infrastructure} openSettings={openInfrastructureEditor}/>});
  const middle = tab === 'Write-up' ? <WriteupPreviewPane projectRoot={projectInfo?.root} exportPdf={exportPdf} pdfBusy={pdfBusy} format={writeupFormat} exportWriteup={exportWriteup} draftText={draftText} compileResult={compileResult} compileLatex={compileLatex} bibliography={bibliography} projectActive={Boolean(projectInfo?.root)}/> : ResearchMiddle({Pane, tab, project: projectInfo, selectedRun, apiBase, cancelRun: cancelTrial, runError});
  const conversationControl = <>{queuedPrompts.length > 0 && <div className="promptQueue" aria-label="Queued messages"><small>Queued · continues in the background with these settings</small>{queuedPrompts.map(item => <div key={item.id}><span>{item.body.message}</span><button className="textButton" onClick={() => { setInput(item.body.message); parallel.removeQueued(item.id); }}>Edit</button><button aria-label="Remove queued message" onClick={() => parallel.removeQueued(item.id)}><X size={12}/></button></div>)}</div>}<div className="conversationToolbar"><label>Conversation<select aria-label="Conversation" value={conversationId} disabled={conversationBusy || !historyReady} onChange={event => { setConversationError(''); chooseConversations({...activeConversations, [role]: event.target.value}); }}>{!conversationId && <option value="">New conversation</option>}{conversations.filter(item => item.role === role).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button onClick={newConversation} disabled={conversationBusy || !historyReady || !projectInfo?.root} title="Start a new conversation"><Plus size={14}/> New chat</button></div>{conversationError && <p className="renderError" role="alert">{conversationError}</p>}</>;
  const modelControl = <ModelPicker onConnectionOpened={() => setConnectionRequest(0)} connectionRequest={connectionRequest} role={role} selection={selections[role]} capabilities={capabilities} busy={chatBusy || conversationBusy || agenticStarting} loading={modelLoading} error={modelError} onRefresh={() => refreshModels(true)} onSave={saveModel} onSaveProfile={saveResearchProfile} onSaveConnection={saveConnection} onNewSession={newConversation}/>;
  const assistant = <ChatbotPane key={`${role}:${conversationId}`} conversationControl={conversationControl} ready={!agenticStarting && historyReady && !conversationBusy && !modelLoading && Boolean(capabilities)} projectRoot={projectInfo?.root || ''} title={tab === 'Write-up' ? 'Research Assistant' : 'Experiment Chatbot'} messages={[...messages.filter(m => String(m[2]).startsWith('attachment-') && m[3] === role && m[4]?.conversationId === conversationId), ...assistantHistoryMessages(parallel.records.filter(r => r.projectRoot === projectInfo?.root && r.role === role && (r.conversationId || '') === conversationId)), ...(parallel.pending[currentChatKey] ? [['user', parallel.pending[currentChatKey].body.message, 'pending', role, {conversationId}]] : [])]} input={input} setInput={setInput} send={send} attach={attach} dropAttachment={dropAttachment} attachmentName={chatAttachment?.name} clearAttachment={() => setChatAttachment(null)} busy={chatBusy || attachmentBusy} attachmentBusy={attachmentBusy} assistantProgress={assistantProgress} assistantEvents={assistantEvents} lastActivityAt={activeRecord?.lastActivityAt} statusError={activeRecord?.statusError} agenticActivity={agenticActivity} permissionMode={permissionMode} setPermissionMode={setPermissionMode} cancelAssistant={cancelAssistant} modelControl={modelControl} engineName={capabilities?.connections?.find(c => c.id === selections[role].adapterId)?.name || selections[role].adapterId} renderDocument={renderChatDocument} supportedModes={capabilities?.connections?.find(c => c.id === selections[role].adapterId)?.modes || ['ask', 'auto', 'full']} agenticMode={role === 'experiment' && agenticMode} setAgenticMode={role === 'experiment' ? setAgenticMode : null} agentic={capabilities?.agentic} agenticStarting={agenticStarting}/>;
  const right = tab === 'Write-up' ? <>{assistant}<WriteupAssetsPane projectRoot={projectInfo?.root} key={projectInfo?.root} runs={projectInfo?.runs} artifacts={projectInfo?.artifacts || []} bibliography={bibliography} editBibliography={openBibliographyEditor} insertArtifact={insertArtifact} projectActive={Boolean(projectInfo?.root)}/></> : assistant;

  return <main className="app"><div className="projectStrip"><div className="projectBrand"><div className="brandMark"><WorkbenchMark/></div><div className="brand">Axiovela</div></div><div className="projectTabs" aria-label="Open projects">{projectTabs.map(project => <div key={project.root} className={project.root === projectInfo?.root ? 'activeProjectTab' : ''}><button aria-pressed={project.root === projectInfo?.root} title={project.root} disabled={projectBusy} onClick={() => project.root !== projectInfo?.root && openProject(project.root)}>{project.name}{parallel.records.some(r => r.projectRoot === project.root && r.status === 'running') && <span className="projectActivityDot" aria-label="Tasks running"> ●</span>}</button><button aria-label={`Close tab ${project.name}`} disabled={project.root === projectInfo?.root || parallel.records.some(r => r.projectRoot === project.root && r.status === 'running') || parallel.queue.some(q => q.root === project.root) || Object.values(parallel.pending).some(item => item.root === project.root)} onClick={() => setProjectTabs(current => current.filter(p => p.root !== project.root))}><X size={12}/></button></div>)}<button aria-label="Project" title="Open another project" onClick={() => setProjectDialog(true)}><Plus size={14}/></button></div></div><header className="topbar"><nav aria-label="Workspace sections">{tabs.map(x => <button onClick={() => setTab(x)} className={tab === x ? 'selected' : ''} key={x}>{x}</button>)}</nav><div className="topActions"><span className="parallelStatus" role="status">{parallel.records.filter(r => r.status === 'running').length > 0 ? `● ${parallel.records.filter(r => r.status === 'running').length} tasks running` : ''}</span><span className={`backendStatus ${backendOnline ? 'onlineStatus' : 'offlineStatus'}`} title="Local workspace connection">● {window.methodflowDesktop ? (backendOnline ? 'Ready' : 'Connecting…') : (backendOnline ? 'Backend online' : 'Backend offline')}</span><button className="lightBtn" onClick={() => setDatasetDialog(true)} disabled={!projectInfo?.root} title={projectInfo?.root ? "Import or preview project datasets" : "Open a project to link a dataset"}><Paperclip size={15}/> Link dataset</button><button className="lightBtn" onClick={resetLayout}><RefreshCcw size={15}/> Reset layout</button></div></header>

    <div ref={workspaceRef} className="workspace" style={{'--left-width': `${columnWidths[0]}fr`, '--middle-width': `${columnWidths[1]}fr`, '--right-width': `${columnWidths[2]}fr`}}><ResizeColumn className="leftCol" split={rowSplits.left} onSplitChange={split => setLayout(current => ({...current, rowSplits: {...current.rowSplits, left: split}}))}>{left}</ResizeColumn><button className="colResizeHandle" onPointerDown={event => startColumnResize(0, event)} aria-label="Resize left and middle columns" title="Drag to resize adjacent columns"/><ResizeColumn className="middleCol" split={rowSplits.middle} onSplitChange={split => setLayout(current => ({...current, rowSplits: {...current.rowSplits, middle: split}}))}>{middle}</ResizeColumn><button className="colResizeHandle" onPointerDown={event => startColumnResize(1, event)} aria-label="Resize middle and right columns" title="Drag to resize adjacent columns"/><ResizeColumn className={'rightCol ' + (tab === 'Write-up' ? 'writeupRightCol' : '')} split={rowSplits.right} onSplitChange={split => setLayout(current => ({...current, rowSplits: {...current.rowSplits, right: split}}))}>{right}</ResizeColumn></div>
    {drawer && <aside className="drawer"><button onClick={() => setDrawer(false)} aria-label="Close methodology drawer"><X size={18}/></button><Pill tone="blue">HOW DO WE KNOW?</Pill><h2>Study methodology</h2><p>12 locally executed, seed-matched evaluations across the selected noise range.</p><hr/><b>Project scaffold</b><ProjectStructure/><hr/><b>Primary outcome</b><p>Recovery error, aggregated by matched noise setting.</p><b>Controls</b><p>Same geometry, compute budget, and initialization across both methods.</p></aside>}
    {projectDialog && <ProjectDialog pathValue={projectPath} setPathValue={setProjectPath} close={() => setProjectDialog(false)} openProject={openProject} error={projectError} busy={projectBusy}/>}
    {agenticProblem && <AgenticSetupDialog onUseApi={() => { setAgenticProblem(null); setConnectionRequest(value => value + 1); }} problem={agenticProblem} busy={agenticStarting} retry={() => setAgenticMode(true)} close={() => setAgenticProblem(null)}/>}
    {latexSetupProblem && <LatexSetupDialog problem={latexSetupProblem} close={() => setLatexSetupProblem(null)}/>}
    {datasetDialog && <DatasetDialog apiRequest={apiRequest} datasets={projectInfo?.datasets || []} refresh={refreshProject} close={() => setDatasetDialog(false)}/>}
    {bibliographyDialog && <SourceDialog kind="bibliography" source={bibliographySource} setSource={setBibliographySource} save={saveBibliography} close={() => setBibliographyDialog(false)} error={sourceError} busy={sourceBusy}/>}
    {infrastructureDialog && <SourceDialog kind="infrastructure" source={infrastructureSource} setSource={setInfrastructureSource} save={saveInfrastructure} close={() => setInfrastructureDialog(false)} error={sourceError} busy={sourceBusy}/>}
  </main>;
}

createRoot(document.getElementById('root')).render(<><App/><UpdateNotice/></>);

export default App;
