import assert from 'node:assert/strict';
import {loadingRecovery} from '../lib/browser-recovery.mjs';
const run={id:'run1',queryId:'q1',tasks:[{index:2,tabId:42,state:'waiting',message:'等待官网结果加载；请打开官网处理后继续'}]};
const attempts=new Set();assert.deepEqual(loadingRecovery(run,'q1',attempts),{key:'run1:2',tabId:42});
attempts.add('run1:2');assert.equal(loadingRecovery(run,'q1',attempts),null);
for(const message of ['请先登录','请完成验证码','查询条件不一致','官方接口额度不足','等待官网结果加载；请完成验证'])assert.equal(loadingRecovery({...run,tasks:[{...run.tasks[0],message}]},'q1',new Set()),null);
assert.equal(loadingRecovery(run,'q2',new Set()),null);
assert.equal(loadingRecovery({...run,tasks:[{...run.tasks[0],state:'done'}]},'q1',new Set()),null);
console.log('PASS bounded loading-only recovery; authentication, CAPTCHA, route errors and completed tasks excluded.');
