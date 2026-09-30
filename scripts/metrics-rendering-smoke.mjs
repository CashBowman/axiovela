import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Metrics} from '/src/ResearchPanels.jsx';
window.metricReads=0;
function makeMetrics(revision){
 const metrics={};
 for(let i=0;i<30;i++)Object.defineProperty(metrics,'section'+i,{enumerable:true,get(){window.metricReads++;return {records:Array.from({length:120},(_,row)=>({name:'sample '+row,score:revision+i+row/1000}))};}});
 return metrics;
}
function Fixture(){
 const [input,setInput]=useState(''),[metrics,setMetrics]=useState(()=>makeMetrics(0)),[compact,setCompact]=useState(false);
 window.replaceMetrics=()=>setMetrics(makeMetrics(100));
 window.setCompact=setCompact;
 return React.createElement(React.Fragment,null,React.createElement('input',{'aria-label':'Message',value:input,onChange:e=>setInput(e.target.value)}),React.createElement(Metrics,{metrics,compact}));
}
createRoot(document.getElementById('fixture')).render(React.createElement(Fixture));`;
const server=await createServer({optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0},appType:'custom',plugins:[{name:'metrics-fixture',configureServer(server){server.middlewares.use('/fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/fixture','<!doctype html><div id="fixture"></div><script type="module" src="/metrics-fixture.jsx"></script>'));});},resolveId(id){if(id==='/metrics-fixture.jsx')return '\0metrics-fixture.jsx';},load(id){if(id==='\0metrics-fixture.jsx')return fixture;}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'fixture');await page.getByText('Tables 1–12 of 30',{exact:true}).waitFor();
 assert.equal(await page.locator('table').count(),12);
 assert.equal(await page.locator('tbody tr').count(),600);
 assert.equal(await page.locator('details pre').count(),0,'large exact JSON stays unmounted until requested');
 await page.locator('tbody tr').first().getByText('sample 0',{exact:true}).waitFor();
 const reads=await page.evaluate(()=>window.metricReads);
 await page.getByRole('textbox',{name:'Message'}).pressSequentially('typing does not reparse metrics');
 assert.equal(await page.evaluate(()=>window.metricReads),reads,'chat input must not traverse unchanged experiment metrics');
 const region=page.getByRole('region',{name:'Section0 · Records',exact:true});
 await region.getByRole('button',{name:'Next rows',exact:true}).click();
 await region.getByText('Rows 51–100 of 120',{exact:true}).waitFor();
 await region.getByText('sample 50',{exact:true}).waitFor();
 await region.getByRole('button',{name:'Previous rows',exact:true}).click();
 await region.getByText('Rows 1–50 of 120',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Next tables',exact:true}).click();
 await page.getByText('Tables 13–24 of 30',{exact:true}).waitFor();
 assert.equal(await page.getByRole('region',{name:'Section12 · Records',exact:true}).count(),1);
 await page.getByRole('button',{name:'Previous tables',exact:true}).click();
 await page.evaluate(()=>window.replaceMetrics());
 await page.waitForFunction(()=>document.querySelector('tbody tr td:last-child')?.textContent==='100');
 await page.getByText('Exact recorded values',{exact:true}).click();
 const exact=JSON.parse(await page.locator('details pre').textContent());
 assert.equal(exact.section29.records[119].score,129.119,'pagination preserves every exact recorded value');
 await page.getByText('Exact recorded values',{exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('details pre'));
 await page.evaluate(()=>window.setCompact(true));
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===4);
 assert.equal(await page.locator('table').count(),1);
 await page.getByText('Rows 1–4 of 120',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Metrics rendering passed: bounded rows/tables, complete navigation and exact values, live updates, and no metric traversal while typing.');
}finally{await browser?.close();await server.close();}
