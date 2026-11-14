import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname,resolve,sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.mjs';
import catalogue from '../../catalogue/worker/index.mjs';
import { fileBucket,localBindings } from '../scripts/local-bindings.mjs';
import { openAccounts } from './auth.mjs';
import { wooFetch } from './woo-fetch.mjs';

process.umask(0o077);
const directory=process.env.DATA_DIR||'/data';
const port=Number(process.env.PORT||3000);
const bindings=await localBindings(directory);
const accounts=openAccounts(directory);
await accounts.provision(process.env.ADMIN_EMAIL,process.env.ADMIN_NAME||'Responsable',process.env.ADMIN_PASSWORD);
delete process.env.ADMIN_PASSWORD;

const mimeTypes={
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
  '.jpg':'image/jpeg','.png':'image/png','.avif':'image/avif','.woff2':'font/woff2',
  '.bin':'application/octet-stream','.gz':'application/gzip','.txt':'text/plain; charset=utf-8',
};
const responseText=(message,status)=>new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8'}});
const redirect=(location,cookie)=>new Response(null,{status:303,headers:{Location:location,...(cookie?{'Set-Cookie':cookie}:{})}});
const loginHtml=await readFile(new URL('./login.html',import.meta.url),'utf8');
const appAssets=assets(new URL('../dist/client/',import.meta.url));
const catalogueAssets=assets(new URL('../../catalogue/public/',import.meta.url),true);
const catalogueKey=accounts.secret('catalogue');
const commerceKey=accounts.secret('commerce');
const catalogueEnv={ASSETS:catalogueAssets,BUCKET:fileBucket(resolve(directory,'catalogue')),CATALOGUE_WRITE_KEY:catalogueKey};
const cataloguePrefix='/vitrine';

function assets(directory,publicCatalogue=false) {
  const root=resolve(fileURLToPath(directory));
  return {async fetch(request) {
    if(!['GET','HEAD'].includes(request.method)) return responseText('Méthode indisponible.',405);
    const route=decodeURIComponent(new URL(request.url).pathname);
    const path=resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!path.startsWith(root+sep)) return responseText('Introuvable.',404);
    try {
      let contents=await readFile(path);
      if(publicCatalogue && extname(path)==='.html') {
        contents=contents.toString('utf8')
          .replaceAll('https://seconde-vie-atelier.gary-legrill.chatgpt.site','')
          .replaceAll('class="brand" href="/"','class="brand" href="/vitrine/"')
          .replaceAll(/(href|src)="\/(presentation\.[^"]+|style\.css|catalogue\.js|assets\/[^"]+)"/g,'$1="/vitrine/$2"');
      }
      if(publicCatalogue && path.endsWith('/catalogue.js')) contents=contents.toString('utf8')
        .replace("'/api/catalogue/","'/vitrine/api/catalogue/");
      if(publicCatalogue && path.endsWith('/presentation.css'))
        contents=contents.toString('utf8').replaceAll('/assets/','/vitrine/assets/');
      if(!publicCatalogue && path===resolve(root,'index.html'))
        contents=contents.toString('utf8').replace('<html lang="fr">','<html lang="fr" data-self-hosted>');
      return new Response(request.method==='HEAD'?null:contents,{headers:{'Content-Type':mimeTypes[extname(path)]||'application/octet-stream'}});
    } catch(error) {
      if(['ENOENT','EISDIR','ENOTDIR'].includes(error.code)) return responseText('Introuvable.',404);
      throw error;
    }
  }};
}

function catalogueRequest(request) {
  const url=new URL(request.url);
  url.pathname=url.pathname.slice(cataloguePrefix.length)||'/';
  return catalogue.fetch(new Request(url,request),catalogueEnv);
}

function loginPage(message='',status=200) {
  const html=message?loginHtml.replace('<form class="stack"',`<p class="form-error" role="alert">${message}</p><form class="stack"`):loginHtml;
  return new Response(html,{status,headers:{'Content-Type':mimeTypes['.html']}});
}

