const QUESTIONS=[['1천만 원 미만','1천만 ~ 3천만 원 미만','3천만 ~ 5천만 원 미만','5천만 ~ 1억 원 미만','1억 원 이상'],['현재 소득 없음','100만 원 미만','100만 ~ 200만 원 미만','200만 ~ 300만 원 미만','300만 원 이상']];
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
export async function purgeExpired(db){const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);await db.prepare('DELETE FROM visits WHERE created_at < ?').bind(cutoff.toISOString()).run();}
export async function api(request,env,campaign){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(request.method!=='POST')return json({error:'POST 요청이 필요합니다.'},405);
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'허용되지 않은 요청입니다.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON 요청이 필요합니다.'},415);
 if(Number(request.headers.get('content-length')||0)>5000)return json({error:'입력이 너무 깁니다.'},413);
 try{
  const body=await request.text();if(body.length>5000)return json({error:'입력이 너무 깁니다.'},413);
  let input;try{input=JSON.parse(body)}catch{return json({error:'잘못된 요청입니다.'},400)}
  if(!input||typeof input!=='object'||!['init','start','answer','complete'].includes(input.action))return json({error:'잘못된 요청입니다.'},400);
  const db=env.DB;if(!db)throw Error('Missing DB binding');
  const now=new Date().toISOString(),cookieName='flow_'+campaign;
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(input.action==='init')await purgeExpired(db);
  let visit=token?await db.prepare('SELECT id,step,answer1,answer2,completed FROM visits WHERE id=? AND campaign=?').bind(token,campaign).first():null;
  let newToken='';
  if(input.action==='init'&&!visit){
   newToken=crypto.randomUUID();const attribution={};
   for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'])if(typeof input.attribution?.[key]==='string')attribution[key]=input.attribution[key].slice(0,300);
   await db.prepare('INSERT INTO visits(id,campaign,created_at,updated_at,attribution) VALUES(?,?,?,?,?)').bind(newToken,campaign,now,now,JSON.stringify(attribution)).run();
   visit={id:newToken,step:0,answer1:null,answer2:null,completed:0};
  }
  if(!visit)return json({error:'연결이 만료되었습니다. 새로고침 후 다시 시도해 주세요.'},401);
  if(!visit.completed){
   if(input.action==='start')await db.prepare('UPDATE visits SET step=MAX(step,1),started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND completed=0').bind(now,now,visit.id).run();
   if(input.action==='answer'){
    const q=input.question;
    if((q!==0&&q!==1)||!QUESTIONS[q].includes(input.value))return json({error:'답변을 선택해 주세요.'},400);
    if((q===0&&visit.step<1)||(q===1&&!visit.answer1))return json({error:'앞 단계부터 진행해 주세요.'},400);
    const col=q===0?'answer1':'answer2';
    await db.prepare(`UPDATE visits SET ${col}=?,step=MAX(step,?),updated_at=? WHERE id=? AND completed=0`).bind(input.value,q+2,now,visit.id).run();
   }
   if(input.action==='complete'){
    const name=typeof input.name==='string'?input.name.trim():'';
    const phone=typeof input.phone==='string'?input.phone.replace(/[\s-]/g,''):'';
    if(name.length<2||name.length>50||!/^01[016789]\d{7,8}$/.test(phone)||input.consent!==true)return json({error:'이름, 올바른 휴대폰 번호와 개인정보 동의를 확인해 주세요.'},400);
    if(!visit.answer1||!visit.answer2)return json({error:'질문에 먼저 답변해 주세요.'},400);
    await db.prepare('UPDATE visits SET name=?,phone=?,consent_at=?,consent_version=?,completed=1,completed_at=?,step=4,updated_at=? WHERE id=? AND completed=0').bind(name,phone,now,'hokyung-v1-1year',now,now,visit.id).run();
   }
  }
  const saved=await db.prepare('SELECT id,step,answer1,answer2,completed FROM visits WHERE id=?').bind(visit.id).first();
  const response=json({step:saved.step,answers:[saved.answer1,saved.answer2],completed:!!saved.completed,reference:saved.completed?saved.id.slice(0,8).toUpperCase():null});
  if(newToken)response.headers.set('Set-Cookie',`${cookieName}=${newToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${url.protocol==='https:'?'; Secure':''}`);
  return response;
 }catch(error){console.error('Storage error:',error instanceof Error?error.message:'unknown');return json({error:'지금은 저장할 수 없습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.'},503);}
}
export function createWorker(html){return {async fetch(request,env){
 const url=new URL(request.url);
 const match=url.pathname.match(/^\/api\/campaign\/([a-z0-9][a-z0-9-]{0,63})$/);
 if(match)return api(request,env,match[1]);
 if(url.pathname==='/')return Response.redirect(url.origin+'/lp/hokyung',302);
 if(url.pathname==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#2555d9"/><path d="M9 8v16m14-16v16M9 16h14" stroke="white" stroke-width="3"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
 if(request.method==='GET'&&/^\/lp\/[a-z0-9][a-z0-9-]{0,63}\/?$/.test(url.pathname))return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com"}});
 return new Response('페이지를 찾을 수 없습니다.',{status:404});
},async scheduled(event,env,ctx){ctx.waitUntil(purgeExpired(env.DB));}};}
