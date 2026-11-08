const idPattern=/^[a-z0-9-]{8,80}$/i,hashPattern=/^[a-f0-9]{64}$/;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const photoPath=(workspace,hash)=>'/media/'+workspace+'/'+hash+'.jpg';
async function snapshot(env,id){const row=await env.BUCKET.get('catalogues/'+id+'.json');return row?JSON.parse(await row.text()):null;}
export function cleanCatalogue(input,id){
 if(!Number.isSafeInteger(input.revision)||input.revision<0||!Array.isArray(input.items)||input.items.length>1000)throw new Error('Catalogue invalide.');
 const seen=new Set(),items=input.items.map(row=>{
  if(!idPattern.test(row.id)||seen.has(row.id)||!Number.isSafeInteger(row.price_cents)||row.price_cents<0||!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>100000||!text(row.title,150))throw new Error('Article invalide.');seen.add(row.id);
  return {id:row.id,title:text(row.title,150),category:text(row.category,100),description:text(row.description,4000),price_cents:row.price_cents,quantity:row.quantity,site_name:text(row.site_name,120),condition:text(row.condition,150),code:text(row.code,100),photos:(Array.isArray(row.photos)?row.photos:[]).filter(hash=>hashPattern.test(hash)).slice(0,6).map(hash=>photoPath(id,hash))};
 });
 const currency=['EUR','GBP','USD','CAD','AUD','NZD','CHF','JPY'].includes(input.currency)?input.currency:'EUR';
 let email=text(input.contact_email,254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))email='';
 return {name:text(input.name,100)||'Notre ressourcerie',intro:text(input.intro,500),contact_email:email,address:text(input.address,500),hours:text(input.hours,500),currency,revision:input.revision,updated_at:new Date().toISOString(),items};
}
async function authorized(request,env){
 const a=new TextEncoder().encode(request.headers.get('Authorization')||''),b=new TextEncoder().encode('Bearer '+(env.CATALOGUE_WRITE_KEY||''));if(!env.CATALOGUE_WRITE_KEY||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export default {async fetch(request,env){
 const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);
 try{
  if(parts[0]==='api'&&parts[1]==='update'){
   if(!await authorized(request,env))return reply({error:'Accès refusé.'},401);
   const id=parts[2];if(!idPattern.test(id||''))return reply({error:'Espace invalide.'},400);
   if(request.method!=='PUT')return reply({error:'Méthode indisponible.'},405);
   if(parts[3]==='media'){
    const hash=parts[4];if(!hashPattern.test(hash||''))return reply({error:'Photo invalide.'},400);
    if(Number(request.headers.get('Content-Length'))>400000)return reply({error:'Photo trop lourde.'},413);
    const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>400000||bytes[0]!==255||bytes[1]!==216)return reply({error:'Photo JPEG requise.'},400);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==hash)return reply({error:'Photo non conforme.'},400);
    await env.BUCKET.put('media/'+id+'/'+hash,bytes);return reply({ok:true});
   }
   if(parts.length!==3)return reply({error:'Introuvable.'},404);
   const data=await request.text();if(data.length>2000000)return reply({error:'Catalogue trop grand.'},413);
   const next=cleanCatalogue(JSON.parse(data),id),previous=await snapshot(env,id);if(previous&&previous.revision>next.revision)return reply({error:'Version plus récente disponible.'},409);
   await env.BUCKET.put('catalogues/'+id+'.json',JSON.stringify(next));return reply({ok:true,count:next.items.length});
  }
  if(parts[0]==='api'&&parts[1]==='catalogue'&&idPattern.test(parts[2]||'')&&parts.length===3){
   if(request.method!=='GET')return reply({error:'Méthode indisponible.'},405);
   const row=await snapshot(env,parts[2]);return row?reply(row):reply({error:'Ce catalogue n’est pas encore publié.'},404);
  }
  if(parts[0]==='media'&&idPattern.test(parts[1]||'')&&/^[a-f0-9]{64}\.jpg$/.test(parts[2]||'')&&parts.length===3){
   if(request.method!=='GET')return reply({error:'Méthode indisponible.'},405);
   const row=await snapshot(env,parts[1]);if(!row?.items.some(item=>item.photos.includes(url.pathname)))return reply({error:'Photo indisponible.'},404);
   const photo=await env.BUCKET.get('media/'+parts[1]+'/'+parts[2].slice(0,-4));return photo?new Response(photo.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}):reply({error:'Photo indisponible.'},404);
  }
  if(parts[0]==='api')return reply({error:'Introuvable.'},404);
  if(url.pathname==='/'&&!url.searchParams.has('r'))return env.ASSETS.fetch(new Request(new URL('/decouvrir.html',url),request));
  return env.ASSETS.fetch(request);
 }catch{return reply({error:'Le catalogue est temporairement indisponible.'},400);}
}};
