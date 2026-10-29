// Accept the official CLI export, but transmit only the selected provider's
// credential fields. Never import other profiles/services or log file contents.
export function readTuniuCredential(value) {
  const auth=value?.production?.sources?.['tuniu-cli']||value;
  if(auth?.client?.tokenEndpoint!=='https://openapi.tuniu.cn/oauth2/token'||typeof auth.client.clientId!=='string'||typeof auth?.token?.accessToken!=='string'||typeof auth.token.refreshToken!=='string'||!auth.token.accessToken||!auth.token.refreshToken)throw Error('请选择途牛官方授权文件，文件内容不会显示在页面上。');
  return {client:{clientId:auth.client.clientId,tokenEndpoint:auth.client.tokenEndpoint},token:{accessToken:auth.token.accessToken,refreshToken:auth.token.refreshToken,expiresAt:auth.token.expiresAt}};
}
