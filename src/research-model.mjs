// Human labels never replace the stable identifiers used by the runner.
export function humanTitle(value = '') {
  const label = String(value).split(/[\\/]/).at(-1).replace(/\.[a-z0-9]+$/i, '')
    .replace(/\d{8}[-_]\d{6}/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return label ? label[0].toUpperCase() + label.slice(1) : 'Untitled';
}

export function metricValue(value) {
  if (typeof value !== 'number') return typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 100000 || absolute < 0.0001)) return value.toExponential(3);
  return Number(value.toPrecision(4)).toString();
}

export function progressValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  const bounded = Math.max(0, Math.min(100, numeric));
  return Number.isInteger(bounded) ? String(bounded) : Number(bounded.toFixed(1)).toString();
}

export function runTitle(run) { return run?.name || run?.title || humanTitle(run?.id); }
export function figureTitle(artifact) { return artifact?.title || humanTitle(artifact?.name || artifact?.path); }

export function researchView(project = {}) {
  const runs = project?.runs || [];
  const artifacts = project?.artifacts || [];
  const brief = project?.research || {};
  const byId = new Map(runs.map(run => [run.id, run]));
  const findings = (Array.isArray(brief.findings) ? brief.findings : []).filter(item => item && typeof item.text === 'string').map(item => {
    const runIds = Array.isArray(item.runIds) ? item.runIds.filter(id => typeof id === 'string') : [];
    return {...item, runs: runIds.filter(id => byId.has(id)), missingEvidence: !runIds.length || runIds.some(id => !byId.has(id))};
  });
  const completedRuns = runs.filter(run => run.status === 'complete');
  const automatic = !(typeof brief.summary === 'string' && brief.summary.trim());
  const latest = completedRuns[0];
  const fallback = latest ? (latest.summary || `Latest completed experiment: **${runTitle(latest)}**. ${Object.keys(latest.metrics || {}).length ? 'Its recorded measurements are summarized below.' : 'No measurements have been recorded for this run.'}`) : '';
  const updatedAt = Date.parse(brief.updatedAt);
  const now = Date.now();
  return {runs, artifacts, automatic, findings: findings.length ? findings : completedRuns.filter(run => run.summary).map(run => ({text: run.summary, runs: [run.id], missingEvidence: false})), summary: automatic ? fallback : brief.summary,
    limitations: (Array.isArray(brief.limitations) ? brief.limitations : []).filter(x => typeof x === 'string'),
    nextSteps: (Array.isArray(brief.nextSteps) ? brief.nextSteps : []).filter(x => typeof x === 'string'),
    completed: runs.filter(run => run.status === 'complete').length,
    active: runs.filter(run => ['running', 'queued'].includes(run.status)).length,
    failed: runs.filter(run => run.status === 'failed').length,
    stale: !automatic && Number.isFinite(updatedAt) && updatedAt <= now && completedRuns.some(run => { const completedAt = Date.parse(run.completedAt); return Number.isFinite(completedAt) && completedAt <= now && completedAt > updatedAt; }),
  };
}

// Repair legacy Markdown links containing unescaped spaces, but never rewrite code.
export function chatMarkdown(source, projectRoot = '') {
  const root = projectRoot.replaceAll('\\', '/').replace(/\/$/, '');
  return String(source).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(/(!?\[)([^\]\n]+)\]\(([^\n]+?)\)/g, (all, start, label, target) => {
      const normalized = target.replaceAll('\\', '/').replace(/^<|>$/g, '');
      const relative = root && normalized.startsWith(root + '/') ? normalized.slice(root.length + 1) : normalized.replace(/^\.\.?\//, '');
      if (!/^(artifacts\/figures|exports)\//.test(relative) || relative.split('/').includes('..')) return all;
      return `${start}${humanTitle(label)}](${encodeURI(relative).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16))})`;
    });
  }).join('');
}
