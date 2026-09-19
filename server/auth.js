import {ApiError,supabase,cookies,setSession,setCookie,clearSession,getUser,publicUser} from './supabase.js';
const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
const emailValid=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export async function authRoute(request,env,action,input){
 if(action==='session'&&request.method==='GET'){
  let user=await getUser(request,env);if(user)return json({user:publicUser(user)});
  const refresh=cookies(request).sb_refresh;if(!refresh)return json({user:null});
  try{const session=await supabase(env,'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});const response=json({user:publicUser(session.user)});setSession(response,request,session);return response;}catch(error){if(error.status===503)throw error;const r=json({user:null});clearSession(r,request);return r;}
 }
 if(request.method!=='POST')throw new ApiError(405,'허용되지 않은 요청입니다.');
 if(action==='logout'){const access=cookies(request).sb_access;if(access){try{await supabase(env,'/auth/v1/logout',{method:'POST',accessToken:access});}catch{}}const response=json({ok:true});clearSession(response,request);return response;}
 if(action==='session'){
  if(!input.state||input.state!==cookies(request).auth_state)throw new ApiError(400,'인증을 요청한 브라우저에서 링크를 열어 주세요.');
  if(typeof input.access_token!=='string'||typeof input.refresh_token!=='string'||input.access_token.length>8000||input.refresh_token.length>8000)throw new ApiError(400,'올바르지 않은 인증 응답입니다.');
  const user=await supabase(env,'/auth/v1/user',{accessToken:input.access_token});
  const session=await supabase(env,'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:input.refresh_token}});
  if(session.user?.id!==user.id)throw new ApiError(400,'올바르지 않은 인증 세션입니다.');
  const response=json({user:publicUser(user)});setSession(response,request,session);setCookie(response,request,'auth_state','',0);return response;
 }
 if(action==='password'){
  const user=await getUser(request,env);if(!user)throw new ApiError(401,'비밀번호 재설정 링크를 다시 열어 주세요.');
  if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)throw new ApiError(400,'비밀번호는 8~128자로 입력해 주세요.');
  await supabase(env,'/auth/v1/user',{method:'PUT',accessToken:cookies(request).sb_access,body:{password:input.password}});return json({ok:true});
 }
 if(!emailValid(input.email))throw new ApiError(400,'이메일을 확인해 주세요.');
 const email=input.email.trim().toLowerCase();
 const campaign=/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.campaign||'')?input.campaign:'hokyung';
 const state=crypto.randomUUID();const redirect=new URL('/auth/callback',request.url);redirect.searchParams.set('campaign',campaign);redirect.searchParams.set('state',state);
 if(action==='recover'){await supabase(env,'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect.href),{method:'POST',body:{email}});const r=json({message:'등록된 계정이 있다면 비밀번호 재설정 메일을 발송합니다.'});setCookie(r,request,'auth_state',state,3600);return r;}
 if(!['signup','login'].includes(action))throw new ApiError(404,'찾을 수 없습니다.');
 if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)throw new ApiError(400,'비밀번호는 8~128자로 입력해 주세요.');
 if(action==='signup'){
  const name=typeof input.name==='string'?input.name.trim():'',phone=typeof input.phone==='string'?input.phone.replace(/[\s-]/g,''):'';
  if(name.length<2||name.length>50||!/^01[016789]\d{7,8}$/.test(phone)||input.consent!==true)throw new ApiError(400,'이름·연락처·개인정보 동의를 확인해 주세요.');
  const data=await supabase(env,'/auth/v1/signup?redirect_to='+encodeURIComponent(redirect.href),{method:'POST',body:{email,password:input.password,data:{name,phone}}});
  const response=json({user:data.access_token?publicUser(data.user):null,confirmationRequired:!data.access_token,message:data.access_token?'가입되었습니다.':'이메일을 확인해 인증한 뒤 로그인해 주세요. 이미 가입했다면 로그인해 주세요.'});if(data.access_token)setSession(response,request,data);else setCookie(response,request,'auth_state',state,3600);return response;
 }
 const data=await supabase(env,'/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:input.password}});const response=json({user:publicUser(data.user)});setSession(response,request,data);return response;
}
