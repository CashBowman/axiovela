import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, symlink, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {previewFigureRemoval, removeFigure, restoreFigure, removedFigures} from '../server/figure-actions.mjs';
test('review, revision guard, recoverable deletion and no-overwrite restore', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'figure-removal-'));
 try {
  await mkdir(path.join(root,'artifacts/figures'),{recursive:true}); await mkdir(path.join(root,'writeups'));
  const name='artifacts/figures/test.svg', file=path.join(root,name);
  await writeFile(file,'original'); await writeFile(path.join(root,'writeups/main.md'),'![test](../artifacts/figures/test.svg)');
  await writeFile(path.join(root,'plot.py'),'# writes test.svg and other.svg');
  const preview=await previewFigureRemoval(root,name);assert.deepEqual(preview.references.sort(),['plot.py','writeups/main.md']);
  await writeFile(file,'revised'); await assert.rejects(removeFigure(root,{path:name,revision:preview.revision}),/changed/);
  const review=await previewFigureRemoval(root,name), record=await removeFigure(root,review);
  await assert.rejects(readFile(file),{code:'ENOENT'}); assert.equal((await removedFigures(root)).length,1);
  assert.equal(await readFile(path.join(root,'plot.py'),'utf8'),'# writes test.svg and other.svg');
  await writeFile(file,'new work');await assert.rejects(restoreFigure(root,record),/not overwritten/);assert.equal(await readFile(file,'utf8'),'new work');
  await rm(file);await restoreFigure(root,record);assert.equal(await readFile(file,'utf8'),'revised');assert.deepEqual(await removedFigures(root),[]);
  await assert.rejects(previewFigureRemoval(root,'artifacts/figures/../../plot.py'));
  await symlink(path.join(root,'plot.py'),path.join(root,'artifacts/figures/link.svg'));await assert.rejects(previewFigureRemoval(root,'artifacts/figures/link.svg'),/Symlinks/);
  await assert.rejects(restoreFigure(root,{id:'../../plot.py'}),/Invalid/);
 } finally {await rm(root,{recursive:true,force:true});}
});
