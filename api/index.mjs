import {worker} from '../server/pages.js';
export default async function handler(req,res){
 try{
  const origin=process.env.PUBLIC_ORIGIN||('https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if(!origin.startsWith('https://')||!process.env.SUPABASE_SECRET_KEY)throw Error('Configuration missing');
  let body;if(!['GET','HEAD'].includes(req.method)){
   if(req.body!==undefined)body=typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body);
   else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>18000){res.statusCode=413;res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
   if(Buffer.byteLength(body)>18000){res.statusCode=413;res.end();return;}
  }
  const request=new Request(new URL(req.url,new URL(origin).origin),{method:req.method,headers:req.headers,...(body!==undefined?{body}:{})});
  const response=await worker.fetch(request,process.env),headers=Object.fromEntries(response.headers);
  const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
  res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'서비스 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.'}));}
}
