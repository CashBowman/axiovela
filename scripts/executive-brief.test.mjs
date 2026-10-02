import test from 'node:test';
import assert from 'node:assert/strict';
import {executiveBrief} from '../src/research-model.mjs';
import {researchInstructions} from '../server/research-context.mjs';
test('executive brief preserves concise qualitative conclusions and essential caveats',()=>{
 const summary='The baseline is promising, but generalization remains uncertain. Validate robustness before expanding the study.';
 assert.deepEqual(executiveBrief({research:{summary},runs:[]}),{text:summary,authored:true});
});
test('legacy numeric, long and stale briefs remain saved without stripping qualifiers',()=>{
 for(const summary of ['Accuracy reached 0.93.','Accuracy reached ninety percent.','Measured gain was １２%.','word '.repeat(61),'Results include $R^2$.']){
  const project={research:{summary},runs:[{id:'r',status:'complete'}]};const original=structuredClone(project);
  const brief=executiveBrief(project);assert.equal(brief.authored,false);assert.doesNotMatch(brief.text,/\p{N}/u);assert.deepEqual(project,original);
 }
 assert.equal(executiveBrief({research:{summary:'A promising conclusion.',updatedAt:'2025-01-01'},runs:[{status:'complete',completedAt:'2025-02-01'}]}).authored,false);
 for(const status of ['running','failed','queued']) assert.doesNotMatch(executiveBrief({runs:[{status}]}).text,/\p{N}/u);
 assert.ok(executiveBrief(null).text);
});
test('assistant contract requests a concise brief without duplicated panel reports',()=>{
 const prompt=researchInstructions();
 assert.match(prompt,/single paragraph of at most 60 words/);
 assert.match(prompt,/Do not generate separate findings, limitations or nextSteps arrays/);
 assert.match(prompt,/Keep durable run records and diagnostic logs/);
 assert.match(prompt,/exact measurements, sample sizes and procedures in the trial record/);
});
