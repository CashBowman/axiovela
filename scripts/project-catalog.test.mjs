import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProjectCatalog} from '../server/project-catalog.mjs';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'axiovela-catalog-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'profile/projects.json');const catalog=createProjectCatalog(file);async function project(name){const p=path.join(root,name);await fs.mkdir(p);await fs.writeFile(path.join(p,'workbench.project.json'),JSON.stringify({name,researchQuestion:'Synthetic fixture'}));return p;}return {root,file,catalog,project};}
test('canonical remembered projects survive reload, deduplicate and preserve concurrent pins',async t=>{
 const {root,file,catalog,project}=await fixture(t);const a=await project('Cooling α'),b=await project('Sensor β');
 const [pa,pb]=await Promise.all([catalog.remember(a),catalog.remember(b)]);
 await fs.symlink(a,path.join(root,'alias'));assert.equal((await catalog.remember(path.join(root,'alias'))).id,pa.id);
 await Promise.all([catalog.edit({action:'pin',id:pa.id,pinned:true}),catalog.edit({action:'pin',id:pb.id,pinned:true})]);
 const snapshot=await createProjectCatalog(file).snapshot();assert.equal(snapshot.projects.length,2);assert.ok(snapshot.projects.every(p=>p.pinned));
});
test('exact shared sources and recorded membership explain links; titles alone do not',async t=>{
 const {catalog,project}=await fixture(t);const a=await project('First'),b=await project('Second'),c=await project('Independent');
 for(const [root,url] of [[a,'https://doi.org/10.1234/cooling'],[b,'https://doi.org/10.1234/cooling'],[c,'https://example.com/other']]){await fs.mkdir(path.join(root,'library'));await fs.writeFile(path.join(root,'library/catalog.json'),JSON.stringify({papers:[{title:'Same title',url}]}));await catalog.remember(root);}
 await fs.mkdir(path.join(a,'runs/run-1'),{recursive:true});await fs.writeFile(path.join(a,'runs/run-1/run.json'),JSON.stringify({id:'run-1',name:'Cooling sweep',status:'complete'}));
 const s=await catalog.snapshot();assert.equal(s.links.length,2);assert.equal(s.items.filter(x=>x.kind==='experiment').length,1);assert.match(s.links.find(l=>l.type==='shares sources with').evidence[0],/10.1234/);assert.equal(s.links.filter(l=>l.type==='contains').length,1);
});
test('manual explanations validate endpoints, update, relocate and detach without deleting files',async t=>{
 const {root,catalog,project}=await fixture(t);const a=await project('A'),b=await project('B');const pa=await catalog.remember(a),pb=await catalog.remember(b);
 const body={action:'link',from:`project:${pa.id}`,to:`project:${pb.id}`,type:'tests',description:'A tests the model developed in B; uncertainty remains.'};
 await assert.rejects(catalog.edit({...body,description:' '}));await assert.rejects(catalog.edit({...body,to:body.from}));await assert.rejects(catalog.edit({...body,to:'project:invented'}));
 const link=await catalog.edit(body);await catalog.edit({...body,id:link.id,description:'Revised scope.'});assert.equal((await catalog.snapshot()).links[0].description,'Revised scope.');
 const moved=path.join(root,'Moved');await fs.rename(a,moved);assert.equal((await catalog.snapshot()).projects.find(p=>p.id===pa.id).available,false);
 await catalog.edit({action:'locate',id:pa.id,path:moved});assert.equal((await catalog.snapshot()).links[0].id,link.id);
 await catalog.edit({action:'forget',id:pb.id});assert.ok(await fs.stat(b));assert.equal((await catalog.snapshot()).links.length,0);
 await catalog.remember(b,{touch:false});assert.equal((await catalog.snapshot()).projects.length,1,'history migration must not resurrect removed entries');await catalog.remember(b);assert.equal((await catalog.snapshot()).links[0].id,link.id);await catalog.edit({action:'unlink',id:link.id});assert.equal((await catalog.snapshot()).links.length,0);
});
test('indexing never creates a missing project, reads symlinked metadata, or overwrites corrupt catalogs',async t=>{
 const {root,file,catalog,project}=await fixture(t);await assert.rejects(catalog.remember(path.join(root,'missing')));await assert.rejects(fs.stat(path.join(root,'missing')));
 const a=await project('A');await fs.mkdir(path.join(a,'library'));await fs.writeFile(path.join(root,'secret.json'),JSON.stringify({papers:[{url:'https://secret.example'}]}));await fs.symlink(path.join(root,'secret.json'),path.join(a,'library/catalog.json'));await catalog.remember(a);
 const s=await catalog.snapshot();assert.equal(s.links.length,0);assert.match(s.warnings.join(' '),/Symlinks/);
 await fs.writeFile(file,'broken');await assert.rejects(catalog.edit({action:'pin',id:s.projects[0].id,pinned:true}));assert.equal(await fs.readFile(file,'utf8'),'broken');
});

test("identical uploaded PDFs connect without relying on names",async t=>{const {catalog,project}=await fixture(t);for(const name of ["PDF A","PDF B"]){const p=await project(name);await fs.mkdir(path.join(p,"library"));await fs.writeFile(path.join(p,"library/catalog.json"),JSON.stringify({papers:[{title:name,contentHash:"a".repeat(64)}]}));await catalog.remember(p);}const g=await catalog.snapshot();assert.equal(g.links.length,1);assert.match(g.links[0].evidence[0],/sha256:/);assert.equal((await catalog.snapshot({details:false})).links.length,0);});
