import {env} from './env.mjs';
import {supabase} from '../server/supabase.js';
// Run daily on a trusted scheduler. Auth deletion cascades to profiles and consultations.
const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
const expired=[];
for(let page=1;;page++){
 const result=await supabase(env,`/auth/v1/admin/users?page=${page}&per_page=100`,{privileged:true});
 const users=result.users||[];
 for(const user of users)if(user.app_metadata?.role!=='admin'&&new Date(user.created_at)<cutoff)expired.push(user.id);
 if(users.length<100)break;
}
for(const id of expired)await supabase(env,'/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE',privileged:true});
await supabase(env,'/rest/v1/rpc/purge_expired_consultations',{method:'POST',privileged:true,body:{}});
console.log(`Retention cleanup complete: ${expired.length} expired non-admin accounts removed.`);
