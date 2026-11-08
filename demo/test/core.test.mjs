import { test,afterEach,beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { localBindings } from '../scripts/local-bindings.mjs';
import { core } from '../worker/core.mjs';
import { workshopTypes } from '../public/activity.js';
import { firstAvailablePage } from '../public/modules.js';

let env,directory;
const actor={id:'test-owner',email:'owner@example.test',name:'Responsable'};
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'sv-core-'));env=await localBindings(directory,{memory:true});});
afterEach(async()=>{env.close();await rm(directory,{recursive:true,force:true});});

function client(user=actor) {
  let workspace='',revision=0;
  const versions=new Map();
  return {get workspace(){return workspace;},get revision(){return revision;},set workspace(value){workspace=value;},
    async call(path,{method='GET',body,headers={},status=200,id=crypto.randomUUID(),expected}={}) {
      const parsed=path.split('/');
      if(body && versions.has(parsed[1]+'/'+parsed[2])) body={...body,expected_version:versions.get(parsed[1]+'/'+parsed[2])};
      const response=await core(new Request('https://sv.example.test/api/core'+path,{method,headers:{
        'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,'oai-authenticated-user-full-name':user.name,
        'X-Seconde-Vie':'core','X-Seconde-Vie-Workspace':workspace,Origin:'https://sv.example.test',
        ...(method!=='GET' ? {'Content-Type':'application/json','If-Match':String(expected??revision),'X-Seconde-Vie-Request':id} : {}),...headers},
        body:body===undefined?undefined:JSON.stringify(body)}),env);
      const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));
      const value=Number(response.headers.get('X-Seconde-Vie-Revision'));if(value && path!=='/revision')revision=Math.max(revision,value);
      if(data.id && path==='/workspaces')workspace=data.id;
      const add=(type,row)=>{if(row?.id)versions.set(type+'/'+row.id,row._version);};
      if(path==='/snapshot')for(const type of ['sites','stock','team','transfers'])for(const row of data[type])add(type,row);
      else for(const row of Array.isArray(data)?data:[data])add(parsed[1],row);
      return data;
    }};
}
async function setup(owner=client()) {
  await owner.call('/workspaces',{method:'POST',body:{name:'Atelier test',site_name:'Réception',type:'ressourcerie'},status:201});
  const snapshot=await owner.call('/snapshot');return {owner,snapshot,site:snapshot.sites[0]};
}
const object=(site,extra={})=>({kind:'item',category:'Livres',title:'Livre test',site_id:site.id,zone_id:site.zones[0].id,origin:'Apport volontaire',...extra});

test('navigation : profils spécialisés et poste caisse après désactivation d’un module',()=>{
  const seller={roles:['vente']},collector={roles:['collecte']};
  assert.equal(firstAvailablePage(seller,{modules:[]}), 'scanner');
  assert.equal(firstAvailablePage(seller,{modules:['caisse']}), 'caisse');
  assert.equal(firstAvailablePage(collector,{modules:[]}), null);
  assert.equal(firstAvailablePage(collector,{modules:['collectes']}), 'tournees');
  assert.equal(firstAvailablePage({...seller,cash_station:{}},{modules:[]}), null);
  assert.equal(firstAvailablePage({roles:['rapports']},{modules:[]}), 'rapports');
});