async function handle(request,address) {
  const url=new URL(request.url);
  if(url.pathname===cataloguePrefix) return redirect(cataloguePrefix+'/');
  if(url.pathname.startsWith(cataloguePrefix+'/')) {
    if(!['GET','HEAD'].includes(request.method)||url.pathname.startsWith(cataloguePrefix+'/api/update/'))
      return responseText('Introuvable.',404);
    const response=await catalogueRequest(request);
    if(response.ok && url.pathname.startsWith(cataloguePrefix+'/api/catalogue/')) {
      const data=await response.json();
      for(const item of data.items) item.photos=item.photos.map(photo=>cataloguePrefix+photo);
      return Response.json(data,{headers:response.headers});
    }
    return response;
  }
  if(url.pathname==='/health' && request.method==='GET') {
    await bindings.DB.prepare('SELECT 1').first();
    return Response.json({status:'ok'});
  }
  if(url.pathname==='/auth/login' || url.pathname==='/auth/logout') {
    if(request.method==='GET' && url.pathname==='/auth/login')
      return accounts.identity(request)?redirect('/'):loginPage();
    if(request.method!=='POST' || request.headers.get('Origin')!==url.origin ||
        !request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))
      return responseText('Requête refusée.',403);
    if(url.pathname==='/auth/logout') return redirect('/auth/login',accounts.signOut(request));
    const values=Object.fromEntries(new URLSearchParams(await request.text()));
    const result=await accounts.signIn(values,address);
    if(result.status===200) return redirect('/',result.cookie);
    if(result.status===429) return loginPage('Trop de tentatives. Réessayez dans quelques minutes.',429);
    return loginPage('E-mail ou mot de passe incorrect.',401);
  }
  const actor=accounts.identity(request);
  if(actor) {
    request.headers.set('oai-authenticated-user-id',actor.id);
    request.headers.set('oai-authenticated-user-email',actor.email);
    request.headers.set('oai-authenticated-user-full-name',encodeURIComponent(actor.name));
    request.headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
  }
  if(!actor && url.pathname.startsWith('/api/') && url.pathname!=='/api/core/bootstrap')
    return Response.json({error:'Connectez-vous à votre espace.'},{status:401});
  if(url.pathname==='/api/photo-bench')
    return Response.json({error:'Comparateur de développement indisponible.'},{status:404});
  return worker.fetch(request,{
    ...process.env,...bindings,ASSETS:appAssets,WOO_FETCH:wooFetch,
    CATALOGUE_URL:url.origin+cataloguePrefix,CATALOGUE_WRITE_KEY:catalogueKey,
    CATALOGUE_FETCH:(value,options)=>catalogueRequest(new Request(value,options)),
    COMMERCE_ENCRYPTION_KEY:commerceKey,
  });
}

const publicOrigin=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN):null;
if(publicOrigin && (publicOrigin.protocol!=='https:' || publicOrigin.href!==publicOrigin.origin+'/'))
  throw new Error('PUBLIC_ORIGIN doit être une origine HTTPS sans chemin.');
const server=createServer(async(incoming,outgoing)=>{
  try {
    const forwarded=incoming.headers['x-forwarded-proto'];
    const scheme=forwarded==='https'?'https:':'http:';
    const host=incoming.headers.host;
    if(!host || !/^[a-z0-9.\-\[\]:]+$/i.test(host) || !incoming.url.startsWith('/') || incoming.url.startsWith('//'))
      return outgoing.writeHead(400).end();
    const origin=publicOrigin?.origin||scheme+'//'+host;
    const url=new URL(incoming.url,origin);
    if(url.origin!==origin) return outgoing.writeHead(400).end();
    if(url.pathname!=='/health' && (scheme!=='https:' || publicOrigin && host!==publicOrigin.host))
      return outgoing.writeHead(publicOrigin?308:400,publicOrigin?{Location:publicOrigin.origin+url.pathname+url.search}:{}).end();
    const headers=new Headers(incoming.headers);
    for(const key of [...headers.keys()]) if(key.startsWith('oai-authenticated-')) headers.delete(key);
    const method=incoming.method;
    const chunks=[];
    if(!['GET','HEAD'].includes(method)) {
      const limit=url.pathname.startsWith('/api/')?12000000:4096;
      let size=0;
      for await(const chunk of incoming) {
        size+=chunk.length;
        if(size>limit) {outgoing.writeHead(413).end();return;}
        chunks.push(chunk);
      }
    }
    const body=chunks.length?Buffer.concat(chunks):undefined;
    const request=new Request(url,{method,headers,body});
    const address=String(incoming.headers['x-forwarded-for']||incoming.socket.remoteAddress).split(',').at(-1).trim().slice(0,80);
    const response=await handle(request,address);
    outgoing.writeHead(response.status,{
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Referrer-Policy':'same-origin',...Object.fromEntries(response.headers),
    });
    if(response.body && method!=='HEAD') await pipeline(Readable.fromWeb(response.body),outgoing);
    else outgoing.end();
  } catch(error) {
    if(!outgoing.headersSent) outgoing.writeHead(500).end('Service temporairement indisponible.');
    else outgoing.destroy();
    if(error.code!=='ERR_STREAM_PREMATURE_CLOSE') console.error(error.name,error.code||'');
  }
});
server.listen(port,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close(()=>{
  accounts.close();
  bindings.close();
}));
