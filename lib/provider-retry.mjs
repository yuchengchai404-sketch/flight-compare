// Retry only read-only transient searches. Authentication, quota and malformed
// responses require a different remedy and must not be hammered.
export async function searchWithRetry(search,{wait=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  for(let attempt=0;attempt<3;attempt++) {
    try{return await search();}
    catch(error){
      if(!error?.retryable||attempt===2)throw error;
      await wait([2000,5000][attempt]);
    }
  }
}
export function fliggyItems(data,label='飞猪') {
  if(data?.status===0&&Array.isArray(data.data?.itemList))return data.data.itemList;
  const error=new Error(label+'官方搜索暂时失败；未取得报价，不代表无航班');
  error.retryable=data?.status===1&&data?.message==='搜索机票低价行业失败';
  if(!error.retryable)error.message=label+'接口响应异常，请稍后重试或检查授权';
  throw error;
}
