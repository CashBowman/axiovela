import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {_electron as electron} from 'playwright-core';
const root=process.cwd(),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-interaction-')),home=path.join(tmp,'home'),project=path.join(tmp,'project');
const evidence=process.env.PERF_EVIDENCE||path.join(root,'.local/interaction-20260916'),label=process.env.PERF_LABEL||'current';
await fs.mkdir(evidence,{recursive:true});
const env={...process.env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local'),XDG_CONFIG_HOME:home,XDG_CACHE_HOME:home,AXIOVELA_DESKTOP_PROFILE:path.join(tmp,'profile')};
for(const directory of [home,env.APPDATA,env.LOCALAPPDATA])await fs.mkdir(directory,{recursive:true});
for(const key of Object.keys(env))if(/^(WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$|NODE_PATH$)/.test(key))delete env[key];
await fs.writeFile(path.join(tmp,'codex.mjs'),await fs.readFile('scripts/fixtures/assistant-rpc.mjs'));env.WORKBENCH_CODEX_PATH=path.join(tmp,'codex.mjs');
const paragraph=i=>`### Step ${i}\n\nThis sentence explains the argument and its assumptions. The bound is $\\|x\\|^2 \\leq C \\sum_{j=1}^n x_j^2$ and the conclusion remains conditional.\n\n$$\\int_0^1 f(t)\\,dt = \\sum_{k=1}^n a_k.$$\n`;
const document=Array.from({length:70},(_,i)=>paragraph(i)).join('\n');
let app,page,cdp;const errors=[];let modelCalls=0;
try{
 const binary=process.env.AXIOVELA_PERF_BINARY;
 app=await electron.launch({executablePath:binary||(await import('electron')).default,args:[...(binary?[]:[root]),...(process.platform==='linux'?['--ozone-platform=x11']:[])],env,chromiumSandbox:true});
 page=await app.firstWindow();
 await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1560,1000);});
