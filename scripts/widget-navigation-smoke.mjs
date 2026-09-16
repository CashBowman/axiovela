import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResearchLeft,ResearchMiddle} from '/src/ResearchPanels.jsx';
import FigureGallery from '/src/FigureGallery.jsx';
import ConversationHistory from '/src/ConversationHistory.jsx';
import '/src/style.css';
const h=React.createElement;
const runs=Array.from({length:24},(_,i)=>({id:'trial-'+i,name:'Trial '+i,status:'complete',startedAt:'2026-09-01',metrics:{score:i},artifacts:[]}));
const artifacts=Array.from({length:6},(_,i)=>({path:'exports/figure-'+i+'.svg',name:'Figure '+i,type:'svg',title:'Figure '+i,topic:i<3?'First group':'Second group'}));
const chats=Array.from({length:4},(_,i)=>({id:'conversation-'+i,projectId:'p',projectRoot:'/fixture',projectName:'Fixture project',role:'experiment',title:'Conversation '+i,excerpt:'Saved message '+i,updatedAt:'2026-09-01'}));
const request=async url=>url==='/api/projects'?{projects:[{id:'p',root:'/fixture',name:'Fixture project',available:true}]}:{conversations:chats,total:chats.length,warnings:[],nextOffset:null};
function Pane({title,children}){return h('section',{className:'pane',style:{height:360,overflow:'auto'}},h('h2',{},title),children)}
function Fixture(){const[selected,setSelected]=useState('trial-0');window.selectedTrial=selected;window.clearTrials=()=>setEmpty(true);const[empty,setEmpty]=useState(false);const project={runs:empty?[]:runs,artifacts:[]};const run=project.runs.find(r=>r.id===selected);
return h('main',{},h('div',{style:{display:'grid',gridTemplateColumns:'350px 1fr',gap:20}},h(ResearchLeft,{Pane,tab:'Trials',project,selectedRun:run,selectRun:setSelected}),h(ResearchMiddle,{Pane,tab:'Trials',project,selectedRun:run})),h('div',{style:{height:300,overflow:'auto'}},h(FigureGallery,{artifacts})),h(ConversationHistory,{request,root:'/fixture',onUpdated:()=>{},onOpen:item=>{window.openedHistory=item.id;}}),h('textarea',{'aria-label':'Independent editor',defaultValue:'Draft text'}));}
createRoot(document.getElementById('fixture')).render(h(Fixture));`;
const server = await createServer({optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0},appType:'custom',plugins:[{name:'widget-fixture',configureServer(server){server.middlewares.use('/fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/fixture','<!doctype html><div id="fixture"></div><script type="module" src="/widget-fixture.jsx"></script>'));});server.middlewares.use('/api/artifacts/file',(req,res)=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="tan"/></svg>');});},resolveId(id){if(id==='/widget-fixture.jsx')return '\0widget-fixture.jsx';},load(id){if(id==='\0widget-fixture.jsx')return fixture;}}]});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(server.resolvedUrls.local[0]+'fixture');
 const trials=page.locator('[data-trial-item]');await trials.first().click();
 async function selected(i){await page.waitForFunction(i=>window.selectedTrial==='trial-'+i && document.activeElement?.getAttribute('aria-pressed')==='true',i);assert.equal(await page.locator('[data-trial-item][tabindex="0"]').count(),1);await page.locator('.trialRecord h3').getByText('Trial '+i,{exact:true}).waitFor();}
 await selected(0);await page.keyboard.press('ArrowUp');await selected(0);
 for(let i=1;i<24;i++){await page.keyboard.press('ArrowDown');await selected(i);}
 await page.keyboard.press('ArrowDown');await selected(23);
 assert.ok(await trials.last().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.pane').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom+1;}));
 await page.keyboard.press('Home');await selected(0);await page.keyboard.press('End');await selected(23);await page.keyboard.press('Shift+ArrowUp');await selected(23);
 const editor=page.getByLabel('Independent editor');await editor.focus();await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>window.selectedTrial),'trial-23');
 const figures=page.locator('[data-figure-item]');await figures.first().focus();await page.keyboard.press('ArrowRight');assert.equal(await figures.nth(1).evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('.figureViewer').count(),0);
 await page.keyboard.press('End');assert.equal(await figures.last().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('ArrowDown');assert.equal(await figures.last().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Home');assert.equal(await figures.first().evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator('[data-figure-item][tabindex="0"]').count(),1);
 await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Figure 0'}).waitFor();await page.keyboard.press('Control+ArrowRight');assert.equal(await page.locator('#figure-viewer-title').innerText(),'Figure 0');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#figure-viewer-title').innerText(),'Figure 1');await page.keyboard.press('Escape');await page.locator('.figureViewer').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'History',exact:true}).click();const rows=page.locator('.historyOpen');await rows.first().waitFor();await rows.first().focus();await page.keyboard.press('ArrowDown');assert.equal(await rows.nth(1).evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>window.openedHistory),undefined);assert.equal(await page.locator('.historyOpen[tabindex="0"]').count(),1);
 await page.keyboard.press('End');assert.equal(await rows.last().evaluate(el=>el===document.activeElement),true);await page.keyboard.press('ArrowDown');assert.equal(await rows.last().evaluate(el=>el===document.activeElement),true);
 await page.getByRole('textbox',{name:'Search conversations'}).focus();await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('textbox',{name:'Search conversations'}).evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Pin',exact:true}).first().focus();await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('button',{name:'Pin',exact:true}).first().evaluate(el=>el===document.activeElement),true);
 await rows.nth(2).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.openedHistory),'conversation-2');
 await page.evaluate(()=>window.clearTrials());await page.getByText('No trials recorded yet.',{exact:false}).waitFor();assert.equal(await trials.count(),0);
 await mkdir('.local/release-0.2.9/navigation',{recursive:true});await page.screenshot({path:'.local/release-0.2.9/navigation/widgets.png'});assert.deepEqual(errors,[]);
 console.log('Widget navigation passed: 24 trials update record/focus/scroll, boundary and modified keys, empty ledger, grouped figure focus/open/viewer, history focus without opening, and independent input/action controls.');
}finally{await browser?.close();await server.close();}
