import {readFileSync} from 'node:fs';
import {createWorker} from './worker.js';
const read=path=>readFileSync(new URL('../web/'+path,import.meta.url),'utf8');
export const worker=createWorker(read('index.html').replace('/* STYLE */',()=>read('styles.css')).replace('/* SCRIPT */',()=>read('app.js')),read('admin.html').replace('/* ADMIN_SCRIPT */',()=>read('admin.js')),read('callback.html'));
