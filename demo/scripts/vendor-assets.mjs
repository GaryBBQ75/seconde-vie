import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const manifest=JSON.parse(await readFile(new URL('./vendor-assets.json',import.meta.url),'utf8'));
const sha256=data=>createHash('sha256').update(data).digest('hex');
function member(archive,name) {
  const tar=gunzipSync(archive,{maxOutputLength:50000000});
  for(let offset=0;offset+512<=tar.length;) {
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    const field=(start,end)=>header.subarray(start,end).toString('utf8').replace(/\0.*$/s,'').trim();
    const size=parseInt(field(124,136),8),prefix=field(345,500);
    if(!Number.isSafeInteger(size) || size<0 || offset+512+size>tar.length)throw new Error('Archive du modèle invalide.');
    const path=[prefix,field(0,100)].filter(Boolean).join('/').replace(/^\.\//,'');
    if(path===name && (header[156]===0 || header[156]===48))return tar.subarray(offset+512,offset+512+size);
    offset+=512+Math.ceil(size/512)*512;
  }
  throw new Error('Poids du modèle absents de l’archive.');
}

// Large, unchanged third-party weights are fetched at build time in a fresh
// GitHub checkout. The published Site still serves every asset from its origin.
export async function ensureVendorAssets(directory=fileURLToPath(new URL('../public/vendor/',import.meta.url))) {
  const downloads=new Map();
  for(const [path,asset] of Object.entries(manifest)) {
    const target=join(directory,path);
    const existing=await readFile(target).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
    if(existing && sha256(existing)===asset.sha256)continue;
    if(!downloads.has(asset.url))downloads.set(asset.url,(async()=>{
      const response=await fetch(asset.url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('Téléchargement impossible : '+path+' ('+response.status+').');
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length>25000000)throw new Error('Ressource trop volumineuse.');
      return data;
    })());
    const downloaded=await downloads.get(asset.url);
    const contents=asset.member ? member(downloaded,asset.member) : downloaded;
    if(sha256(contents)!==asset.sha256)throw new Error('Empreinte incorrecte : '+path+'.');
    await mkdir(dirname(target),{recursive:true});await writeFile(target,contents);
    console.log('Ressource vérifiée : '+path);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await ensureVendorAssets();
