import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const fixture = `
import React,{useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import MarkdownPreview from '/src/MarkdownPreview.jsx';
import {capturePassage,textProjection,hasContentMutation} from '/src/annotation-dom.mjs';
window.annotations={capturePassage,textProjection,hasContentMutation};
function Fixture(){
 const [state,set]=useState({source:'A sentence with $x^2$. [Reference](#source)\\n\\n![Figure](figure.svg)',revision:0,callback:0,inline:false});
 window.updateFixture=patch=>set(s=>({...s,...patch}));
 const assetUrl=useCallback(src=>'/'+src+'?revision='+state.revision,[state.revision]);
 return React.createElement(MarkdownPreview,{source:state.source,inline:state.inline,assetUrl,onSourceLine:line=>window.lastSource=[state.callback,line],onLink:href=>{window.lastLink=[state.callback,href];return true;}});
}
createRoot(document.getElementById('fixture')).render(React.createElement(Fixture));`;
const server=await createServer({optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0},appType:'custom',plugins:[{name:'interaction-fixture',configureServer(server){server.middlewares.use('/figure.svg',(req,res)=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="skyblue"/></svg>');});server.middlewares.use('/fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/fixture','<!doctype html><div id="fixture"></div><script type="module" src="/interaction-fixture.jsx"></script>'));});},resolveId(id){if(id==='/interaction-fixture.jsx')return '\0interaction-fixture.jsx';},load(id){if(id==='\0interaction-fixture.jsx')return fixture;}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('console',m=>{if(m.type()==='error')console.error(m.text());});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 page.setDefaultTimeout(10000);await page.goto(server.resolvedUrls.local[0]+'fixture');await page.locator('.katex').first().waitFor();
 await page.evaluate(()=>window.originalMath=document.querySelector('.katex'));
 await page.evaluate(()=>window.updateFixture({callback:7}));await page.locator('a').click();await page.locator('p').first().dblclick();
 assert.deepEqual(await page.evaluate(()=>window.lastLink),[7,'#source']);assert.deepEqual(await page.evaluate(()=>window.lastSource),[7,1]);
 assert.ok(await page.evaluate(()=>window.originalMath===document.querySelector('.katex')),'callback changes preserve math DOM');
 await page.evaluate(()=>window.updateFixture({revision:2}));await page.waitForFunction(()=>document.querySelector('img').getAttribute('src').endsWith('revision=2'));
 await page.evaluate(()=>window.updateFixture({source:'Changed citation [Updated reference](#updated). $y^3$'}));await page.getByText('Updated reference').waitFor();assert.match(await page.locator('math annotation').textContent(),/y\^3/);
 await page.evaluate(()=>window.updateFixture({source:'Streaming grows: $y^3$ then $z^4$'}));await page.waitForFunction(()=>document.querySelectorAll('.katex').length===2);assert.equal(await page.locator('.katex').count(),2);
 await page.evaluate(()=>window.updateFixture({inline:true}));await page.waitForFunction(()=>document.querySelector('.markdownPreview').tagName==='SPAN');assert.equal(await page.locator('.markdownPreview p').count(),0);
 // Text projection preserves paragraph boundaries and ignores its own decorations.
 const projection=await page.evaluate(()=>{
  const root=document.createElement('div');root.innerHTML='<p>First sentence. Second sentence.</p><p>Another paragraph.</p><div data-annotation-ui><span>overlay</span></div>';document.body.append(root);
  const p=window.annotations.textProjection(root),r=document.createRange();r.setStart(root.firstChild.firstChild,4);r.setEnd(root.children[1].firstChild,7);const s=getSelection();s.removeAllRanges();s.addRange(r);
  const anchor=window.annotations.capturePassage(root,{target:root.firstChild},{projection:p});
  const ignored=window.annotations.hasContentMutation([{target:root.lastChild,type:'childList',addedNodes:[document.createElement('span')],removedNodes:[]}]);
  const changed=window.annotations.hasContentMutation([{target:root.firstChild.firstChild,type:'characterData'}]);
  return {text:p.text,quote:anchor.quote,ignored,changed};
 });
 assert.equal(projection.text,'First sentence. Second sentence.\n\nAnother paragraph.');assert.equal(projection.quote,projection.text);assert.equal(projection.ignored,false);assert.equal(projection.changed,true);assert.deepEqual(errors,[]);
 console.log('Rendering interactions passed: live callbacks, stable math, source/stream/citation/image/mode changes, paragraph projection and overlay mutation filtering.');
}finally{await browser?.close();await server.close();}
