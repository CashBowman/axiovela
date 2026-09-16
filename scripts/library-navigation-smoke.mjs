import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { researchKinds } from '../shared/research-outline.mjs';

// The real list and reader, with a device-local in-memory Library and no provider.
// Reverse storage order deliberately: navigation must follow the rendered groups.
const fixture = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LibrarySources,LibraryReader} from '/src/Library.jsx';
import {researchKinds} from '/shared/research-outline.mjs';
import '/src/style.css';
const h=React.createElement;
const nodes=['experiment',...Object.keys(researchKinds)].reverse().flatMap(kind=>[2,1].map(i=>({key:kind+i,kind,title:kind+' '+i,detail:'Reader content for '+kind+' '+i,interpretation:true})));
function Fixture(){
 const [papers,setPapers]=useState([1,2].map(i=>({id:'source'+i,title:'Source '+i,sourceType:'web',text:'Reader content for source '+i+'\\n\\n'+('Reading position remains here.\\n\\n').repeat(50),read:false})));
 const [selected,setSelected]=useState('source1'),[view,setView]=useState('read');
 const library={root:'/isolated-fixture',state:{papers},graph:{nodes,links:[]},selected,setSelected,view,setView,update:patch=>setPapers(ps=>ps.map(p=>p.id===patch.id?{...p,...patch}:p)),sync:()=>{},importSource:async()=>{}};
 window.selection=selected;
 return h('main',{style:{display:'grid',gridTemplateColumns:'340px 1fr',height:'620px',gap:'12px',padding:'12px'}},h(LibrarySources,{library}),h(LibraryReader,{library}),h('textarea',{'aria-label':'Fixture chat composer',defaultValue:'Independent chat draft'}));
}
createRoot(document.getElementById('fixture')).render(h(Fixture));`;
const server = await createServer({
  optimizeDeps:{include:['react','react-dom/client']}, server:{host:'127.0.0.1',port:0}, appType:'custom',
  plugins:[{name:'library-navigation-fixture',configureServer(server){server.middlewares.use('/fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/fixture','<!doctype html><div id="fixture"></div><script type="module" src="/library-fixture.jsx"></script>'));});},resolveId(id){if(id==='/library-fixture.jsx')return '\0library-fixture.jsx';},load(id){if(id==='\0library-fixture.jsx')return fixture;}}],
});
let browser;
try {
  await server.listen(); browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:820}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(10000);
  await page.goto(server.resolvedUrls.local[0]+'fixture');
  const buttons=page.locator('.libraryList .sourceTitle'), search=page.getByLabel('Search or import source'), type=page.getByLabel('Filter library');
  await buttons.first().waitFor();
  const expected=['Source 1','Source 2',...['experiment',...Object.keys(researchKinds)].flatMap(k=>[k+' 2',k+' 1'])];
  assert.deepEqual(await buttons.allTextContents(),expected);
  const check = async (title, checkScroll = true) => {
    await page.waitForFunction(title=>document.activeElement?.textContent===title && document.activeElement?.getAttribute('aria-pressed')==='true',title);
    assert.equal(await page.locator('.libraryList .sourceTitle[tabindex="0"]').count(),1);
    assert.equal(await page.locator('.libraryList .sourceTitle[tabindex="0"]').textContent(),title);
    await page.locator('.libraryReading:not(.hiddenLibraryView)').getByText('Reader content for '+title.toLowerCase(),{exact:true}).waitFor();
    if (checkScroll) assert.ok(await page.locator('.libraryList .sourceTitle[aria-pressed="true"]').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.libraryList').getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1;}));
  };
  await buttons.first().click(); await check(expected[0]);
  await page.keyboard.press('ArrowUp'); await check(expected[0]);
  for(const title of expected.slice(1)){await page.keyboard.press('ArrowDown');await check(title);}
  await page.keyboard.press('ArrowDown'); await check(expected.at(-1));
  await page.keyboard.press('Home'); await check(expected[0]);
  await page.keyboard.press('End'); await check(expected.at(-1));
  for(const title of expected.slice(0,-1).reverse()){await page.keyboard.press('ArrowUp');await check(title);}
  for(const key of ['Shift+ArrowDown','Control+End','Alt+ArrowDown','Meta+Home']){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>window.selection),'source1');}
  // A hidden selection does not change the reader or its scroll position.
  await page.locator('.articleScroll').evaluate(el=>{el.scrollTop=170;window.reader=el;window.readerTop=el.scrollTop;});
  await type.selectOption('claim');
  assert.deepEqual(await buttons.allTextContents(),['claim 2','claim 1']);
  assert.equal(await page.evaluate(()=>window.selection),'source1');
  assert.ok(await page.evaluate(()=>window.reader===document.querySelector('.articleScroll')&&window.reader.scrollTop===window.readerTop));
  assert.equal(await buttons.first().getAttribute('tabindex'),'0');
  assert.equal(await buttons.last().getAttribute('tabindex'),'-1');
  await page.getByRole('button',{name:'Refresh imports'}).focus();await page.keyboard.press('Tab');
  assert.equal(await buttons.first().evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.evaluate(()=>window.selection),'source1');
  await page.keyboard.press('ArrowDown');await check('claim 1');
  await search.fill('claim 2');assert.equal(await buttons.count(),1);assert.equal(await buttons.first().getAttribute('tabindex'),'0');
  await buttons.first().focus();await page.keyboard.press('Home');await check('claim 2');await page.keyboard.press('End');await check('claim 2');
  await search.fill('no matching item');assert.equal(await buttons.count(),0);await page.keyboard.press('ArrowDown');
  assert.equal(await search.evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>window.selection),'outline:claim2');
  await search.fill('');await type.selectOption('all');await buttons.first().click();
  for(const field of [search,page.getByLabel('Fixture chat composer'),page.getByLabel('Read Source 1')]){
    await field.focus();for(const key of ['ArrowDown','ArrowUp','Home','End'])await page.keyboard.press(key);
    assert.equal(await page.evaluate(()=>window.selection),'source1');
  }
  const read=page.getByLabel('Read Source 1');await read.focus();await page.keyboard.press('Space');assert.equal(await read.isChecked(),true);
  await page.getByLabel('Reading status').selectOption('read');assert.deepEqual(await buttons.allTextContents(),['Source 1']);
  await read.focus();await page.keyboard.press('Space');assert.equal(await buttons.count(),0);
  await page.getByLabel('Reading status').selectOption('all');await buttons.nth(1).focus();await page.keyboard.press('Enter');await check('Source 2',false);
  await buttons.first().focus();await page.keyboard.press('Space');await check('Source 1',false);
  assert.equal(await page.getByLabel('Fixture chat composer').inputValue(),'Independent chat draft');
  await page.keyboard.press('End');await check(expected.at(-1));
  const evidence=process.env.AXIOVELA_LIBRARY_NAV_EVIDENCE||'.local/library-navigation-20260916';await mkdir(evidence,{recursive:true});await page.screenshot({path:evidence+'/navigation.png'});
  assert.deepEqual(errors,[]);
  console.log('Library keyboard navigation passed: all displayed groups, focus/selection/reader, clamped boundaries, modifiers, roving Tab entry, text/type/read filters, hidden selection and reader position, empty results, independent search/chat/checkbox keys, Space and Enter.');
} finally { await browser?.close();await server.close(); }
