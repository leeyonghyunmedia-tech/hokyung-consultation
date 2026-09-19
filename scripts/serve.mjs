import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorker,purgeExpired} from '../server/worker.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=path=>readFileSync(resolve(root,path),'utf8');
const dbPath=resolve(root,process.env.SQLITE_PATH||'data/consultations.sqlite');
mkdirSync(dirname(dbPath),{recursive:true});
const sqlite=new DatabaseSync(dbPath);try{chmodSync(dbPath,0o600)}catch{}
sqlite.exec('PRAGMA journal_mode=WAL;');sqlite.exec(file('drizzle/0000_consultations.sql'));
const DB={prepare(sql){let values=[];const stmt=sqlite.prepare(sql);return{bind(...args){values=args;return this;},async first(){return stmt.get(...values)||null;},async run(){return stmt.run(...values);}}}};
const html=file('web/index.html').replace('/* STYLE */',file('web/styles.css')).replace('/* SCRIPT */',file('web/app.js'));
const worker=createWorker(html),port=Number(process.env.PORT||5173),host=process.env.HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const publicOrigin=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:null;
const server=createServer(async(req,res)=>{try{
 const authority=req.headers.host;if(!authority||!/^([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d+)?$/.test(authority)){res.writeHead(400);res.end();return;}
 const origin=publicOrigin||'http://'+authority;
 const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>5000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
 if(!req.url.startsWith('/')){res.writeHead(400);res.end();return;}
 const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Server error');}});
server.requestTimeout=30000;server.headersTimeout=15000;
await purgeExpired(DB);const cleanup=setInterval(()=>purgeExpired(DB).catch(()=>console.error('Retention cleanup failed')),86400000);cleanup.unref();
server.listen(port,host,()=>console.log(`Local: http://127.0.0.1:${port}/lp/hokyung`));
function stop(){clearInterval(cleanup);server.close(()=>{sqlite.close();process.exit(0)});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
