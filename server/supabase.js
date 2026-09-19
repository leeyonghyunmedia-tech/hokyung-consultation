export class ApiError extends Error{constructor(status,message,code=''){super(message);this.status=status;this.code=code;}}
export function configured(env){return !!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY&&env.SUPABASE_SECRET_KEY);}
export async function supabase(env,path,{method='GET',body,accessToken,privileged=false,headers={}}={}){
 if(!configured(env))throw new ApiError(503,'Supabase 연결 설정이 필요합니다. 현재 데이터는 저장되지 않습니다.','not_configured');
 const origin=new URL(env.SUPABASE_URL);if(origin.protocol!=='https:')throw new ApiError(503,'Supabase URL 설정을 확인해 주세요.');
 const key=privileged?env.SUPABASE_SECRET_KEY:env.SUPABASE_PUBLISHABLE_KEY;
 const requestHeaders={apikey:key,'Content-Type':'application/json',...headers};
 if(accessToken)requestHeaders.Authorization='Bearer '+accessToken;
 else if(key.startsWith('eyJ'))requestHeaders.Authorization='Bearer '+key;
 let response;try{response=await(env.FETCH||fetch)(origin.origin+path,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new ApiError(503,'인증·저장 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
 const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
 if(!response.ok){const code=data.error_code||data.code||'';
  if(data.message==='visit_owner_mismatch')throw new ApiError(403,'이 방문에 접근할 수 없습니다.','visit_owner_mismatch');
  if(code==='invalid_credentials')throw new ApiError(401,'이메일과 비밀번호를 확인해 주세요.');
  if(code==='email_not_confirmed')throw new ApiError(401,'이메일 인증을 먼저 완료해 주세요.');
  if(code==='weak_password')throw new ApiError(400,'프로젝트의 비밀번호 조건을 만족하는 비밀번호를 입력해 주세요.');
  if(response.status===429)throw new ApiError(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  if(response.status===401||response.status===403)throw new ApiError(401,'로그인이 만료되었거나 접근 권한이 없습니다.');
  if(path.startsWith('/rest/'))throw new ApiError(response.status>=500?503:400,'저장하지 못했습니다. 입력 내용과 DB 초기 설정을 확인해 주세요.');
  throw new ApiError(400,'요청을 처리하지 못했습니다. 입력 내용과 이메일 인증 상태를 확인해 주세요.');
 }
 return data;
}
export function cookies(request){return Object.fromEntries((request.headers.get('cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s)).filter(x=>x.length>=2).map(([k,v])=>[k,v]));}
export function setCookie(response,request,name,value,maxAge){response.headers.append('Set-Cookie',`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`);}
export function setSession(response,request,session){setCookie(response,request,'sb_access',session.access_token,Math.min(session.expires_in||3600,3600));setCookie(response,request,'sb_refresh',session.refresh_token,2592000);}
export function clearSession(response,request){setCookie(response,request,'sb_access','',0);setCookie(response,request,'sb_refresh','',0);}
export async function getUser(request,env){const token=cookies(request).sb_access;if(!token)return null;try{return await supabase(env,'/auth/v1/user',{accessToken:token});}catch(error){if(error.status===401)return null;throw error;}}
export function publicUser(user){return user?{id:user.id,email:user.email,name:user.user_metadata?.name||'',phone:user.user_metadata?.phone||'',admin:user.app_metadata?.role==='admin'}:null;}
