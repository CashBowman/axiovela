import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const root=process.cwd();
await fs.mkdir('.local',{recursive:true});
const temp=await fs.mkdtemp(path.join(root,'.local/pdf-selection-'));
let server,browser;
const results=[];
try {
  if(process.env.PDF_ANNOTATION_FIXTURE) await fs.copyFile(process.env.PDF_ANNOTATION_FIXTURE,path.join(temp,'math-annotations.pdf'));
  else execFileSync(process.env.WORKBENCH_LATEX_PATH||path.join(root,'desktop/tools/tectonic'),['--untrusted','--outdir',temp,path.join(root,'scripts/fixtures/math-annotations.tex')]);
  const css=await fs.access('src/workspace.css').then(()=>'/src/workspace.css',()=>'/src/library.css');
  await fs.writeFile(path.join(temp,'index.html'),'<div id="root"></div><script type="module" src="./fixture.jsx"></script>');
  await fs.writeFile(path.join(temp,'fixture.jsx'),`import React,{useMemo,useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import PdfReader from '/src/PdfReader.jsx';
import '/src/style.css'; import '${css}'; import '/src/annotations.css';
function Fixture(){
 const [draft,setDraft]=useState(null),[notes,setNotes]=useState([]),[text,setText]=useState('');
 const capture=useCallback(a=>{window.captured=a;setDraft(a)},[]);
 const annotation=useMemo(()=>({annotating:true,annotations:notes,draft,onCapture:capture,onSelect:()=>{},onDraftRect:()=>{}}),[notes,draft]);
 window.testNotes=notes;
 return <><div style={{height:'80vh',display:'flex'}}><PdfReader url="./math-annotations.pdf" annotation={annotation}/></div>
 <textarea aria-label="Feedback" value={text} onChange={e=>setText(e.target.value)}/>
 <button onClick={()=>{setNotes([...notes,{id:String(notes.length+1),number:notes.length+1,anchor:draft}]);setDraft(null)}}>Save selection</button></>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`);
  server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:0},esbuild:{jsx:'transform'}});await server.listen();
  browser=await chromium.launch();
  for(const dpr of [1,2]) {
    const context=await browser.newContext({viewport:{width:1100,height:1000},deviceScaleFactor:dpr});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(server.resolvedUrls.local[0]+path.relative(root,temp)+'/index.html');
    await page.locator('[data-page="1"] .textLayer span').first().waitFor();
    await page.evaluate(()=>{
      const layer=document.querySelector('[data-page="1"] .textLayer');
      const span=[...layer.querySelectorAll('span')].find(e=>e.textContent.includes('selected passage'));
      const node=span.firstChild,start=node.textContent.indexOf('selected passage'),range=document.createRange();
      range.setStart(node,start);range.setEnd(node,start+'selected passage'.length);
      const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
      span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.captured?.pdfRects?.length>0);
    assert.equal(await page.evaluate(()=>window.captured.quote),'selected passage');
    const first=await page.locator('.draftHighlight').first().boundingBox();assert.ok(first.width>5);
    await page.locator('[data-page="1"] canvas').evaluate(c=>window.originalCanvas=c);
    const started=Date.now();await page.getByLabel('Feedback',{exact:true}).pressSequentially('Equations should remain selected while typing.');
    const typingMs=Date.now()-started;
    assert.ok(typingMs<2500,'typing must remain responsive under 4x CPU throttling');
    assert.ok(await page.evaluate(()=>window.originalCanvas===document.querySelector('[data-page="1"] canvas')),'typing must not replace PDF canvas');
    await page.getByRole('button',{name:'Save selection',exact:true}).click();
    await page.locator('.passageHighlight:not(.draftHighlight)').first().waitFor();
    const rect=await page.evaluate(()=>window.testNotes[0].anchor.pdfRects[0]);
    await page.getByRole('button',{name:'Zoom in PDF',exact:true}).click();
    await page.waitForFunction(r=>{
      const box=document.querySelector('[data-page="1"]').getBoundingClientRect(),mark=document.querySelector('.passageHighlight').getBoundingClientRect();
      return Math.abs(mark.width/box.width-r[2])<.0001;
    },rect);
    // A page can unload its text layer while the saved geometry remains available.
    await page.getByLabel('PDF page number',{exact:true}).fill('5');
    await page.waitForFunction(()=>!document.querySelector('[data-page="1"] canvas'));
    await page.getByLabel('PDF page number',{exact:true}).fill('1');
    await page.locator('[data-page="1"] canvas').waitFor();
    assert.equal(await page.locator('[data-page="1"] .passageHighlight').count(),1);
    await page.getByRole('button',{name:'Select area',exact:true}).click();
    const region=page.locator('[data-page="1"] .pdfAreaSelection'), b=await region.boundingBox();
    // Select a math block with fractions, integrals and matrices.
    await page.mouse.move(b.x+b.width*.18,b.y+b.height*.16);await page.mouse.down();
    await page.mouse.move(b.x+b.width*.52,b.y+b.height*.36,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>window.captured?.kind==='pdf-region');
    assert.equal(await page.locator('.draftHighlight').count(),1);
    await page.getByLabel('Feedback',{exact:true}).fill('Review the selected equation region.');
    await page.getByRole('button',{name:'Save selection',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.testNotes[1].anchor.kind),'pdf-region');
    assert.equal(await page.locator('[data-page="1"] .passageHighlight').count(),2);
    // A canceled drag must never replace the current annotation.
    await page.getByRole("button",{name:"Select area",exact:true}).click();
    const before=await page.evaluate(()=>JSON.stringify(window.captured));
    await page.mouse.move(b.x+30,b.y+30);await page.mouse.down();await page.mouse.move(b.x+100,b.y+100);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.captured)),before);
    await page.screenshot({path:path.join(temp,'math-selection-'+dpr+'.png')});
    assert.deepEqual(errors,[]);results.push({deviceScaleFactor:dpr,cpuThrottle:4,typingMs,exactText:true,geometryAfterZoomAndUnload:true,areaSelection:true,cancel:true});
    await context.close();
  }
  await fs.writeFile('.local/pdf-annotations-validation.json',JSON.stringify({passed:true,results,fixture:temp},null,2));
  console.log(JSON.stringify({passed:true,results,fixture:temp}));
} finally {await browser?.close();await server?.close();}
