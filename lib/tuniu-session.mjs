import {refreshTuniu} from './providers.mjs';
import {tokenNeedsRefresh} from './token-expiry.mjs';
// A provider may revoke/expire an access token before its advertised expiry.
// Renew once, persist the rotated refresh token, then retry the read-only work.
export async function withTuniuSession(auth,{run,save,refresh=refreshTuniu}) {
  let renewed=false;
  const renew=async()=>{auth=await refresh(auth);await save(auth);renewed=true;};
  if(tokenNeedsRefresh(auth.token.expiresAt))await renew();
  try{return await run(auth.token.accessToken);}
  catch(error){
    if(![401,403].includes(error?.status))throw error;
    if(renewed)throw Error('途牛续期后仍未授权当前接口，请重新连接途牛');
    await renew();
    try{return await run(auth.token.accessToken);}
    catch(next){if([401,403].includes(next?.status))throw Error('途牛续期后仍未授权当前接口，请重新连接途牛');throw next;}
  }
}
