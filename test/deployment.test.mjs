import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.mjs';
function response(){return {status:0,headers:{},body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body?.toString()||'';}};}
test('serverless handler serves original path and rejects cross-site requests',async()=>{
 process.env.PUBLIC_ORIGIN='https://fixture.example';process.env.SUPABASE_SECRET_KEY='fixture';
 const page=response();await handler({url:'/admin',method:'GET',headers:{}},page);assert.equal(page.status,200);assert.match(page.body,/관리자 로그인/);assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
 const denied=response();await handler({url:'/api/auth/login',method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:{email:'fixture@example.test',password:'fixturePassword123!'}},denied);assert.equal(denied.status,403);
 const large=response();await handler({url:'/api/auth/login',method:'POST',headers:{},body:'x'.repeat(18001)},large);assert.equal(large.statusCode,413);
 delete process.env.PUBLIC_ORIGIN;delete process.env.SUPABASE_SECRET_KEY;
});
test('unconfigured production fails closed',async()=>{const res=response();await handler({url:'/lp/hokyung',method:'GET',headers:{}},res);assert.equal(res.status,503);});
