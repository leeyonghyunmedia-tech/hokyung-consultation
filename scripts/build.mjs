import {mkdirSync,writeFileSync} from 'node:fs';
// Only the serverless handler serves pages. Never copy .env or source into public.
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
writeFileSync(new URL('../public/robots.txt',import.meta.url),'User-agent: *\nDisallow: /admin\nDisallow: /api/\n');
await import('../server/pages.js');
console.log('Page templates validated.');