page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/assistant')modelCalls++;});
 await page.getByRole('button',{name:'Project',exact:true}).waitFor();
 await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('textbox',{name:'Project folder'}).fill(project);await page.getByRole('button',{name:'Open or create',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await fs.writeFile(path.join(project,'writeups/main.md'),document);
 for(let i=0;i<24;i++){
  const id='assistant-perf-'+String(i).padStart(8,'0'),startedAt=new Date(Date.UTC(2026,0,1,0,i)).toISOString();
  await fs.mkdir(path.join(project,'assistant',id),{recursive:true});
  await fs.writeFile(path.join(project,'assistant',id,'job.json'),JSON.stringify({id,projectRoot:project,role:'writing',conversationId:'legacy-writing',message:'Explain part '+i,output:Array.from({length:6},(_,j)=>paragraph(i*6+j)).join('\n'),status:'complete',events:[],startedAt,completedAt:startedAt}));
 }
 await page.reload();await page.waitForFunction(()=>document.querySelector('select[aria-label="Conversation"]')?.disabled===false);
 await page.getByRole('button',{name:'Write-up',exact:true}).click();await page.getByRole('button',{name:'Markdown',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.chat .katex').length>=288&&document.querySelectorAll('.articleScroll .katex').length>=140);
 const composer=page.getByRole('textbox',{name:'Research Assistant message'}),surface=page.getByLabel('Rendered write-up annotation surface');
 cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 await composer.focus();await page.evaluate(()=>{window.retainedChat=document.querySelector('.chat .katex');window.retainedDocument=document.querySelector('.articleScroll .katex');});
 let start=performance.now();await composer.pressSequentially('typing measurement');const chatMs=performance.now()-start;
 const before=await metrics();await page.waitForTimeout(1800);const after=await metrics();
 await surface.locator('p').first().scrollIntoViewIfNeeded();
 await page.evaluate(()=>{window.popoverFrames=[];window.watchPopover=true;const tick=()=>{const p=document.querySelector('.annotationPopover');if(p&&getComputedStyle(p).visibility!=='hidden'){const r=p.getBoundingClientRect();window.popoverFrames.push({left:r.left,top:r.top,width:r.width,height:r.height});}if(window.watchPopover)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 const expected=await surface.locator('p').first().evaluate(el=>{const node=el.firstChild,range=document.createRange();range.setStart(node,0);range.setEnd(node,20);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);const rect=range.getBoundingClientRect();el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:rect.left+2,clientY:rect.top+2}));const full=document.createRange();full.setStart(node,0);full.setEnd(node,node.textContent.indexOf('.')+1);const r=[...full.getClientRects()].at(-1);return {left:r.left,top:r.top,height:r.height};});
 const feedback=page.getByRole('textbox',{name:'Annotation feedback'});await feedback.waitFor();await feedback.focus();
 start=performance.now();await feedback.pressSequentially('annotation measurement');const annotationMs=performance.now()-start;await page.waitForTimeout(500);
 const observed=await page.evaluate(()=>{window.watchPopover=false;return {retainedChat:window.retainedChat===document.querySelector('.chat .katex'),retainedDocument:window.retainedDocument===document.querySelector('.articleScroll .katex'),frames:window.popoverFrames};});
 const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(evidence,`input-${label}.cpuprofile`),JSON.stringify(profile));
 const first=observed.frames[0],drift=observed.frames.reduce((d,r)=>Math.max(d,Math.abs(r.left-first.left),Math.abs(r.top-first.top)),0);
 const result={fixture:{turns:24,chatEquations:288,documentSections:70,window:{width:1560,height:1000}},chatCharacters:18,annotationCharacters:22,chatTypingMs:Math.round(chatMs),annotationTypingMs:Math.round(annotationMs),idleTaskMs:Math.round(1000*(after.TaskDuration-before.TaskDuration)),...observed,expected,firstVisibleDriftPx:drift,errors,modelCalls};
 await fs.writeFile(path.join(evidence,`input-${label}.json`),JSON.stringify(result,null,2));await page.screenshot({path:path.join(evidence,`input-${label}.png`)});console.log(JSON.stringify({...result,frames:result.frames.length}));
 assert.deepEqual(errors,[]);assert.equal(modelCalls,0);
 if(process.env.PERF_ASSERT==='1'){assert.ok(observed.retainedChat&&observed.retainedDocument);assert.ok(chatMs<1500&&annotationMs<1500);assert.ok(drift<2,'Popover shifted after first visible frame');assert.ok(Math.abs(first.left-Math.max(12,Math.min(1560-332,expected.left)))<2);}
 await page.keyboard.press('Escape');assert.equal(await page.locator('.annotationPopover').count(),0);
 if(process.env.PERF_ASSERT==='1'){
  const bib=title=>'@article{fixture, author={Tester, Ada}, title={'+title+'}, year={2026}}';
  const saveBib=async title=>{await page.getByRole('button',{name:'Bibliography',exact:true}).click();await page.getByRole('textbox',{name:'Bibliography source'}).fill(bib(title));await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});};
  await saveBib('Initial bibliography title');
  await page.getByRole('textbox',{name:'Write-up source',exact:true}).fill('Updated source with $z^4$ and [@fixture].');
  await surface.getByText('Initial bibliography title',{exact:false}).waitFor();
  await saveBib('Revised bibliography title');
  await surface.getByText('Revised bibliography title',{exact:false}).waitFor();
  assert.match(await surface.innerText(),/Updated source/);
  await fs.mkdir(path.join(project,'artifacts/figures'),{recursive:true});
  const figure=path.join(project,'artifacts/figures/perf.svg');
  await fs.writeFile(figure,'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="skyblue"/></svg>');
  await page.getByRole('textbox',{name:'Write-up source',exact:true}).fill('![Fixture figure](artifacts/figures/perf.svg)');
  const img=surface.locator('img');await img.waitFor();
  await page.waitForFunction(()=>document.querySelector('.articleScroll img')?.src.includes('&v='));
  const firstUrl=await img.getAttribute('src');
  await fs.writeFile(figure,'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="steelblue"/></svg>');
  await page.waitForFunction(old=>document.querySelector('.articleScroll img')?.getAttribute('src')!==old,firstUrl);
  await page.waitForFunction(()=>document.querySelector('.articleScroll img')?.naturalHeight===160);
  const box=await img.boundingBox();
  await surface.getByRole('button',{name:'Add feedback on Fixture figure'}).click();await feedback.waitFor();
  const popupBox=await page.locator('.annotationPopover').boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  assert.ok(Math.abs(popupBox.x-Math.max(12,Math.min(viewport.width-332,box.x)))<2);
  assert.ok(Math.abs(popupBox.y-Math.max(12,Math.min(viewport.height-230,box.y+box.height+10)))<2);
  await page.keyboard.press('Escape');
  assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
  console.log('Source, bibliography and same-path image invalidation, plus figure popup positioning passed.');
 }

}catch(error){console.error(error, errors, await page?.locator('body').innerText());await page?.screenshot({path:path.join(evidence,'failure.png')});throw error;}finally{await app?.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app?.close();await fs.rm(tmp,{recursive:true,force:true});}
