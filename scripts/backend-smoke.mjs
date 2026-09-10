import {spawn, execFile} from 'node:child_process';
import {mkdtemp, rm, writeFile, chmod, readFile, access, mkdir, realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sandbox = await mkdtemp(path.join(os.tmpdir(), 'ml-workbench-smoke-'));
const fakeTectonic = path.join(sandbox, 'tectonic.mjs');
const fakeCodex = path.join(repoRoot, 'scripts/fixtures/assistant-rpc.mjs');
const fakeProviderCli = path.join(repoRoot, 'scripts/fixtures/provider-cli.mjs');
const fakeHerdr = path.join(repoRoot, 'scripts/fixtures/herdr-cli.mjs');
const statePath = path.join(sandbox, 'state.json');
const port = 8877;
const base = `http://127.0.0.1:${port}`;
await writeFile(fakeTectonic, `#!/usr/bin/env node
import {basename, join} from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';
const args = process.argv.slice(2);
const outdir = args[args.indexOf('--outdir') + 1];
const source = args.at(-1);
const content = await readFile(source, 'utf8');
if ((content.match(/\\\\includegraphics/g) || []).length !== 2 || /\\\\includesvg/i.test(content) || /\\\\includegraphics(?:\\[[^\\]]*\\])?\\{[^}]+\\.svg\\}/i.test(content) || !content.includes('% artifacts/figures/root.svg') || !content.includes('.render-cache/') || !content.includes('\\\\usepackage{graphicx}')) process.exit(2);
await writeFile(join(outdir, basename(source, '.tex') + '.pdf'), 'smoke pdf');
await writeFile(join(outdir, basename(source, '.tex') + '.log'), 'smoke log');
`);
await chmod(fakeTectonic, 0o755);
const child = spawn(process.execPath, ['server/index.mjs'], {cwd: repoRoot, env: {...process.env, WORKBENCH_PORT: String(port), WORKBENCH_HOST: '127.0.0.1', WORKBENCH_STATE_PATH: statePath, WORKBENCH_LATEX_PATH: fakeTectonic, WORKBENCH_CODEX_PATH: fakeCodex, WORKBENCH_PI_PATH: fakeProviderCli, WORKBENCH_HERDR_PATH: fakeHerdr, WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(sandbox, 'private/providers.json'), OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', WORKBENCH_COMPATIBLE_API_KEY: '', ...Object.fromEntries(['CLAUDE', 'GEMINI', 'OPENCODE'].map(id => [`WORKBENCH_${id}_PATH`, path.join(sandbox, 'missing-cli')]))}, stdio: ['ignore', 'pipe', 'pipe']});
let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const stop = () => new Promise(resolve => {
  if (child.exitCode !== null) return resolve();
  child.once('close', resolve);
  child.kill('SIGTERM');
});
try {
  let health;
  for (let i = 0; i < 30; i += 1) {
    try { health = await fetch(`${base}/api/health`); if (health.ok) break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!health?.ok) throw new Error(`backend did not start: ${output}`);
  const blankProject = await (await fetch(`${base}/api/project`)).json();
  if (blankProject.root !== null || blankProject.hasResults || blankProject.runs.length || blankProject.artifacts.length) throw new Error('fresh launch did not open with an empty project chooser');
  await new Promise((resolve, reject) => execFile('git', ['init', '-b', 'main', sandbox], error => error ? reject(error) : resolve()));
  const createdPath = path.join(sandbox, 'created-project');
  const opened = await (await fetch(`${base}/api/project/open`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({path: createdPath, create: true})})).json();
  if (opened.root !== createdPath || opened.hasResults) throw new Error(`project switching failed: ${JSON.stringify(opened)}`);
  if (opened.infrastructure.collaboration.available) throw new Error('parent repository metadata leaked into the project');
  const gitInitialized = await (await fetch(`${base}/api/project/open`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({path: createdPath, create: false, initializeGit: true})})).json();
  if (!gitInitialized.infrastructure.collaboration.available || gitInitialized.infrastructure.collaboration.branch !== 'main' || gitInitialized.infrastructure.collaboration.remote) throw new Error(`standalone Git initialization failed: ${JSON.stringify(gitInitialized.infrastructure.collaboration)}`);
  const emptyWriteup = await (await fetch(`${base}/api/writeups/source?format=latex`)).json();
  if (emptyWriteup.exists) throw new Error('fresh project unexpectedly had a write-up');
  if (JSON.stringify(opened.writeups) !== JSON.stringify({latex: false, markdown: false})) throw new Error('Blank project draft indicators are incorrect');
  await writeFile(path.join(createdPath, 'writeups/research-writeup.md'), '# Legacy draft');
  const legacyPresence = await (await fetch(`${base}/api/project`)).json();
  if (!legacyPresence.writeups.markdown || legacyPresence.writeups.latex) throw new Error('Legacy draft presence was not detected');
  await writeFile(path.join(createdPath, 'writeups/main.md'), '  \n');
  const emptyPresence = await (await fetch(`${base}/api/project`)).json();
  if (emptyPresence.writeups.markdown) throw new Error('Whitespace primary source should match the empty editor, not its legacy fallback');
  const blankBibliography = await (await fetch(`${base}/api/bibliography`)).json();
  if (blankBibliography.entries.length) throw new Error('fresh project unexpectedly had citations');
  const bibtex = '@article{gauss1809, author={Gauss, Carl Friedrich}, title={Theoria motus corporum coelestium}, year={1809}}';
  const savedBibliography = await (await fetch(`${base}/api/bibliography`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({source: bibtex})})).json();
  if (savedBibliography.entries?.[0]?.id !== 'gauss1809') throw new Error(`BibTeX save failed: ${JSON.stringify(savedBibliography)}`);
  const infrastructure = await (await fetch(`${base}/api/infrastructure`)).json();
  if (infrastructure.config?.computeProfiles?.[0]?.type !== 'local' || infrastructure.config?.experimentTracking?.schemaVersion !== 'workbench.run/v1') throw new Error('default infrastructure config is invalid');
  const sshConfig = {...infrastructure.config, computeProfiles: [...infrastructure.config.computeProfiles, {id: 'cluster', label: 'Research cluster', type: 'slurm-ssh', host: 'research-cluster', projectRoot: '/work/project', partition: 'gpu'}]};
  const savedInfrastructure = await (await fetch(`${base}/api/infrastructure`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({config: sshConfig})})).json();
  if (!savedInfrastructure.config.computeProfiles.some(profile => profile.id === 'cluster')) throw new Error('remote compute profile was not saved');
  const blockedOrigin = await fetch(`${base}/api/bibliography`, {method: 'PUT', headers: {'content-type': 'text/plain', origin: 'https://untrusted.example'}, body: JSON.stringify({source: bibtex})});
  if (blockedOrigin.status !== 403) throw new Error(`untrusted origin mutation was not rejected: ${blockedOrigin.status}`);
  const guide = await (await fetch(`${base}/api/cli-guide`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Show the latest run status'})})).json();
  if (guide.kind !== 'cli-guide' || guide.action !== 'runs') throw new Error(`CLI guide did not return a run route: ${JSON.stringify(guide)}`);
  const capabilities = await (await fetch(`${base}/api/assistant/capabilities`)).json();
  if (capabilities.kind !== 'assistant-capabilities' || capabilities.modes.join(',') !== 'ask,auto,full' || !capabilities.agentic?.available || capabilities.agentic.requiredConnection !== 'pi') throw new Error('unexpected assistant permissions or agentic capability');
  const rendered = await (await fetch(`${base}/api/writeups/render`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({draftText: '\\[x^2 + y^2\\]'})})).json();
  if (!rendered.expressions?.[0]?.html?.includes('katex')) throw new Error('LaTeX backend render failed');
  const exported = await (await fetch(`${base}/api/writeups/export`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({format: 'latex', draftText: '\\documentclass{article}\\begin{document}Smoke\\end{document}', includedVisuals: []})})).json();
  if (exported.source !== 'writeups/research-writeup.tex') throw new Error(`unexpected write-up path: ${JSON.stringify(exported)}`);
  const figure = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12"/></svg>';
  const uploaded = await (await fetch(`${base}/api/artifacts/upload`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({name: 'dragged figure.svg', data: Buffer.from(figure).toString('base64')})})).json();
  if (!uploaded.artifact?.path?.startsWith('artifacts/figures/dragged-figure-') || uploaded.artifact.type !== 'png') throw new Error(`dragged figure upload failed: ${JSON.stringify(uploaded)}`);
  await writeFile(path.join(createdPath, 'artifacts', 'figures', 'root.svg'), figure);
  await writeFile(path.join(createdPath, 'writeups', 'local.svg'), figure);
  const compiled = await (await fetch(`${base}/api/writeups/compile`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({draftText: '\\documentclass{article}\\usepackage{svg}\\graphicspath{{../artifacts/figures/}}\\begin{document}% artifacts/figures/root.svg\\n\\includesvg[width=.8\\linewidth]{root}\\includegraphics{local.svg}\\end{document}'})})).json();
  if (compiled.status !== 'complete' || compiled.pdf !== 'exports/main.pdf') throw new Error(`LaTeX SVG compilation failed: ${JSON.stringify(compiled)}`);
  const originalPaper = await readFile(path.join(createdPath, 'writeups/main.tex'), 'utf8');
  const staleRender = await fetch(`${base}/api/writeups/compile`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({draftText: 'stale render', expectedSource: 'not the saved source'})});
  if (staleRender.status !== 409 || await readFile(path.join(createdPath, 'writeups/main.tex'), 'utf8') !== originalPaper) throw new Error('A stale render overwrote saved source');
  const chatRender = await (await fetch(`${base}/api/assistant/render`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({format: 'markdown', source: '# Research note\n\n**Readable** math: $x^2$.\n\n<script>unsafe()</script>'})})).json();
  if (chatRender.status !== 'complete' || !chatRender.html.startsWith('exports/chat-')) throw new Error('Chat Markdown render failed');
  const renderedResponse = await fetch(base + chatRender.url);
  const renderedHtml = await renderedResponse.text();
  if (!renderedResponse.ok || !renderedResponse.headers.get('content-security-policy')?.includes('sandbox') || !renderedHtml.includes('data:font/woff2;base64,') || !renderedHtml.includes('class="katex"') || renderedHtml.includes('<script>')) throw new Error('Chat document fonts, math, or safe HTML serving failed');
  const chatLatex = await (await fetch(`${base}/api/assistant/render`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({format: 'latex', source: originalPaper})})).json();
  if (chatLatex.status !== 'complete' || !chatLatex.pdf.startsWith('exports/chat-')) throw new Error('Chat LaTeX render failed');
  if (await readFile(path.join(createdPath, 'writeups/main.tex'), 'utf8') !== originalPaper) throw new Error('Chat rendering overwrote the paper');

  await access(path.join(createdPath, 'exports', 'main.pdf'));
  const commands = await (await fetch(`${base}/api/commands`)).json();
  if (commands.commands.length !== 1) throw new Error('unexpected command manifest');
  const approval = await (await fetch(`${base}/api/approvals`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({commandId: 'seed-matched-comparison'})})).json();
  const started = await (await fetch(`${base}/api/runs`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({commandId: 'seed-matched-comparison', approvalToken: approval.approvalToken})})).json();
  if (started.status !== 'running') throw new Error(`run did not start: ${JSON.stringify(started)}`);
  let record;
  for (let i = 0; i < 500; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
    record = await (await fetch(`${base}/api/runs/${started.id}`)).json();
    if (['complete', 'failed', 'canceled'].includes(record.status)) break;
  }
  if (record.status !== 'complete') throw new Error(`run did not complete: ${JSON.stringify(record)}`);
  const persisted = JSON.parse(await readFile(path.join(createdPath, 'runs', record.id, 'run.json'), 'utf8'));
  if (persisted.status !== 'complete' || 'child' in persisted) throw new Error(`persisted run record was not durable: ${JSON.stringify(persisted)}`);
  const ledger = await (await fetch(`${base}/api/runs`)).json();
  if (!ledger.runs?.some(run => run.id === record.id && run.status === 'complete')) throw new Error('completed run missing from ledger');
  const populatedProject = await (await fetch(`${base}/api/project`)).json();
  if (!populatedProject.hasResults || !populatedProject.artifacts.length || !populatedProject.latestMetrics) throw new Error('project summary did not discover completed results');
  const wandbFiles = path.join(createdPath, 'wandb', 'offline-run-20260903-external', 'files');
  await mkdir(wandbFiles, {recursive: true});
  await writeFile(path.join(wandbFiles, 'wandb-summary.json'), JSON.stringify({accuracy: 0.91}));
  const mlflowRun = path.join(createdPath, 'mlruns', '0', 'mlflow-smoke');
  await mkdir(path.join(mlflowRun, 'metrics'), {recursive: true});
  await writeFile(path.join(mlflowRun, 'meta.yaml'), 'run_id: mlflow-smoke\nstatus: 3\nstart_time: 1788465600000\nend_time: 1788465660000\n');
  await writeFile(path.join(mlflowRun, 'metrics', 'loss'), '1788465660000 0.125 2\n');
  const externalTrackingConfig = {...savedInfrastructure.config, experimentTracking: {...savedInfrastructure.config.experimentTracking, adapters: savedInfrastructure.config.experimentTracking.adapters.map(adapter => ({...adapter, enabled: true}))}};
  await fetch(`${base}/api/infrastructure`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({config: externalTrackingConfig})});
  const unified = await (await fetch(`${base}/api/runs`)).json();
  const imported = unified.runs.find(run => run.source?.adapter === 'wandb');
  if (imported?.schemaVersion !== 'workbench.run/v1' || imported.metrics.accuracy !== 0.91) throw new Error(`W&B adapter import failed: ${JSON.stringify(unified)}`);
  const importedMlflow = unified.runs.find(run => run.source?.adapter === 'mlflow');
  if (importedMlflow?.schemaVersion !== 'workbench.run/v1' || importedMlflow.metrics.loss !== 0.125) throw new Error(`MLflow adapter import failed: ${JSON.stringify(unified)}`);
  const nativeRun = path.join(createdPath, 'records', 'native-smoke');
  await mkdir(nativeRun, {recursive: true});
  await writeFile(path.join(nativeRun, 'run.json'), JSON.stringify({id: 'native-smoke', status: 'complete', startedAt: '2026-09-03T00:00:00.000Z'}));
  await writeFile(path.join(nativeRun, 'metrics.json'), JSON.stringify({accuracy: 0.95}));
  const customNative = {...externalTrackingConfig, experimentTracking: {...externalTrackingConfig.experimentTracking, adapters: externalTrackingConfig.experimentTracking.adapters.map(adapter => adapter.type === 'native' ? {...adapter, path: 'records'} : adapter)}};
  await fetch(`${base}/api/infrastructure`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({config: customNative})});
  const customUnified = await (await fetch(`${base}/api/runs`)).json();
  if (customUnified.runs.find(run => run.id === 'native-smoke')?.metrics.accuracy !== 0.95) throw new Error(`native adapter path was ignored: ${JSON.stringify(customUnified)}`);
  const competingApproval = await (await fetch(`${base}/api/approvals`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({commandId: 'seed-matched-comparison'})})).json();
  const researchParent = path.join(sandbox, 'Cloud Drive', 'Documents', 'Math Research');
  await mkdir(researchParent, {recursive: true});
  const delayedBibtex = '@article{projectGate2026, author={Workbench, ML Theory}, title={Project gate regression}, year={2026}}';
  const delayedBody = JSON.stringify({source: delayedBibtex});
  const encoder = new TextEncoder();
  const slowBibliographyRequest = fetch(`${base}/api/bibliography`, {
    method: 'PUT',
    headers: {'content-type': 'application/json', 'x-axiovela-project': encodeURIComponent(createdPath)},
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(delayedBody.slice(0, 12)));
        setTimeout(() => {
          controller.enqueue(encoder.encode(delayedBody.slice(12)));
          controller.close();
        }, 80);
      },
    }),
    duplex: 'half',
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  const assistantRequest = fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json', 'x-axiovela-project': encodeURIComponent(createdPath)}, body: JSON.stringify({message: `create a new project under ${path.join(sandbox, 'cloud drive', 'documents', 'math research')} called "regression_study."`, permissionMode: 'full'})});
  await new Promise(resolve => setTimeout(resolve, 10));
  const competingRunRequest = fetch(`${base}/api/runs`, {method: 'POST', headers: {'content-type': 'application/json', 'x-axiovela-project': encodeURIComponent(createdPath)}, body: JSON.stringify({commandId: 'seed-matched-comparison', approvalToken: competingApproval.approvalToken})});
  const competingProjectRequest = fetch(`${base}/api/project/open`, {method: 'POST', headers: {'content-type': 'application/json', 'x-axiovela-project': encodeURIComponent(createdPath)}, body: JSON.stringify({path: path.join(sandbox, 'competing-project'), create: true})});
  const [slowBibliographyResponse, assistantResponse, competingRunResponse, competingProjectResponse] = await Promise.all([slowBibliographyRequest, assistantRequest, competingRunRequest, competingProjectRequest]);
  if (!slowBibliographyResponse.ok) throw new Error(`in-flight bibliography write failed: ${slowBibliographyResponse.status}`);
  if (competingRunResponse.status !== 202) throw new Error(`captured-project run could not start: ${competingRunResponse.status}`);
  const competingRun = await competingRunResponse.json();
  if (competingRun.projectRoot !== createdPath) throw new Error('Queued request changed its project identity');
  if (!competingProjectResponse.ok) throw new Error(`project could not open beside an assistant: ${competingProjectResponse.status}`);
  const assistantStarted = await assistantResponse.json();
  const expectedAssistantRoot = path.join(researchParent, 'regression_study');
  if (!assistantStarted.projectCreated || assistantStarted.projectRoot !== expectedAssistantRoot || assistantStarted.output) throw new Error(`assistant project routing or initial output failed: ${JSON.stringify(assistantStarted)}`);
  await fetch(`${base}/api/project/open`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({path: expectedAssistantRoot, create: false})});
  const assistantRunning = await (await fetch(`${base}/api/assistant/${assistantStarted.id}`)).json();
  if (assistantRunning.output?.includes('private raw output') || 'diagnostics' in assistantRunning) throw new Error('assistant leaked streaming diagnostics');
  let assistantRecord = assistantRunning;
  for (let i = 0; i < 30 && assistantRecord.status === 'running'; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
    assistantRecord = await (await fetch(`${base}/api/assistant/${assistantStarted.id}`)).json();
  }
  if (assistantRecord.status !== 'complete' || assistantRecord.output !== 'Created the project scaffold and recorded the requested research plan.' || 'diagnostics' in assistantRecord) throw new Error(`assistant final response was not clean: ${JSON.stringify(assistantRecord)}`);
  if (!assistantRecord.events.some(event => event.label === 'Running a project command') || !assistantRecord.events.some(event => event.label === 'Updating project files') || assistantRecord.events.some(event => JSON.stringify(event).includes('private raw output'))) throw new Error(`assistant activity was not safely structured: ${JSON.stringify(assistantRecord.events)}`);
  const assistantHistory = await (await fetch(`${base}/api/assistant`)).json();
  if (!assistantHistory.jobs?.some(job => job.id === assistantRecord.id && job.status === 'complete')) throw new Error('assistant history did not survive outside in-memory chat state');
  // Live status can update before the queued atomic disk write completes.
  // Wait for persistence with a deadline, still failing if the final write is lost.
  let persistedAssistant;
  const persistenceDeadline = Date.now() + 5000;
  do {
    persistedAssistant = JSON.parse(await readFile(path.join(expectedAssistantRoot, 'assistant', assistantRecord.id, 'job.json'), 'utf8'));
    if (persistedAssistant.status !== 'running' || Date.now() >= persistenceDeadline) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (true);
  if (persistedAssistant.status !== 'complete' || 'diagnostics' in persistedAssistant) throw new Error(`assistant job was not safely persisted: ${JSON.stringify(persistedAssistant)}`);
  const choose = async (role, selection) => fetch(`${base}/api/assistant/preferences`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({role, selection})});
  const experimentSelection = {adapterId: 'codex', modelId: 'test-model', effort: 'high'};
  const writingSelection = {adapterId: 'codex', modelId: 'second-model', effort: 'low'};
  if (!(await choose('experiment', experimentSelection)).ok || !(await choose('writing', writingSelection)).ok) throw new Error('preferences could not be saved');
  const preferences = (await (await fetch(`${base}/api/assistant/capabilities`)).json()).preferences;
  if (preferences.experiment.effort !== 'high' || preferences.writing.modelId !== 'second-model') throw new Error('role preferences are not independent');
  const storedPreferences = JSON.parse(await readFile(path.join(expectedAssistantRoot, 'config/assistant.json'), 'utf8'));
  if (JSON.stringify(storedPreferences) !== JSON.stringify(preferences)) throw new Error('preferences were not persisted');
  if ((await choose('writing', {...writingSelection, effort: 'high'})).ok) throw new Error('unsupported effort accepted');
  const writingStarted = await (await fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'FIXTURE_STATE', role: 'writing', permissionMode: 'ask'})})).json();
  if (!(await choose('writing', writingSelection)).ok) throw new Error('Future-turn preferences could not change beside an active task');
  let writingRecord = writingStarted;
  for (let i = 0; i < 40 && writingRecord.status === 'running'; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    writingRecord = await (await fetch(`${base}/api/assistant/${writingStarted.id}`)).json();
  }
  if (writingRecord.status !== 'complete' || writingRecord.sessionId === assistantRecord.sessionId || writingRecord.effective.modelId !== 'second-model') throw new Error('writing session was not independent or correctly routed');
  const writingHistory = await (await fetch(`${base}/api/assistant?role=writing`)).json();
  if (writingHistory.jobs.length !== 1 || writingHistory.jobs[0].role !== 'writing') throw new Error('role history isolation failed');
  // Profiles persist without changing engine/model/effort, and switching one
  // opens a fresh native session while keeping the visible conversation.
  let previousProfileSession = writingRecord.sessionId;
  for (const [profileId, heading] of [['biology', 'Science & engineering'], ['data-science', 'Data science & machine learning'], ['math-statistics', 'Mathematics & statistics']]) {
    const saved = await fetch(`${base}/api/assistant/preferences`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({role: 'writing', profileId})});
    if (!saved.ok) throw new Error('research profile could not be saved');
    const prefs = (await saved.json()).preferences;
    if (prefs.writing.profileId !== profileId || prefs.writing.modelId !== 'second-model' || prefs.experiment.profileId !== 'general') throw new Error('profile changed unrelated preferences');
    const next = await (await fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'FIXTURE_PROMPT', role: 'writing', permissionMode: 'ask'})})).json();
    let record = next;
    for (let i = 0; i < 80 && record.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      record = await (await fetch(`${base}/api/assistant/${next.id}`)).json();
    }
    if (record.status !== 'complete' || record.sessionId === previousProfileSession || record.conversationId !== writingRecord.conversationId || !record.handoff) throw new Error('profile transition lost conversation or reused native session');
    const state = JSON.parse(record.output);
    if (!state.prompt.includes(`# ${heading}`) || state.sandbox !== 'read-only') throw new Error('profile missing from prompt or permissions elevated');
    previousProfileSession = record.sessionId;
  }
  for (const format of ['latex', 'markdown']) {
    const opposite = format === 'latex' ? 'markdown' : 'latex';
    const response = await fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'FIXTURE_PROMPT', role: 'experiment', newSession: true, permissionMode: 'ask', writeupFormat: opposite, defaultWriteupFormat: format})});
    let record = await response.json();
    if (!response.ok) throw new Error('initial write-up preference request failed');
    for (let i = 0; i < 80 && record.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      record = await (await fetch(`${base}/api/assistant/${record.id}`)).json();
    }
    const state = JSON.parse(record.output);
    const expected = format === 'latex' ? 'LaTeX source at writeups/main.tex' : 'Markdown source at writeups/main.md';
    if (record.status !== 'complete' || record.writeupFormat !== format || !state.prompt.includes(expected) || !state.prompt.includes('An explicit format request in the current user prompt takes precedence') || state.sandbox !== 'read-only') throw new Error('initial write-up format routing or permission preservation failed');
  }
  const invalidProfile = await fetch(`${base}/api/assistant/preferences`, {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({role: 'writing', profileId: '../untrusted'})});
  if (invalidProfile.ok) throw new Error('arbitrary profile path was accepted');
  const cancelStarted = await (await fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Inspect the project, then summarize it.', permissionMode: 'ask'})})).json();
  const cancelResponse = await (await fetch(`${base}/api/assistant/${cancelStarted.id}/cancel`, {method: 'POST'})).json();
  if (cancelResponse.status !== 'canceled' || !cancelResponse.events.some(event => event.label === 'Cancellation requested')) throw new Error(`assistant cancellation was not explicit: ${JSON.stringify(cancelResponse)}`);
  await new Promise(resolve => setTimeout(resolve, 180));
  const canceledRecord = await (await fetch(`${base}/api/assistant/${cancelStarted.id}`)).json();
  if (canceledRecord.status !== 'canceled' || canceledRecord.output) throw new Error(`canceled assistant returned an unexpected final response: ${JSON.stringify(canceledRecord)}`);
  // A stale saved/UI selection must not override the authoritative Agentic toggle.
  const enabled = await fetch(`${base}/api/assistant/agentic/enable`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({projectRoot: (await (await fetch(`${base}/api/project`)).json()).root})});
  if (!enabled.ok || !(await enabled.json()).agentic.available) throw new Error('Agentic enable endpoint failed');
  const staleEnable = await fetch(`${base}/api/assistant/agentic/enable`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({projectRoot: '/wrong-project'})});
  if (staleEnable.status !== 409) throw new Error('Stale project must not start Herdr');
  const agenticStarted = await (await fetch(`${base}/api/assistant`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'Split two independent changes between workers.', role: 'experiment', permissionMode: 'full', agenticMode: true, selection: {adapterId: 'codex', modelId: '', effort: ''}})})).json();
  let agenticRecord = agenticStarted;
  for (let i = 0; i < 40 && agenticRecord.status === 'running'; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    agenticRecord = await (await fetch(`${base}/api/assistant/${agenticStarted.id}`)).json();
  }
  const agenticOutput = JSON.parse(agenticRecord.output || '{}');
  if (agenticRecord.status !== 'complete' || !agenticRecord.agenticMode || agenticRecord.selection?.adapterId !== 'pi' || !agenticOutput.lastPrompt?.includes('AGENTIC MODE (authoritative)') || !agenticOutput.lastPrompt?.includes('at most 3 workers') || !agenticOutput.lastPrompt?.includes('axiovela-') || !agenticRecord.agenticActivity?.checkedAt || agenticRecord.agenticActivity.workers.length || agenticRecord.usage?.tokens?.input !== 1200) throw new Error(`agentic Pi routing contract failed: ${JSON.stringify(agenticRecord)}`);
  if (!(await readFile(path.join(createdPath, 'references.bib'), 'utf8')).includes('projectGate2026')) throw new Error('in-flight bibliography write crossed into the newly activated project');
  const newProjectBibliography = await (await fetch(`${base}/api/bibliography`)).json();
  if (newProjectBibliography.entries.length || newProjectBibliography.source.includes('projectGate2026')) throw new Error('new project inherited an in-flight bibliography mutation');
  await access(path.join(expectedAssistantRoot, 'workflows', 'workbench_tracking.py'));
  const assistantManifest = JSON.parse(await readFile(path.join(expectedAssistantRoot, 'workbench.project.json'), 'utf8'));
  if (assistantManifest.name !== 'regression_study') throw new Error('new project manifest was not created');
  const assistantGit = await new Promise((resolve, reject) => execFile('git', ['-C', expectedAssistantRoot, 'rev-parse', '--show-toplevel'], (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
  const actualGitRoot = await realpath(path.resolve(assistantGit));
  const expectedGitRoot = await realpath(path.resolve(expectedAssistantRoot));
  const independentGit = process.platform === 'win32' ? actualGitRoot.toLocaleLowerCase() === expectedGitRoot.toLocaleLowerCase() : actualGitRoot === expectedGitRoot;
  if (!independentGit) throw new Error('chat-created project was not an independent Git repository');
  const storedState = JSON.parse(await readFile(statePath, 'utf8'));
  if (storedState.projectRoot !== expectedAssistantRoot) throw new Error('last intentional project was not persisted');
  const isolationPolicy = await new Promise((resolve, reject) => execFile(process.execPath, [path.join(expectedAssistantRoot, 'workflows', 'run-isolated-command.mjs'), '--print-policy'], {cwd: expectedAssistantRoot, env: {...process.env, WORKBENCH_PROJECT_ROOT: expectedAssistantRoot}}, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout))));
  if (isolationPolicy.network !== 'none' || isolationPolicy.rootFilesystem !== 'read-only' || isolationPolicy.hostMounts.length) throw new Error(`isolated command policy is unsafe: ${JSON.stringify(isolationPolicy)}`);
  const launcherHelp = await new Promise((resolve, reject) => execFile(process.execPath, ['bin/ml-workbench.mjs', '--help'], {cwd: repoRoot}, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout)));
  if (!launcherHelp.includes('axiovela new /path/to/project') || !launcherHelp.includes('legacy ml-workbench')) throw new Error('global launcher help is incomplete');
  console.log(JSON.stringify({
    kind: 'backend-smoke-evidence',
    runner: {id: record.id, status: record.status, persisted: persisted.status, artifacts: record.artifacts.length},
    writeup: {compiled: compiled.status, pdf: compiled.pdf},
    adapters: {native: customUnified.runs.some(run => run.id === 'native-smoke'), wandb: Boolean(imported), mlflow: Boolean(importedMlflow)},
    activation: {projectRoot: assistantStarted.projectRoot, inFlightWriteStatus: slowBibliographyResponse.status, competingRunStatus: competingRunResponse.status, competingProjectStatus: competingProjectResponse.status},
    assistant: {status: assistantRecord.status, events: assistantRecord.events.length, history: assistantHistory.jobs.length, cancellation: canceledRecord.status},
    project: {blankStart: blankProject.root === null, gitInitialized: independentGit},
    isolation: {network: isolationPolicy.network, rootFilesystem: isolationPolicy.rootFilesystem}
  }));
} finally {
  await stop();
  await rm(sandbox, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
