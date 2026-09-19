import {ApiError,configured,supabase,cookies,setCookie,getUser} from './supabase.js';
import {authRoute} from './auth.js';
const QUESTIONS=[['1천만 원 미만','1천만 ~ 3천만 원 미만','3천만 ~ 5천만 원 미만','5천만 ~ 1억 원 미만','1억 원 이상'],['현재 소득 없음','100만 원 미만','100만 ~ 200만 원 미만','200만 ~ 300만 원 미만','300만 원 이상']];
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200)=>Response.json(data,{status,headers});
function sameOrigin(request){const origin=request.headers.get('origin');return (!origin||origin===new URL(request.url).origin)&&request.headers.get('sec-fetch-site')!=='cross-site';}
async function body(request){if(!request.headers.get('content-type')?.includes('application/json'))throw new ApiError(415,'JSON 요청이 필요합니다.');const text=await request.text();if(text.length>18000)throw new ApiError(413,'요청이 너무 큽니다.');try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new ApiError(400,'잘못된 요청입니다.');}}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function api(request,env,campaign){
 if(request.method!=='POST')throw new ApiError(405,'POST 요청이 필요합니다.');
 const input=await body(request);if(!['init','start','answer','complete'].includes(input.action))throw new ApiError(400,'잘못된 요청입니다.');
 const user=await getUser(request,env);
 if(input.action==='answer'&&((input.question!==0&&input.question!==1)||!QUESTIONS[input.question].includes(input.value)))throw new ApiError(400,'답변을 선택해 주세요.');
 if(input.action==='complete'){
  if(!user||!user.email_confirmed_at)throw new ApiError(401,'이메일 인증과 로그인을 완료해 주세요.');
  if(typeof input.name!=='string'||input.name.trim().length<2||input.name.trim().length>50||typeof input.phone!=='string'||!/^01[016789]\d{7,8}$/.test(input.phone.replace(/[\s-]/g,''))||input.consent!==true)throw new ApiError(400,'이름·연락처·개인정보 동의를 확인해 주세요.');
 }
 const cookieName='flow_'+campaign;let token=cookies(request)[cookieName];let fresh=false;
 if(!token||!/^[a-f0-9-]{36,80}$/.test(token)){if(input.action!=='init')throw new ApiError(401,'새로고침 후 다시 시작해 주세요.');token=crypto.randomUUID()+crypto.randomUUID();fresh=true;}
 const attribution={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'])if(typeof input.attribution?.[key]==='string')attribution[key]=input.attribution[key].slice(0,300);
 const data={p_session_hash:await digest(token),p_campaign:campaign,p_action:input.action,p_attribution:attribution,p_question:input.question??null,p_value:input.value??null,p_actor:user?.id||null,p_name:typeof input.name==='string'?input.name.trim():null,p_phone:typeof input.phone==='string'?input.phone.replace(/[\s-]/g,''):null,p_email:user?.email||null,p_consent:input.consent===true};
 let result;try{result=await supabase(env,'/rest/v1/rpc/funnel_action',{method:'POST',privileged:true,body:data});}catch(error){if(input.action==='init'&&error.code==='visit_owner_mismatch'){token=crypto.randomUUID()+crypto.randomUUID();fresh=true;data.p_session_hash=await digest(token);result=await supabase(env,'/rest/v1/rpc/funnel_action',{method:'POST',privileged:true,body:data});}else throw error;}
 const response=json(result);if(fresh)setCookie(response,request,cookieName,token,2592000);return response;
}
async function adminApi(request,env){
 const user=await getUser(request,env);if(!user)throw new ApiError(401,'관리자 계정으로 로그인해 주세요.');if(user.app_metadata?.role!=='admin')throw new ApiError(403,'관리자 권한이 없습니다.');
 const url=new URL(request.url);if(request.method!=='GET')throw new ApiError(405,'허용되지 않은 요청입니다.');
 const offset=Math.max(0,parseInt(url.searchParams.get('offset')||'0',10)||0);
 if(url.pathname==='/api/admin/members'){const rows=await supabase(env,`/rest/v1/profiles?select=id,name,phone,email,created_at&order=created_at.desc&limit=100&offset=${offset}`,{privileged:true});return json({rows});}
 if(url.pathname==='/api/admin/leads'){
  let filter='';const status=url.searchParams.get('status');if(status==='completed')filter='&completed=eq.true';else if(status==='incomplete')filter='&completed=eq.false';else if(status==='abandoned')filter='&completed=eq.false&updated_at=lt.'+encodeURIComponent(new Date(Date.now()-1800000).toISOString());
  const rows=await supabase(env,`/rest/v1/consultations?select=id,campaign,created_at,updated_at,step,answer1,answer2,name,phone,email,completed,completed_at,consent_at,attribution&order=created_at.desc&limit=100&offset=${offset}${filter}`,{privileged:true});return json({rows});
 }
 throw new ApiError(404,'찾을 수 없습니다.');
}
export function createWorker(html,adminHtml='',callbackHtml=''){return {async fetch(request,env){try{
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/')&&!sameOrigin(request))throw new ApiError(403,'허용되지 않은 요청입니다.');
 if(url.pathname==='/api/config'&&request.method==='GET')return json({configured:configured(env)});
 if(url.pathname.startsWith('/api/auth/'))return await authRoute(request,env,url.pathname.split('/').pop(),request.method==='POST'?await body(request):{});
 if(url.pathname.startsWith('/api/admin/'))return await adminApi(request,env);
 const match=url.pathname.match(/^\/api\/campaign\/([a-z0-9][a-z0-9-]{0,63})$/);if(match)return await api(request,env,match[1]);
 if(url.pathname==='/')return Response.redirect(url.origin+'/lp/hokyung',302);
 if(url.pathname==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#2555d9"/><path d="M9 8v16m14-16v16M9 16h14" stroke="white" stroke-width="3"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});
 if(request.method==='GET'){
  const page=url.pathname==='/admin'?adminHtml:url.pathname==='/auth/callback'?callbackHtml:/^\/lp\/[a-z0-9][a-z0-9-]{0,63}\/?$/.test(url.pathname)?html:null;
  if(page!==null)return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
 }
 return new Response('페이지를 찾을 수 없습니다.',{status:404});
 }catch(error){return json({error:error instanceof ApiError?error.message:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},error instanceof ApiError?error.status:500);}}};}
