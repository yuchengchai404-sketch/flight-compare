// Only the known loading timeout may resume automatically. Never resume login,
// CAPTCHA, changed query, invalid data or quota errors without user handling.
export function loadingRecovery(run,queryId,attempted){
  if(run?.queryId!==queryId||typeof run.id!=='string'||!Array.isArray(run.tasks))return null;
  const task=run.tasks.find(t=>t.state==='waiting');
  if(!task||!Number.isInteger(task.tabId)||!Number.isInteger(task.index)||task.message!=='等待官网结果加载；请打开官网处理后继续')return null;
  const key=run.id+':'+task.index;
  return attempted.has(key)?null:{key,tabId:task.tabId};
}
