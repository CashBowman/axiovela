import test from 'node:test';
import assert from 'node:assert/strict';
import {codexContext, codexLimits} from '../server/provider-usage.mjs';
test('context uses last request, not lifetime total, and unknown is not zero',()=>{
 assert.deepEqual(codexContext({last:{totalTokens:200},total:{totalTokens:90000},modelContextWindow:1000}),{tokens:200,contextWindow:1000,percent:20});
 for(const value of [null,{}, {last:{totalTokens:null},modelContextWindow:1000},{last:{totalTokens:2},modelContextWindow:0}])assert.equal(codexContext(value),null);
});
test('quota preserves bucket/window identity and ignores unavailable values',()=>{
 assert.deepEqual(codexLimits({rateLimits:{primary:{usedPercent:null}}}),[]);
 const limits=codexLimits({rateLimits:{primary:{usedPercent:99}},rateLimitsByLimitId:{fast:{primary:{usedPercent:40,windowDurationMins:300,resetsAt:123}},slow:{secondary:{usedPercent:100}}}});
 assert.deepEqual(limits.map(x=>[x.bucket,x.remaining]),[['fast',60],['slow',0]]);assert.equal(limits[0].minutes,300);
});
