import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import {timingSafeEqual} from 'node:crypto';
export async function allowed(request:Request){// Owner-private Sites dispatch enforces access; its signed-in identity may only include email.
const identity=await headers();if(identity.get('oai-authenticated-user-email'))return true;const token=request.headers.get('x-site-service-token');if(!token||!env.SETUP_TOKEN)return false;const a=Buffer.from(token),b=Buffer.from(env.SETUP_TOKEN);return a.length===b.length&&timingSafeEqual(a,b);}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export function reply(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
