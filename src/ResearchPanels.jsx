import {navigateItems} from './item-navigation.mjs';
import {AnnotatedContent} from './WorkspaceFeedback.jsx';
import React, {useMemo, useState} from 'react';
import RichText from './ResearchText.jsx';
import {metricLabel, metricTables} from './metric-tables.mjs';
import FigureGallery from './FigureGallery.jsx';
import {figureTitle, humanTitle, metricValue, researchView, runTitle, executiveBrief} from './research-model.mjs';

function Empty({children}) { return <div className="emptyResearch"><p>{children}</p></div>; }
const metricPageSize = 12;
const metricRowPageSize = 50;
function MetricTable({table, compact}) {
  const [page, setPage] = useState(0);
  const count = compact ? 4 : metricRowPageSize;
  const current = Math.min(page, Math.max(0, Math.ceil(table.rows.length / count) - 1));
  const start = compact ? 0 : current * count;
  const rows = table.rows.slice(start, start + count);
  return <div className="metricTableScroll" role="region" aria-label={table.title} tabIndex={0}>
    <table className="metricTable"><caption>{table.title}</caption>
      <thead><tr>{table.columns.map((column, i) => <th key={i} scope="col"><RichText inline text={metricLabel(column)}/></th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={start + i}>{row.map((value, j) => j === 0
        ? <th key={j} scope="row" title={String(value)}><RichText inline text={metricLabel(value)}/></th>
        : <td key={j} title={value === undefined ? 'Not recorded' : JSON.stringify(value)}>{typeof value === 'string' ? <RichText inline text={value}/> : value === undefined || value === null ? '—' : metricValue(value)}</td>)}</tr>)}</tbody>
    </table>
    {table.rows.length > count && <div data-feedback-exclude>
      <small>Rows {start + 1}–{start + rows.length} of {table.rows.length}</small>
      {!compact && <><button className="textButton" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous rows</button><button className="textButton" disabled={start + count >= table.rows.length} onClick={() => setPage(current + 1)}>Next rows</button></>}
    </div>}
  </div>;
}
// Detailed metrics can contain tens of thousands of records. Typing in the chat
// must neither normalize them again nor mount the entire record set as tables.
export const Metrics = React.memo(function Metrics({metrics, compact = false, status}) {
  const tables = useMemo(() => metricTables(metrics), [metrics]);
  const [page, setPage] = useState(0);
  const [exactOpen, setExactOpen] = useState(false);
  const exact = useMemo(() => exactOpen ? JSON.stringify(metrics, null, 2) : '', [metrics, exactOpen]);
  if (!tables.length) return compact
    ? <p className="pendingMetrics">{status === 'running' || status === 'queued' ? 'Measurements pending.' : 'No metrics recorded.'}</p>
    : <Empty>No metrics recorded yet.</Empty>;
  const current = Math.min(page, Math.max(0, Math.ceil(tables.length / metricPageSize) - 1));
  const start = current * metricPageSize;
  const shown = compact ? [tables.find(table => table.comparison) || tables[0]] : tables.slice(start, start + metricPageSize);
  return <div className={'researchMetrics' + (compact ? ' compactMetrics' : '')}>
    {shown.map((table, index) => <MetricTable key={(compact ? 0 : start) + index} table={table} compact={compact}/>)}
    {compact ? <small>Rounded display · full metrics and procedure on Methods</small> : <>
      {tables.length > metricPageSize && <div data-feedback-exclude>
        <small>Tables {start + 1}–{start + shown.length} of {tables.length}</small>
        <button className="textButton" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous tables</button>
        <button className="textButton" disabled={start + metricPageSize >= tables.length} onClick={() => setPage(current + 1)}>Next tables</button>
      </div>}
      <details onToggle={event => setExactOpen(event.currentTarget.open)}><summary>Exact recorded values</summary>{exactOpen && <pre>{exact}</pre>}</details>
    </>}
  </div>;
});
function ExperimentDetails({run}) {
  if (!run) return <Empty>Select a trial to inspect its procedure.</Empty>;
  const method = run.method && typeof run.method === 'object' && !Array.isArray(run.method) ? run.method : {};
  return <div className="experimentProcedure">{Object.keys(method).length ? Object.entries(method).map(([key, value]) => <section key={key}><h4><RichText inline text={metricLabel(key)}/></h4>{Array.isArray(value) ? <ol>{value.map((step, i) => <li key={i}><RichText text={typeof step === 'string' ? step : JSON.stringify(step)}/></li>)}</ol> : <RichText text={typeof value === 'string' ? value : JSON.stringify(value)}/>}</section>) : <p>No procedure outline was recorded for this trial. Its saved parameters remain in Trial record.</p>}</div>;
}

function trialDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
}
function TrialControls({run, cancelRun, runError}) {
  return <>{run.error && <p role="alert" className="renderError">{run.error}</p>}{run.cancellable ? <button className="lightBtn" onClick={() => cancelRun(run.id)}>Cancel trial</button> : run.status === 'running' && <p className="paneHint">Stop this task in its assistant chat or external tracker.</p>}{runError && <p role="alert" className="renderError">{runError}</p>}</>;
}

export function ResearchLeft({Pane, tab, project, selectedRun, selectRun}) {
  const view = researchView(project);
  const question = project?.manifest?.hypothesis || project?.manifest?.researchQuestion;
  if (tab === 'Methods') return <><Pane title="Trial ledger"><p className="paneHint trialLedgerHint">{view.runs.length} recorded · Up/Down to select, Home/End to jump</p>{view.runs.length ? <div className="trialLedger" role="group" aria-label="Trial ledger" onKeyDown={event => navigateItems(event, '[data-trial-item]', {activate: true})}>{view.runs.map(run => <button data-trial-item="" tabIndex={run.id === (selectedRun?.id || view.runs[0]?.id) ? 0 : -1} key={run.id} aria-pressed={run.id === selectedRun?.id} className={run.id === selectedRun?.id ? 'selected' : ''} onClick={() => selectRun(run.id)}><span className="trialHeading"><b><RichText inline text={runTitle(run)}/></b><span className="trialStatus">{run.status}</span></span>{run.experiment && <small className="trialExperiment"><RichText inline text={run.experiment}/></small>}<span className="trialMeta"><code>{run.id}</code><time dateTime={run.startedAt || undefined}>{trialDate(run.startedAt)}</time></span></button>)}</div> : <Empty>No trials recorded yet. Ask the assistant to run an experiment and record its results.</Empty>}</Pane><Pane feedback title="Experiment outline"><div className="researchBrief experimentOutline">{question && <section><h3>Research question</h3><RichText text={question}/></section>}<ExperimentDetails run={selectedRun || view.runs[0]}/></div></Pane></>;
  const brief = executiveBrief(project);
  return <Pane feedback title="Study brief"><div className="studyBriefContent researchBrief executiveBrief"><small>EXECUTIVE TAKEAWAY</small>{brief.authored ? <AnnotatedContent target={{kind:'summary'}} source={brief.text} title="Study brief" tabIndex={0} aria-label="Summary annotation surface"><RichText text={brief.text}/></AnnotatedContent> : <p>{brief.text}</p>}<p className="paneHint">Evidence and exact measurements are in Methods and the figures.</p></div></Pane>;
}

export function ResearchMiddle({Pane, tab, project, selectedRun, apiBase, cancelRun, runError}) {
  const latest = selectedRun || project?.runs?.[0];
  if (tab === 'Methods') return <Pane feedback title="Trial record">{latest ? <div className="researchBrief trialRecord"><h3><RichText inline text={runTitle(latest)}/></h3><dl><dt>Experiment</dt><dd>{latest.experiment || 'Not recorded'}</dd><dt>Status</dt><dd>{latest.status}</dd><dt>Started</dt><dd>{trialDate(latest.startedAt)}</dd><dt>Finished</dt><dd>{trialDate(latest.completedAt)}</dd><dt>Tracker</dt><dd>{latest.source?.adapter || 'native'}</dd></dl>{latest.summary && <RichText text={latest.summary}/>}<div data-feedback-exclude><TrialControls run={latest} cancelRun={cancelRun} runError={runError}/></div><h4>Recorded metrics</h4><Metrics metrics={latest.metrics}/><details><summary>Parameters and environment</summary><pre>{JSON.stringify({parameters: latest.parameters || {}, environment: latest.environment || {}}, null, 2)}</pre></details><details><summary>Artifacts · {latest.artifacts?.length || 0}</summary>{latest.artifacts?.length ? <ul>{latest.artifacts.map((item, i) => <li key={i}><code>{typeof item === 'string' ? item : item.path}</code></li>)}</ul> : <p>No artifact paths recorded.</p>}</details></div> : <Empty>Select a trial to inspect its recorded results.</Empty>}</Pane>;

  return <Pane title="Results and artifacts"><FigureGallery projectRoot={project?.root} key={project?.root} artifacts={project?.artifacts} runs={project?.runs} apiBase={apiBase}/></Pane>;
}
