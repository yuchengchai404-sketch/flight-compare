import assert from 'node:assert/strict';
import {readTuniuCredential} from '../lib/import-tuniu.mjs';
const c={client:{clientId:'official',tokenEndpoint:'https://openapi.tuniu.cn/oauth2/token'},token:{accessToken:'fixture-access',refreshToken:'fixture-refresh',expiresAt:1}};
assert.deepEqual(readTuniuCredential({production:{sources:{'tuniu-cli':{...c,extra:'private'},another:{secret:'not-for-upload'}}}}),c);
assert.throws(()=>readTuniuCredential({...c,client:{...c.client,tokenEndpoint:'https://example.com'}}),/官方授权文件/);
assert.throws(()=>readTuniuCredential({token:{accessToken:'a'}}),/官方授权文件/);
console.log('PASS official source-only credential import; foreign endpoints and incomplete exports rejected.');
