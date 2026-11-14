import {commerceHost,onlineQuantity} from '../public/commerce-model.js';
import {itemPhotos} from '../public/photos.js';
import {hasRole} from '../public/permissions.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});},now=()=>new Date().toISOString();
const productDescription=row=>[row.description,row.condition?'État : '+row.condition:'',row.reference?.brand?'Marque : '+row.reference.brand:'',row.reference?.model?'Modèle : '+row.reference.model:'',row.barcode?'EAN / ISBN : '+row.barcode:''].filter(Boolean).join('\n');
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hex=bytes=>[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function seal(value,secret,workspace){
 if(!/^[a-f0-9]{64}$/.test(secret||''))fail(503,'Le coffre des connexions doit être configuré côté serveur.');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 return {iv:hex(iv),data:hex(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(workspace)},key,new TextEncoder().encode(JSON.stringify(value)))))};
}
export async function unseal(value,secret,workspace){
 try{const decode=v=>Uint8Array.from(v.match(/../g),v=>parseInt(v,16)),key=await crypto.subtle.importKey('raw',decode(secret),{name:'AES-GCM'},false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData:new TextEncoder().encode(workspace)},key,decode(value.data))));}catch{fail(503,'Reconnectez cette boutique : ses identifiants ne sont plus lisibles.');}
}
export async function privateRecord(env,workspace,id){const row=await env.DB.prepare("SELECT data FROM sv_records WHERE workspace_id=? AND type='commerce_private' AND id=?").bind(workspace,id).first();return row?JSON.parse(row.data):null;}
async function savePrivate(env,workspace,id,value){await env.DB.prepare("INSERT INTO sv_records(workspace_id,type,id,data) VALUES(?,'commerce_private',?,?) ON CONFLICT(workspace_id,type,id) DO UPDATE SET data=excluded.data").bind(workspace,id,JSON.stringify(value)).run();}
async function locked(env,workspace,provider,fn){
 const key='lock-'+provider,id=crypto.randomUUID(),stamp=Date.now();
 const lock=await env.DB.prepare("INSERT INTO sv_records(workspace_id,type,id,data) VALUES(?,'commerce_private',?,?) ON CONFLICT(workspace_id,type,id) DO UPDATE SET data=excluded.data WHERE json_extract(sv_records.data,'$.expires')<?").bind(workspace,key,JSON.stringify({id,expires:stamp+600000}),stamp).run();
 if(!lock.meta.changes)fail(409,'Une synchronisation est déjà en cours. Réessayez dans un instant.');
 try{return await fn();}finally{await env.DB.prepare("DELETE FROM sv_records WHERE workspace_id=? AND type='commerce_private' AND id=? AND json_extract(data,'$.id')=?").bind(workspace,key,id).run();}
}
function summary(row,provider){return {provider,connected:Boolean(row?.credentials),enabled:row?.enabled===true,host:row?.host||'',name:row?.name||'',location_id:row?.location_id||'',last_sync:row?.last_sync||'',error:row?.error||'',links:row?.links||{},log:row?.log||[]};}
async function jsonFetch(url,options={},transport=fetch){
 let response;try{response=await transport(url,{...options,redirect:'error',signal:AbortSignal.timeout(18000)});}catch{fail(502,'La boutique n’a pas répondu. Vérifiez son adresse et ses accès.');}
 if(!response.ok)fail(502,response.status===401||response.status===403?'La boutique a refusé les identifiants ou leurs droits.':response.status===429?'La boutique limite les appels. Réessayez plus tard.':'La boutique a refusé l’opération (HTTP '+response.status+').');
 const data=await response.json().catch(()=>null);if(!data)fail(502,'Réponse de la boutique illisible.');return data;
}
export function publicAddress(value){if(typeof value!=='string')return false;if(value.includes(':'))return /^[23][a-f0-9]{0,3}:/i.test(value)&&!/^2001:(?:db8|0):/i.test(value);const n=value.split('.').map(Number);return n.length===4&&n.every(v=>Number.isInteger(v)&&v>=0&&v<256)&&n[0]>0&&n[0]<224&&![10,127].includes(n[0])&&!(n[0]===169&&n[1]===254)&&!(n[0]===172&&n[1]>=16&&n[1]<=31)&&!(n[0]===192&&[0,168].includes(n[1]))&&!(n[0]===100&&n[1]>=64&&n[1]<=127)&&!(n[0]===198&&[18,19,51].includes(n[1]))&&!(n[0]===203&&n[1]===0);}
async function verifyPublicHost(host){const name=new URL(host).hostname,results=await Promise.all(['A','AAAA'].map(type=>jsonFetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(name)+'&type='+type,{headers:{Accept:'application/dns-json'}})));const addresses=results.flatMap(data=>(data.Answer||[]).filter(v=>[1,28].includes(v.type)).map(v=>v.data));if(!addresses.length||addresses.some(v=>!publicAddress(v)))fail(400,'Cette boutique ne correspond pas à une adresse internet publique.');}
async function woo(env,row,credentials,path,method='GET',body){if(!env.WOO_FETCH)await verifyPublicHost(row.host);return jsonFetch(row.host+'/wp-json/wc/v3/'+path,{method,headers:{Authorization:'Basic '+btoa(credentials.key+':'+credentials.secret),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env.WOO_FETCH);}
async function shop(row,credentials,query,variables={}){const data=await jsonFetch(row.host+'/admin/api/2026-10/graphql.json',{method:'POST',headers:{'X-Shopify-Access-Token':credentials.token,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});if(data.errors?.length)fail(502,'Shopify refuse cet appel. Vérifiez les droits produits, stocks et emplacements.');return data.data;}
function checked(payload){if(!payload||payload.userErrors?.length)fail(409,'La boutique signale un conflit ou une information produit manquante. Vérifiez la fiche dans la boutique puis réessayez.');return payload;}
async function probe(env,provider,row,credentials,currency){
 if(provider==='woocommerce'){
  const settings=await woo(env,row,credentials,'settings/general/woocommerce_currency');if(settings.value!==currency)fail(409,'La devise de la boutique diffère de celle de la ressourcerie.');await woo(env,row,credentials,'products?per_page=1');return {name:new URL(row.host).hostname};
 }
 const data=await shop(row,credentials,'query { shop { name currencyCode } locations(first:20) { nodes { id name isActive } } }');if(data.shop.currencyCode!==currency)fail(409,'La devise de la boutique diffère de celle de la ressourcerie.');const location=data.locations.nodes.find(v=>v.isActive&&(!row.location_id||row.location_id===v.id));if(!location)fail(400,'Choisissez un emplacement Shopify actif.');return {name:data.shop.name,location_id:location.id};
}
export async function publishCatalogue(env,workspace,state,{upload=true}={}){
 if(!env.CATALOGUE_URL||!env.CATALOGUE_WRITE_KEY)fail(503,'Le catalogue public doit être configuré côté serveur.');
 return locked(env,workspace.id,'catalogue',async()=>{
  const record=await privateRecord(env,workspace.id,'catalogue')||{photos:{}},photos=record.photos||{},active=state.settings.modules?.includes('vitrine')&&state.settings.catalogue?.enabled,items=[];let budget=18,pending=0;
  try{
   for(const row of active?state.stock.filter(row=>onlineQuantity(row)>0):[]){
    const hashes=[];let incomplete=false;
    for(const source of itemPhotos(row)){
     if(!photos[source]&&upload&&budget>0&&source.startsWith('/api/core/photos/'+workspace.id+'/')){
      const object=await env.BUCKET.get(workspace.id+'/'+source.split('/').pop());if(!object)continue;const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
      await jsonFetch(env.CATALOGUE_URL+'/api/update/'+workspace.id+'/media/'+hash,{method:'PUT',headers:{Authorization:'Bearer '+env.CATALOGUE_WRITE_KEY,'Content-Type':'image/jpeg'},body:bytes},env.CATALOGUE_FETCH);photos[source]=hash;budget--;
     }
     if(photos[source])hashes.push(photos[source]);else if(upload)incomplete=true;
    }
    if(incomplete){pending++;continue;}
    items.push({id:row.id,title:row.title,code:row.code,category:row.category,description:row.description,condition:row.condition,price_cents:row.price_cents,quantity:onlineQuantity(row),site_name:row.site_name,photos:hashes});
   }
   const data=await jsonFetch(env.CATALOGUE_URL+'/api/update/'+workspace.id,{method:'PUT',headers:{Authorization:'Bearer '+env.CATALOGUE_WRITE_KEY,'Content-Type':'application/json'},body:JSON.stringify({...state.settings.catalogue,name:workspace.name,currency:state.settings.currency,revision:workspace.revision,items})},env.CATALOGUE_FETCH);
   Object.assign(record,{photos,last_sync:now(),error:'',pending,count:data.count,url:env.CATALOGUE_URL+'/catalogue.html?r='+workspace.id});await savePrivate(env,workspace.id,'catalogue',record);return {url:record.url,count:data.count,pending,last_sync:record.last_sync};
  }catch(error){record.error=error.message;record.photos=photos;await savePrivate(env,workspace.id,'catalogue',record);throw error;}
 });
}
async function publicPhotos(env,workspace,row){const catalogue=await privateRecord(env,workspace,'catalogue');return itemPhotos(row).map(source=>catalogue?.photos?.[source]).filter(Boolean).map(hash=>env.CATALOGUE_URL+'/media/'+workspace+'/'+hash+'.jpg');}
async function syncProduct(env,workspace,provider,record,row){
 const credentials=await unseal(record.credentials,env.COMMERCE_ENCRYPTION_KEY,workspace),quantity=onlineQuantity(row),existing=record.links?.[row.id]?.external_id?record.links[row.id]:null,images=await publicPhotos(env,workspace,row),sku='SV-'+row.id;
 if(!existing&&!quantity)fail(400,'Sélectionnez un objet prêt, tarifé et affiché au catalogue.');
 if(itemPhotos(row).length&&images.length!==itemPhotos(row).length&&quantity)fail(409,'Publiez d’abord les photos dans le catalogue public, puis relancez l’envoi.');
 if(provider==='woocommerce'){
  let remote=existing?await woo(env,record,credentials,'products/'+existing.external_id):null;
  if(!remote){const matches=await woo(env,record,credentials,'products?sku='+encodeURIComponent(sku));remote=matches.find(v=>v.sku===sku);if(remote&&!remote.meta_data?.some(v=>v.key==='_seconde_vie_id'&&v.value===row.id))fail(409,'Une référence identique existe déjà dans WooCommerce.');}
  if(existing&&quantity>0&&remote.stock_quantity!==existing.quantity)fail(409,'Le stock a changé dans WooCommerce. Vérifiez une éventuelle vente en ligne avant de renvoyer cet objet.');
  const body={name:row.title,description:escape(productDescription(row)),regular_price:(row.price_cents/100).toFixed(2),manage_stock:true,stock_quantity:quantity,stock_status:quantity?'instock':'outofstock',backorders:'no',...(remote?{}:{type:'simple',status:'draft',sku,meta_data:[{key:'_seconde_vie_id',value:row.id}]}),...(quantity&&images.length&&existing?.photos_signature!==images.join('|')?{images:images.map(src=>({src,alt:row.title}))}:{})};
  const saved=await woo(env,record,credentials,'products'+(remote?'/'+remote.id:''),remote?'PUT':'POST',body);if(!saved.id)fail(502,'WooCommerce n’a pas confirmé la fiche.');return {external_id:saved.id,quantity,photos_signature:images.join('|'),status:saved.status==='draft'?'Brouillon envoyé':'Fiche mise à jour',updated_at:now()};
 }
 let remote=existing?await shop(record,credentials,'query($id:ID!,$location:ID!){ product(id:$id){ id status variants(first:1){ nodes { id inventoryItem { id inventoryLevel(locationId:$location){ quantities(names:["available"]){ name quantity } } } } } } }',{id:existing.external_id,location:record.location_id}):null;
 let product=remote?.product;
 if(product&&quantity>0&&product.variants.nodes[0]?.inventoryItem.inventoryLevel?.quantities[0]?.quantity!==existing.quantity)fail(409,'Le stock a changé dans Shopify. Vérifiez les ventes en ligne avant de renvoyer cet objet.');
 if(!product){
  const input={title:row.title,handle:'sv-'+row.id,status:'DRAFT',descriptionHtml:escape(productDescription(row)),vendor:row.reference?.brand||'',productType:row.category,productOptions:[{name:'Title',values:[{name:'Default Title'}]}],variants:[{price:(row.price_cents/100).toFixed(2),sku,optionValues:[{optionName:'Title',name:'Default Title'}],inventoryItem:{tracked:true},inventoryQuantities:[{locationId:record.location_id,name:'available',quantity}]}],...(images.length?{files:images.map(originalSource=>({originalSource,contentType:'IMAGE',alt:row.title}))}:{})};
  const data=await shop(record,credentials,'mutation($input:ProductSetInput!,$identifier:ProductSetIdentifiers){ productSet(input:$input,identifier:$identifier,synchronous:true){ product { id status variants(first:1){nodes{id inventoryItem{id}}} } userErrors{field message} } }',{input,identifier:{handle:'sv-'+row.id}});product=checked(data.productSet).product;if(!product?.id)fail(502,'Shopify n’a pas confirmé la fiche.');
 }else{
  // Omit lists in productSet: do not delete variants or change publication managed in Shopify.
  const result=await shop(record,credentials,'mutation($input:ProductSetInput!){productSet(input:$input,synchronous:true){product{id} userErrors{field message}}}',{input:{id:product.id,title:row.title,descriptionHtml:escape(productDescription(row))}});checked(result.productSet);
  const variant=product.variants.nodes[0];checked((await shop(record,credentials,'mutation($id:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$id,variants:$variants){userErrors{field message}}}',{id:product.id,variants:[{id:variant.id,price:(row.price_cents/100).toFixed(2)}]})).productVariantsBulkUpdate);
  const current=variant.inventoryItem.inventoryLevel?.quantities[0]?.quantity;if(!Number.isInteger(current))fail(409,'Le stock Shopify n’est pas actif à cet emplacement.');
  const response=await shop(record,credentials,'mutation($input:InventorySetQuantitiesInput!,$key:String!){inventorySetQuantities(input:$input) @idempotent(key:$key){userErrors{field message code}}}',{key:crypto.randomUUID(),input:{name:'available',reason:'correction',referenceDocumentUri:'secondevie://stock/'+row.id,quantities:[{inventoryItemId:variant.inventoryItem.id,locationId:record.location_id,quantity,changeFromQuantity:current}]}});checked(response.inventorySetQuantities);
 }
 return {external_id:product.id,quantity,status:product.status==='DRAFT'?'Brouillon envoyé':'Fiche mise à jour',updated_at:now()};
}
export async function commerceRoute({env,workspace,state,me,path,method,body}){
 if(!state.settings.modules?.includes('commerce'))fail(403,'Activez le module Vente en ligne dans les réglages.');if(!hasRole(me,'stock'))fail(403,'Accès réservé au stock.');
 const [,provider,action]=path.split('/').slice(1); // /commerce/provider/action
 if(method==='GET'&&path==='/commerce'){const catalogue=await privateRecord(env,workspace.id,'catalogue');return {public_photos:Object.fromEntries(state.stock.filter(row=>onlineQuantity(row)>0).map(row=>[row.id,itemPhotos(row).map(source=>catalogue?.photos?.[source]).filter(Boolean).map(hash=>env.CATALOGUE_URL+'/media/'+workspace.id+'/'+hash+'.jpg')])),providers:await Promise.all(['shopify','woocommerce'].map(async key=>summary(await privateRecord(env,workspace.id,key),key))),catalogue:catalogue?await catalogueStatus(env,workspace.id):null};}
 if(!['shopify','woocommerce'].includes(provider))fail(400,'Connecteur inconnu.');if(!hasRole(me,'admin'))fail(403,'Connexion réservée au responsable.');
 return locked(env,workspace.id,provider,async()=>{
  let row=await privateRecord(env,workspace.id,provider);
  if(method==='PUT'&&!action){
   const host=commerceHost(body.host,provider),credentials=provider==='shopify'?{token:body.token}:{key:body.key,secret:body.secret};if(Object.values(credentials).some(v=>typeof v!=='string'||v.length<10||v.length>4096||/[\r\n]/.test(v)))fail(400,'Renseignez les identifiants de la boutique.');
   if(row?.host&&row.host!==host&&Object.keys(row.links||{}).length)fail(409,'Déconnectez l’ancienne boutique avant de changer son adresse.');
   const candidate={host,location_id:typeof body.location_id==='string'?body.location_id:''},info=await probe(env,provider,candidate,credentials,state.settings.currency);row={...row,...candidate,...info,credentials:await seal(credentials,env.COMMERCE_ENCRYPTION_KEY,workspace.id),enabled:true,links:row?.links||{},log:row?.log||[],error:''};await savePrivate(env,workspace.id,provider,row);return summary(row,provider);
  }
  if(!row?.credentials)fail(409,'Connectez d’abord cette boutique.');
  if(method==='PATCH'&&!action){row.enabled=body.enabled===true;await savePrivate(env,workspace.id,provider,row);return summary(row,provider);}
  if(method==='DELETE'&&!action){if(Object.values(row.links||{}).some(v=>v.quantity>0)&&body.confirm!=='DECONNECTER')fail(409,'Les fiches distantes seront conservées. Confirmez la déconnexion.');await savePrivate(env,workspace.id,provider,{enabled:false,links:{},log:[],error:''});return {ok:true};}
  if(method!=='POST'||action!=='sync'||!row.enabled)fail(400,'Cette connexion est en pause ou l’action est indisponible.');
  const ids=[...new Set(body.ids||[])];if(!ids.length||ids.length>3)fail(400,'Envoyez entre un et trois objets par opération.');const results=[];row.links??={};
  for(const id of ids){const product=state.stock.find(v=>v.id===id);if(!product)fail(404,'Objet introuvable.');try{row.links[id]=await syncProduct(env,workspace.id,provider,row,product);results.push({id,ok:true,...row.links[id]});}catch(error){results.push({id,ok:false,error:error.status?error.message:'La synchronisation a échoué.'});row.links[id]={...row.links[id],error:results.at(-1).error,updated_at:now()};}}
  row.last_sync=now();row.error=results.find(v=>!v.ok)?.error||'';row.log=[...results.map(v=>({id:v.id,ok:v.ok,label:v.ok?v.status:v.error,date:now()})),...(row.log||[])].slice(0,30);await savePrivate(env,workspace.id,provider,row);return {results,...summary(row,provider)};
 });
}
export async function catalogueStatus(env,id){const row=await privateRecord(env,id,'catalogue');return {url:row?.url||'',count:row?.count||0,pending:row?.pending||0,last_sync:row?.last_sync||'',error:row?.error||'',configured:Boolean(env.CATALOGUE_URL&&env.CATALOGUE_WRITE_KEY)};}
export async function afterStockWrite(env,workspace,state){
 if(env.CATALOGUE_URL&&(state.settings.modules.includes('vitrine')||await privateRecord(env,workspace.id,'catalogue')))try{await publishCatalogue(env,workspace,state,{upload:false});}catch{}
 // Only reduce availability automatically; never replenish a remote sale from a stale local value.
 if(!state.settings.modules.includes('commerce'))return;
 for(const provider of ['shopify','woocommerce']){
  const record=await privateRecord(env,workspace.id,provider);if(!record?.enabled)continue;
  const ids=Object.keys(record.links||{}).filter(id=>record.links[id].quantity>0&&onlineQuantity(state.stock.find(row=>row.id===id))===0).slice(0,3);if(!ids.length)continue;
  try{await commerceRoute({env,workspace,state,me:{roles:['admin']},path:'/commerce/'+provider+'/sync',method:'POST',body:{ids}});}catch{}
 }
}
