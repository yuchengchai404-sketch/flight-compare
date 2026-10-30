import assert from 'node:assert/strict';
import {providerProgress,restoreStep,comparisonCompletion} from '../lib/workflow.mjs';
const c={outbound:[{source:'google'},{source:'ctrip'}],return:[],roundtrip:[],pending:[{source:'ctrip'}]};
assert.equal(providerProgress(c,'google',true),'去程 1 条 · 回程 0 条');
assert.equal(providerProgress(c,'ctrip',true),'去程 1 条 · 回程 0 条 · 待核验 1 条');
assert.equal(providerProgress(c,'ly',false),'去程 0 条');
assert.equal(restoreStep('{bad','q'),1);
assert.equal(restoreStep(JSON.stringify({queryId:'other',step:3}),'q'),1);
assert.equal(restoreStep(JSON.stringify({queryId:'q',step:3}),'q'),3);
assert.equal(restoreStep(JSON.stringify({queryId:'q',step:99}),'q'),1);
console.log('Workflow checks passed: scoped step restore and eligible direction counts.');
const run={queryId:'q',startedAt:1000,tasks:['Google Flights','携程','同程'].flatMap(name=>['去程','回程'].map(d=>({label:name+' · '+d,state:'done'})))};
const snapshots=['fliggy','tuniu'].map(source=>({source,status:'success',checkedAt:new Date(2000).toISOString(),items:[{legs:[{},{}]}]}));
assert.equal(comparisonCompletion(run,'q',snapshots,false).complete,true);
for(const patch of [{status:'partial'},{warning:'去程失败'},{lastAttempt:{error:'搜索失败'}},{checkedAt:new Date(500).toISOString()},{items:[]},{items:[{ticketType:'oneway',direction:'return',legs:[{}]}]}]){
 assert.equal(comparisonCompletion(run,'q',[{...snapshots[0],...patch},snapshots[1]],false).complete,false);
}
assert.equal(comparisonCompletion(run,'other',snapshots,false).complete,false);
assert.equal(comparisonCompletion(run,'q',snapshots,true).complete,false);
assert.equal(comparisonCompletion({...run,tasks:run.tasks.map((t,i)=>i? t:{...t,state:'waiting'})},'q',snapshots,false).complete,false);
console.log('PASS five-source current-run completion, partial/missing/stale/API and browser failures excluded.');
