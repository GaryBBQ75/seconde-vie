import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import worker from '../worker/index.mjs';
import { localBindings } from './local-bindings.mjs';
import {buildCalendar} from './build-calendar.mjs';

await buildCalendar();
const bindings=await localBindings('.local');

const publicDir = resolve('public');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml', '.woff2':'font/woff2', '.json':'application/json', '.bin':'application/octet-stream' };
const assets = { async fetch(request) {
  const route = decodeURIComponent(new URL(request.url).pathname);
  const path = resolve(publicDir, '.' + (route === '/' ? '/index.html' : route));
  if (!path.startsWith(publicDir + sep)) return new Response('Introuvable', { status:404 });
  try {
    return new Response(await readFile(path), { headers:{ 'Content-Type':types[extname(path)] || 'text/plain' } });
  } catch { return new Response('Introuvable', { status:404 }); }
} };

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://' + incoming.headers.host);
    const headers=new Headers(incoming.headers);
    headers.set('oai-authenticated-user-id',process.env.PREVIEW_USER_ID || 'preview-owner');
    headers.set('oai-authenticated-user-email',process.env.PREVIEW_USER_EMAIL || 'preview@example.test');
    headers.set('oai-authenticated-user-full-name','Responsable aperçu');
    const chunks=[];
    for await(const chunk of incoming) chunks.push(chunk);
    const body=['GET','HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks);
    const response = await worker.fetch(new Request(url, { method:incoming.method, headers,body }), {
      ...bindings,
      ASSETS:assets, BRAVE_SEARCH_API_KEY:process.env.BRAVE_SEARCH_API_KEY,
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(400).end();
  }
}).listen(Number(process.env.PORT) || 4173, '0.0.0.0');
