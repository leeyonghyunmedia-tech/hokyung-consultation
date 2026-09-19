import {mkdirSync} from 'node:fs';
// Only the serverless handler serves pages. Never copy .env or source into public.
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
await import('../server/pages.js');
console.log('Page templates validated.');