test('socle partagé : création vide, formats et lecture sur deux appareils',async()=>{
  const {owner,site,snapshot}=await setup();assert.equal(snapshot.config.demo,false);assert.equal(snapshot.stock.length,0);
  const row=await owner.call('/stock',{method:'POST',body:object(site)});
  const second=client();second.workspace=owner.workspace;
  const other=await second.call('/snapshot');assert.equal(other.stock[0].id,row.id);
  assert.equal(other.stock[0]._version,2);assert(other.stock[0].code.startsWith('OBJ-'));
});
test('isolation entre structures et absence d’identité refusée',async()=>{
  const {owner}=await setup();const stranger=client({id:'other',email:'other@example.test',name:'Autre'});stranger.workspace=owner.workspace;
  await stranger.call('/stock',{status:403});
  const response=await core(new Request('https://sv.example.test/api/core/bootstrap'),env);assert.equal(response.status,401);
});
test('rôles serveur, invitation par adresse, révocation immédiate et protection du propriétaire',async()=>{
  const {owner,site,snapshot}=await setup();
  await owner.call('/team',{method:'POST',body:{name:'Réception',email:'reception@example.test',roles:['reception']}});
  const worker=client({id:'reception',email:'reception@example.test',name:'Réception'});worker.workspace=owner.workspace;
  await worker.call('/stock',{method:'POST',body:object(site),status:409});await worker.call('/snapshot');
  await worker.call('/stock',{method:'POST',body:object(site)});
  await worker.call('/team',{status:403});await worker.call('/backup',{status:403});
  await owner.call('/snapshot');const person=(await owner.call('/team')).find(row=>row.email==='reception@example.test');
  await owner.call('/team/'+person.id,{method:'PATCH',body:{roles:['reception'],active:false,name:person.name,email:person.email}});
  await worker.call('/stock',{status:403});
  await owner.call('/team/'+snapshot.me.id,{method:'PATCH',body:{roles:['vente'],email:actor.email,active:true},status:400});
});
test('une saisie ancienne est refusée et une répétition réseau ne crée pas de doublon',async()=>{
  const {owner,site}=await setup();const id=crypto.randomUUID();
  const first=await owner.call('/stock',{method:'POST',body:object(site),id});
  const repeated=await owner.call('/stock',{method:'POST',body:object(site),id});assert.equal(repeated.id,first.id);
  assert.equal((await owner.call('/stock')).length,1);
  const second=client();second.workspace=owner.workspace;await second.call('/snapshot');
  await owner.call('/stock/'+first.id+'/action',{method:'POST',body:{action:'edit',title:'Correction A'}});
  await second.call('/stock/'+first.id+'/action',{method:'POST',body:{action:'edit',title:'Correction B'},status:409});
  await second.call('/sites'); // Reading another resource must not permit overwriting a stale object.
  await second.call('/stock/'+first.id+'/action',{method:'POST',body:{action:'edit',title:'Correction B'},status:409});
  assert.equal((await owner.call('/stock/'+first.id)).title,'Correction A');
});
test('contacts partagés, association à une fiche et validation des doublons',async()=>{
  const {owner,site}=await setup();
  const person=await owner.call('/contacts',{method:'POST',body:{name:'Donateur',email:'DON@example.test',types:['Donateur','Client']}});
  await owner.call('/contacts',{method:'POST',body:{name:'Doublon',email:'don@example.test',types:[]},status:409});
  const row=await owner.call('/stock',{method:'POST',body:object(site,{contact_id:person.id})});
  assert.equal((await owner.call('/stock/'+row.id)).contact_id,person.id);
});
test('modules désactivés, réglages conservés et devise protégée après un prix',async()=>{
  const {owner,site}=await setup();await owner.call('/sales',{method:'POST',body:{},status:403});
  await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['caisse'],currency:'GBP',locale:'en-GB',timeZone:'Europe/London',intake:{price:true}}});
  const snapshot=await owner.call('/snapshot');assert.equal(snapshot.config.currency,'GBP');assert.deepEqual(snapshot.config.modules,['caisse']);
  await owner.call('/stock',{method:'POST',body:object(site,{price_cents:500})});
  await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',currency:'USD'},status:409});
});
test('ressourcerie : flux inclus et modules réversibles sur une fiche commune',async()=>{
  const {owner,site}=await setup();
  const row=await owner.call('/stock',{method:'POST',body:object(site,{grams:500})});
  const flows=await owner.call('/activity');assert.equal(flows.events.length,1);assert.equal(flows.events[0].grams,500);
  await owner.call('/activity?register=1');
  for(const path of ['/sales','/cashiers','/tours','/shifts','/storefront'])await owner.call(path,{status:403});
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'workshop',operation:workshopTypes[0],minutes:15},status:403});
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'storefront',visible:true},status:403});
  await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['atelier','vitrine','rapports']}});
  assert.deepEqual((await owner.call('/config')).modules,['atelier','vitrine']);
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'workshop',operation:workshopTypes[0],minutes:15}});
  await owner.call('/stock/'+row.id);
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'ready',price_cents:400}});
  await owner.call('/stock/'+row.id);
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'storefront',visible:true}});
  assert.equal((await owner.call('/storefront'))[0].id,row.id);
  await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:[]}});
  await owner.call('/storefront',{status:403});
  const kept=await owner.call('/stock/'+row.id);assert.equal(kept.web_visible,true);
  assert(kept.history.some(event=>event.minutes===15));
  assert.equal((await owner.call('/stock')).length,1);
  await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'exit',exit_type:'don'}});
  assert((await owner.call('/activity')).events.some(event=>event.type==='don'));
});
test('sauvegarde et restauration atomiques, sans changement des droits',async()=>{
  const {owner,site}=await setup();await owner.call('/stock',{method:'POST',body:object(site)});
  const backup=await owner.call('/backup');await owner.call('/stock',{method:'POST',body:object(site,{title:'Après sauvegarde'})});
  backup.state.team=[];
  await owner.call('/restore',{method:'POST',body:{confirm:'Atelier test',backup}});
  assert.equal((await owner.call('/stock')).length,1);assert.equal((await owner.call('/me')).roles[0],'admin');
  assert.equal((await env.DB.prepare('SELECT * FROM sv_snapshots').all()).results.length,1);
  backup.state.stock[0].site_id='inconnu';
  await owner.call('/restore',{method:'POST',body:{confirm:'Atelier test',backup},status:400});
  assert.equal((await owner.call('/stock')).length,1);
});
test('photos stockées sur le serveur et protégées par structure',async()=>{
  const {owner,site}=await setup();const photo='data:image/jpeg;base64,/9j/2Q==';
  const row=await owner.call('/stock',{method:'POST',body:object(site,{photos:[photo]})});
  const detail=await owner.call('/stock/'+row.id);assert(detail.photos[0].startsWith('/api/core/photos/'));
  const response=await core(new Request('https://sv.example.test'+detail.photos[0],{headers:{'oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email}}),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/jpeg');
  const stranger=await core(new Request('https://sv.example.test'+detail.photos[0],{headers:{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'}}),env);assert.equal(stranger.status,403);
});
test('requête tierce et méthodes non prévues refusées sans mutation',async()=>{
  const {owner,site}=await setup();
  await owner.call('/stock',{method:'POST',body:object(site),headers:{Origin:'https://evil.example.test'},status:403});
  await owner.call('/me',{method:'POST',body:{},status:405});assert.equal((await owner.call('/stock')).length,0);
});
test('transferts, isolation de lot et restauration conservent les liens et quantités',async()=>{
  const {owner,site}=await setup();
  await owner.call('/sites',{method:'POST',body:{name:'Boutique',kind:'Vente',zones:'Rayon'}});
  const destination=(await owner.call('/sites')).find(row=>row.name==='Boutique');
  const lot=await owner.call('/stock',{method:'POST',body:object(site,{kind:'lot',quantity:3})});
  const item=await owner.call('/stock',{method:'POST',body:object(site,{parent_id:lot.id,title:'Exemplaire isolé'})});
  assert.equal((await owner.call('/stock/'+lot.id)).quantity,2);
  const transfer=await owner.call('/transfers',{method:'POST',body:{stock_ids:[item.id],destination_id:destination.id}});
  await owner.call('/transfers/'+transfer.id+'/receive',{method:'POST',body:{stock_ids:[item.id],zone_id:destination.zones[0].id}});
  const backup=await owner.call('/backup');
  await owner.call('/restore',{method:'POST',body:{confirm:'Atelier test',backup}});
  assert.equal((await owner.call('/stock/'+item.id)).site_id,destination.id);
  const snapshots=await owner.call('/snapshots');assert.equal(snapshots.length,1);
  const previous=await owner.call('/snapshots/'+snapshots[0].id);assert.equal(previous.state.stock.length,2);
});
test('conflit réel de deux écritures simultanées : une seule transaction est conservée',async()=>{
  const {owner,site}=await setup();const second=client();second.workspace=owner.workspace;await second.call('/snapshot');
  const outcomes=await Promise.allSettled([
    owner.call('/stock',{method:'POST',body:object(site,{title:'Premier'})}),
    second.call('/stock',{method:'POST',body:object(site,{title:'Second'}),status:409}),
  ]);
  for(const outcome of outcomes)assert.equal(outcome.status,'fulfilled',outcome.reason?.message);
  assert.equal((await owner.call('/stock')).length,1);
});
test('le Worker se charge sans génération aléatoire au niveau global',()=>{
  const entry=new URL('../worker/index.mjs',import.meta.url).href;
  execFileSync(process.execPath,['--input-type=module','-e',
    `Object.defineProperty(globalThis,'crypto',{value:{getRandomValues(){throw new Error('Global randomness forbidden')},randomUUID(){throw new Error('Global randomness forbidden')}}});await import(${JSON.stringify(entry)});`],{stdio:'pipe'});
});

test('catalogue et commerce : réglages, rôles et secrets séparés des sauvegardes',async()=>{
 const {owner,site}=await setup();
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['vitrine','commerce'],catalogue:{enabled:true,contact_email:'contact@example.test',intro:'Nos trouvailles'}}});
 const config=await owner.call('/config');assert.equal(config.catalogue.enabled,true);
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',catalogue:{contact_email:'invalide'}},status:400});
 const connections=await owner.call('/commerce');assert.equal(connections.providers.length,2);assert.equal(connections.providers[0].connected,false);
 await env.DB.prepare("INSERT INTO sv_records(workspace_id,type,id,data) VALUES(?,'commerce_private','shopify',?)").bind(owner.workspace,JSON.stringify({credentials:{iv:'cipher',data:'cipher-only'}})).run();
 const row=await owner.call('/stock',{method:'POST',body:object(site)});assert(row.id);
 assert(await env.DB.prepare("SELECT data FROM sv_records WHERE workspace_id=? AND type='commerce_private'").bind(owner.workspace).first());
 const backup=await owner.call('/backup');assert(!JSON.stringify(backup).includes('cipher-only'));assert(!Object.hasOwn(backup.state,'commerce_private'));
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:[]}});await owner.call('/commerce',{status:403});assert.equal((await owner.call('/config')).catalogue.intro,'Nos trouvailles');
});
test('six photos sauvegardées, couverture réordonnée et septième refusée',async()=>{
 const {owner,site}=await setup();const photo='data:image/jpeg;base64,'+btoa(String.fromCharCode(255,216,255,217));
 const saved=await owner.call('/stock',{method:'POST',body:object(site,{photos:Array(6).fill(photo)})});const row=await owner.call('/stock/'+saved.id);assert.equal(row.photos.length,6);
 const photos=[...row.photos].reverse();await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'photo',photos}});
 const list=await owner.call('/stock');assert.equal(list[0].cover_photo,photos[0]);
 await owner.call('/stock',{method:'POST',body:object(site,{photos:Array(7).fill(photo)}),status:400});
});
test('WooCommerce : connexion testée, secrets non retournés, envoi en brouillon et conflit distant préservé',async()=>{
 const {owner,site}=await setup();env.COMMERCE_ENCRYPTION_KEY='cd'.repeat(32);
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['commerce','vitrine']}});
 const original=globalThis.fetch;let remote=null,posts=0;
 globalThis.fetch=async(url,options={})=>{if(new URL(url).hostname==='cloudflare-dns.com')return Response.json({Answer:[{type:1,data:'93.184.216.34'}]});assert.equal(options.redirect,'error');assert.equal(new URL(url).origin,'https://boutique.fr');assert(!String(url).includes('test-consumer-secret'));
  const path=new URL(url).pathname;if(path.includes('woocommerce_currency'))return Response.json({value:'EUR'});if(options.method==='POST'){posts++;remote={id:123,...JSON.parse(options.body)};assert.equal(remote.status,'draft');return Response.json(remote);}if(options.method==='PUT'){remote={...remote,...JSON.parse(options.body)};return Response.json(remote);}if(path.endsWith('/products/123'))return Response.json(remote);return Response.json(remote?[remote]:[]);
 };
 try{
  const connection=await owner.call('/commerce/woocommerce',{method:'PUT',body:{host:'https://boutique.fr',key:'test-consumer-key',secret:'test-consumer-secret'}});assert.equal(connection.connected,true);assert(!JSON.stringify(connection).includes('test-consumer'));
  const created=await owner.call('/stock',{method:'POST',body:object(site,{price_cents:600})});await owner.call('/stock/'+created.id+'/action',{method:'POST',body:{action:'ready',price_cents:600}});await owner.call('/stock/'+created.id);await owner.call('/stock/'+created.id+'/action',{method:'POST',body:{action:'storefront',visible:true}});
  const first=await owner.call('/commerce/woocommerce/sync',{method:'POST',body:{ids:[created.id]}});assert.equal(first.results[0].ok,true);assert.equal(posts,1);assert.equal(remote.stock_quantity,1);
  remote.stock_quantity=0;const retry=await owner.call('/commerce/woocommerce/sync',{method:'POST',body:{ids:[created.id]}});assert.equal(retry.results[0].ok,false);assert.match(retry.results[0].error,/stock a changé/);assert.equal(remote.stock_quantity,0);assert.equal(posts,1);
  const backup=await owner.call('/backup');assert(!JSON.stringify(backup).includes('test-consumer-secret'));
 }finally{globalThis.fetch=original;}
});
test('Shopify : jeton gardé au serveur, emplacement et devise vérifiés avant connexion',async()=>{
 const {owner}=await setup();env.COMMERCE_ENCRYPTION_KEY='ef'.repeat(32);await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['commerce']}});
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://boutique.myshopify.com/admin/api/2026-10/graphql.json');assert.equal(options.headers['X-Shopify-Access-Token'],'fictif-shopify-token');return Response.json({data:{shop:{name:'Boutique test',currencyCode:'EUR'},locations:{nodes:[{id:'gid://shopify/Location/1',name:'Magasin',isActive:true}]}}});};
 try{const result=await owner.call('/commerce/shopify',{method:'PUT',body:{host:'https://boutique.myshopify.com',token:'fictif-shopify-token'}});assert.equal(result.location_id,'gid://shopify/Location/1');assert(!JSON.stringify(result).includes('fictif-shopify-token'));await owner.call('/commerce/shopify',{method:'PATCH',body:{enabled:false}});assert.equal((await owner.call('/commerce')).providers[0].enabled,false);}finally{globalThis.fetch=original;}
});
test('catalogue : photos publiées explicitement, retrait après désactivation et aucun champ privé transmis',async()=>{
 const {owner,site}=await setup();env.CATALOGUE_URL='https://catalogue.example.org';env.CATALOGUE_WRITE_KEY='fictif-secret-catalogue';const original=globalThis.fetch;let snapshot,uploads=0;
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).origin,env.CATALOGUE_URL);assert.equal(options.headers.Authorization,'Bearer fictif-secret-catalogue');if(String(url).includes('/media/')){uploads++;return Response.json({ok:true});}snapshot=JSON.parse(options.body);return Response.json({count:snapshot.items.length});};
 try{
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:['vitrine'],catalogue:{enabled:true}}});
 const photo='data:image/jpeg;base64,'+btoa(String.fromCharCode(255,216,255,217));const row=await owner.call('/stock',{method:'POST',body:object(site,{photos:[photo],note:'NOTE-PRIVEE',price_cents:1000})});await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'ready',price_cents:1000}});await owner.call('/stock/'+row.id);await owner.call('/stock/'+row.id+'/action',{method:'POST',body:{action:'storefront',visible:true}});
 assert.equal(uploads,0);const publication=await owner.call('/catalogue-publish',{method:'POST',body:{}});assert.equal(publication.count,1);assert.equal(uploads,1);assert.equal(snapshot.items[0].photos.length,1);assert(!JSON.stringify(snapshot).includes('NOTE-PRIVEE'));assert(!JSON.stringify(snapshot).includes('/api/core/photos/'));
 await owner.call('/settings',{method:'PATCH',body:{name:'Atelier test',modules:[]}});assert.equal(snapshot.items.length,0);
 }finally{globalThis.fetch=original;}
});
