import {env} from './env.mjs';import {supabase} from '../server/supabase.js';
const email=(env.ADMIN_EMAIL||'').trim().toLowerCase(),password=env.ADMIN_PASSWORD||'';
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128){console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of 8–128 characters in local .env.');process.exit(1);}
try{
 // Do not overwrite the password or elevate an existing account automatically.
 let existing=null;for(let page=1;;page++){const data=await supabase(env,`/auth/v1/admin/users?page=${page}&per_page=100`,{privileged:true});const users=data.users||[];existing=users.find(u=>u.email?.toLowerCase()===email);if(existing||users.length<100)break;}
 if(existing){if(existing.app_metadata?.role==='admin'){console.log('Administrator already exists. Password was not changed.');process.exit(0);}throw Error('This email already belongs to a user. Verify ownership in Supabase, then assign app_metadata.role=admin explicitly. No account was changed.');}
 await supabase(env,'/auth/v1/admin/users',{method:'POST',privileged:true,body:{email,password,email_confirm:true,app_metadata:{role:'admin'},user_metadata:{name:'관리자',phone:''}}});
 console.log('Administrator created. Sign in at /admin. Remove ADMIN_PASSWORD from .env after provisioning.');
}catch(error){console.error(error.message);process.exitCode=1;}
