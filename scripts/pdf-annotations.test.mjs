import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizedPdfRects, validPdfGeometry, pdfHighlightRects} from '../shared/pdf-annotations.mjs';
test('PDF rectangles survive zoom and are tied to their PDF revision',()=>{
 const a={page:2,pdfFingerprint:'revision-one',pdfRects:normalizedPdfRects([{left:20,top:40,width:60,height:20}],200,400)};
 assert.ok(validPdfGeometry(a));
 assert.deepEqual(pdfHighlightRects(a,400,800,'revision-one'),[{left:40,top:80,width:120,height:40}]);
 assert.deepEqual(pdfHighlightRects(a,400,800,'revision-two'),[]);
});
test('reject corrupt, oversized and out-of-page PDF geometry',()=>{
 const a={page:1,pdfFingerprint:'one',pdfRects:[[0,0,.1,.1]]};
 for(const pdfRects of [[[NaN,0,.1,.1]], [[0,0,-1,.1]], [[.9,0,.2,.1]], Array(257).fill([0,0,.1,.1]), []]) assert.equal(validPdfGeometry({...a,pdfRects}),false);
 assert.equal(validPdfGeometry({...a,page:0}),false);
 assert.equal(validPdfGeometry({...a,pdfFingerprint:''}),false);
 assert.deepEqual(normalizedPdfRects([{left:-10,top:0,width:30,height:20}],100,100),[[0,0,.2,.2]]);
 assert.deepEqual(pdfHighlightRects({page:1,start:0,end:3,quote:'old'},100,100,'one'),[]);
});
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {annotationDocument,revisionHash,saveAnnotation,listAnnotations,prepareAnnotations} from '../server/annotations.mjs';
test('PDF geometry persists through save, reload, feedback and stale-document rejection',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pdf-annotation-record-'));
 try {
  await fs.mkdir(path.join(root,'papers'));await fs.writeFile(path.join(root,'papers/test.pdf'),'%PDF-fixture-one');
  const target={kind:'document',role:'experiment',path:'papers/test.pdf'},doc=await annotationDocument(root,target);
  const anchor={kind:'pdf-region',page:1,start:0,end:4,quote:'Area',pdfFingerprint:'fixture',pdfRects:[[.1,.2,.3,.1]]};
  const body={target,sourceHash:revisionHash(doc.source,doc.revision),anchor,comment:'Explain this equation.'};
  const note=await saveAnnotation(root,body);
  assert.deepEqual((await listAnnotations(root))[0].anchor.pdfRects,anchor.pdfRects);
  assert.equal(note.anchor.kind,'pdf-region');
  assert.match((await prepareAnnotations(root,[note.id],'experiment')).context,/approximate/);
  await assert.rejects(saveAnnotation(root,{...body,anchor:{...anchor,pdfRects:[[0,0,2,1]]}}),/geometry/);
  await fs.writeFile(path.join(root,'papers/test.pdf'),'%PDF-fixture-two');
  await assert.rejects(prepareAnnotations(root,[note.id],'experiment'),/changed/);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
