import {createServer} from 'node:http';
import {env} from './env.mjs';
import {worker} from '../server/pages.js';
const port=Number(env.PORT||5173),host=env.HOST||'127.0.0.1';if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const publicOrigin=env.PUBLIC_ORIGIN?new URL(env.PUBLIC_ORIGIN).origin:null;
if(env.NODE_ENV==='production'&&(!publicOrigin||!publicOrigin.startsWith('https://')))throw Error('Set an HTTPS PUBLIC_ORIGIN before production deployment.');
const attempts=new Map();
const server=createServer(async(req,res)=>{try{
 const authority=req.headers.host;if(!authority||!/^([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d+)?$/.test(authority)||!req.url.startsWith('/')){res.writeHead(400);res.end();return;}
 // Socket address only: never trust an arbitrary X-Forwarded-For header.
 if(req.method==='POST'&&req.url.startsWith('/api/auth/')){const id=req.socket.remoteAddress;const now=Date.now(),entry=attempts.get(id)||{since:now,count:0};if(now-entry.since>60000){entry.count=0;entry.since=now;}entry.count++;attempts.set(id,entry);if(entry.count>30){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'60'});res.end(JSON.stringify({error:'요청이 많습니다. 잠시 후 다시 시도해 주세요.'}));return;}}
 const origin=publicOrigin||'http://'+authority,chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>18000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,env);const responseHeaders=Object.fromEntries(response.headers);const setCookies=response.headers.getSetCookie();if(setCookies.length)responseHeaders['set-cookie']=setCookies;res.writeHead(response.status,responseHeaders);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'서버 오류가 발생했습니다.'}));}});
server.requestTimeout=30000;server.headersTimeout=15000;
setInterval(()=>{for(const[id,value]of attempts)if(Date.now()-value.since>60000)attempts.delete(id);},60000).unref();
server.listen(port,host,()=>console.log(`Local: http://127.0.0.1:${port}/lp/hokyung\nAdmin: http://127.0.0.1:${port}/admin\nSupabase: ${env.SUPABASE_URL?'configured URL':'not connected'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
