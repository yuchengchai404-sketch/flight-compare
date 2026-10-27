import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw Error('比价记录存储暂不可用');return env.DB;}
