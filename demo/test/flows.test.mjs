import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key,value) { this.values.set(key,String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.location = {origin:'https://demo.example.test'};
const {demoRequest:api} = await import('../public/demo-api.js');
const {demoMembers,demoPassword,demoAdminEmail,canOpen} = await import('../public/access.js');
const {discountCents} = await import('../public/checkout.js');
const {readBasket,saveBasket} = await import('../public/basket.js');
const {normalizeScanCode} = await import('../public/catalog.js');
const write = (url,body,method='POST') => api(url,{method,body});
const rejects = (fn,status) => assert.rejects(fn,error => error.status === status);
const login = async (person,org='passages') => write('/login',person
  ? {org,member:person.id,pin:person.pin} : {org,email:demoAdminEmail[org],password:demoPassword});
const sites = () => api('/sites');
const add = async (extra={}) => write('/stock',{kind:'item',category:'Livres',title:'Livre test',
  site_id:(await sites())[0].id,origin:'Apport volontaire',...extra});
const action = (row,body) => write('/stock/'+row.id+'/action',body);
const patch = (url,body) => write(url,body,'PATCH');
const now = Date.now();
const shift = (site,member,extra={}) => ({site_id:site.id,member_id:member.id,activity:'Réception',
  starts_at:new Date(now+3600000).toISOString(),ends_at:new Date(now+7200000).toISOString(),...extra});
beforeEach(() => {localStorage.clear();sessionStorage.clear();});

test('accès refusé sans session et avec un code incorrect',async () => {
  await rejects(() => api('/stock'),401);
  await rejects(() => write('/login',{org:'passages',member:demoMembers.passages[0].id,pin:'incorrect'}),401);
});
test('mode test : responsable et opérateur accessibles en un clic sans mot de passe ni code',async()=>{
  const profiles=await api('/profiles?org=passages&test_access=1');const manager=profiles.find(row=>row.roles.includes('admin')),worker=profiles.find(row=>!row.roles.includes('admin'));
  assert(manager && worker);assert(profiles.every(row=>!Object.hasOwn(row,'pin')));
  await write('/login',{org:'passages',test_access:true,test_member:manager.id});assert((await api('/me')).roles.includes('admin'));
  await write('/login',{org:'passages',test_access:true,test_member:worker.id});assert.equal((await api('/me')).id,worker.id);
  await rejects(()=>write('/login',{org:'passages',test_access:true,test_member:'inconnu'}),401);
});
test('profils et équipe ne divulguent pas les codes',async () => {
  const profiles = await api('/profiles?org=passages');
  assert(profiles.every(profile => !Object.hasOwn(profile,'pin')));
  assert(profiles.every(profile => profile.demo_hint));
  await login();
  assert((await api('/team')).every(member => !Object.hasOwn(member,'pin')));
  assert.match(demoPassword,/^[a-f0-9]{32}$/);
  assert(demoMembers.passages.every(member => /^\d{6}$/.test(member.pin)));
});
test('rôles et séparation des deux structures',async () => {
  await login(demoMembers.passages[0]);
  await rejects(() => api('/team'),403);
  await rejects(() => api('/activity'),403);
  await rejects(() => write('/sales',{}),403);
  await add();
  await login(null,'boucle');
  assert(!(await api('/stock')).some(row => row.title === 'Livre test'));
  assert.equal((await api('/sites')).length,1);
});
test('création, correction du nom et de l’e-mail, code personnalisé et désactivation',async () => {
  await login();
  const body = {name:'Nouveau bénévole',email:'benevole@example.test',roles:['reception'],pin:'654321'};
  await write('/team',body);
  const member = (await api('/team')).find(member => member.email === body.email);
  await patch('/team/'+member.id,{...body,name:'Nom corrigé',email:'corrige@example.test',active:true});
  await login({...member,pin:body.pin});
  assert.equal((await api('/me')).name,'Nom corrigé');
  await login();
  await patch('/team/'+member.id,{roles:['reception'],active:false});
  await rejects(() => login({...member,pin:body.pin}),401);
});
test('validation des membres et maintien du responsable',async () => {
  await login();
  const me = await api('/me');
  await rejects(() => patch('/team/'+me.id,{roles:['vente'],active:true,pin:'654321'}),400);
  const body = {name:'Test',email:'test@example.test',roles:['vente'],pin:'654321'};
  for (const invalid of [{name:' '},{email:'invalide'},{roles:['inconnu']},{pin:'1'},{pin:''}])
    await rejects(() => write('/team',{...body,...invalid}),400);
  await write('/team',body);
  await rejects(() => write('/team',{...body,email:' TEST@example.test '}),409);
});
test('modifier un site et renommer une zone conserve les fiches',async () => {
  await login();
  const site = (await sites())[0];
  const row = await add({zone_id:site.zones[0].id});
  await patch('/sites/'+site.id,{name:'Atelier renommé',kind:site.kind,
    zones:site.zones.map((zone,index) => ({...zone,name:index ? zone.name : 'Zone renommée'}))});
  const updated = await api('/stock/'+row.id);
  assert.equal(updated.site_name,'Atelier renommé');
  assert.equal(updated.zone_name,'Zone renommée');
  await rejects(() => patch('/sites/'+site.id,{name:site.name,kind:site.kind,zones:[]}),409);
});
test('sites : refus des noms vides, doublons et zones inconnues',async () => {
  await login();
  await rejects(() => write('/sites',{name:' ',kind:'Vente',zones:''}),400);
  const site = (await sites())[0];
  await rejects(() => write('/sites',{name:site.name.toUpperCase(),kind:'Vente',zones:''}),409);
  await rejects(() => write('/sites',{name:'Nouveau',kind:'Vente',zones:'A,a'}),400);
  await rejects(() => patch('/sites/'+site.id,{name:site.name,kind:site.kind,zones:[{id:'ailleurs',name:'X'}]}),400);
  await write('/sites',{name:'Nouveau',kind:'Vente',zones:'A,B'});
  assert((await sites()).some(site => site.name === 'Nouveau' && site.zones.length === 2));
});
test('planning : dates, chevauchements, activité et membres actifs',async () => {
  await login();
  const site = (await sites())[0], member = demoMembers.passages[0];
  const body = shift(site,member);
  for (const invalid of [{starts_at:'invalide'},{ends_at:body.starts_at},{activity:'Inconnue'}])
    await rejects(() => write('/shifts',{...body,...invalid}),400);
  await write('/shifts',body);
  await rejects(() => write('/shifts',body),409);
  await write('/shifts',{...body,starts_at:body.ends_at,ends_at:new Date(now+10800000).toISOString()});
  await patch('/team/'+member.id,{name:'Nouveau nom',roles:member.roles,active:true});
  assert((await api('/shifts')).filter(row => row.member_id === member.id).every(row => row.member_name === 'Nouveau nom'));
  await patch('/team/'+member.id,{roles:member.roles,active:false});
  await rejects(() => write('/shifts',{...body,starts_at:new Date(now+14400000).toISOString(),ends_at:new Date(now+18000000).toISOString()}),400);
});
test('suppression de créneau autorisée seulement au responsable',async () => {
  await login();
  await write('/shifts',shift((await sites())[0],demoMembers.passages[0]));
  const row = (await api('/shifts')).at(-1);
  await login(demoMembers.passages[0]);
  await rejects(() => write('/shifts/'+row.id,undefined,'DELETE'),403);
  await login();
  await write('/shifts/'+row.id,undefined,'DELETE');
  assert(!(await api('/shifts')).some(item => item.id === row.id));
});
test('réception, contrôle motivé, prix et rangement',async () => {
  await login();
  const row = await add();
  await rejects(() => action(row,{action:'block',note:' '}),400);
  await action(row,{action:'block',note:'Vérifier la reliure'});
  assert.equal((await api('/stock/'+row.id)).state,'controle');
  for (const price of [-1,1.5,Number.MAX_SAFE_INTEGER])
    await rejects(() => action(row,{action:'ready',price_cents:price}),400);
  await action(row,{action:'ready',price_cents:800,condition:'Bon état'});
  assert.equal((await api('/stock/'+row.id)).price_cents,800);
  const site = (await sites())[0];
  await action(row,{action:'move',zone_id:site.zones[0].id});
  await rejects(() => action(row,{action:'move',zone_id:'inconnue'}),404);
});
test('lot : conservation du poids et des quantités lors des isolations',async () => {
  await login();
  const lot = await add({kind:'lot',quantity:2,grams:500});
  const child = await add({parent_id:lot.id,grams:250});
  assert.equal((await api('/stock/'+lot.id)).quantity,1);
  assert.equal((await api('/stock/'+lot.id)).grams,250);
  assert.equal((await api('/stock/'+child.id)).parent_code,lot.code);
  await rejects(() => add({parent_id:lot.id,grams:200}),400);
  assert.equal((await api('/stock/'+lot.id)).grams,250);
  await add({parent_id:lot.id,grams:250});
  assert.equal((await api('/stock/'+lot.id)).exit_type,'reparti');
  await rejects(() => add({parent_id:lot.id,grams:1}),409);
});
test('transfert : réception partielle, conservation de l’état et répétition sans doublon',async () => {
  await login();
  const [origin,destination] = await sites();
  const a = await add(), b = await add();
  await action(a,{action:'ready',price_cents:300});
  await rejects(() => write('/transfers',{destination_id:origin.id,stock_ids:[a.id]}),400);
  const transfer = await write('/transfers',{destination_id:destination.id,stock_ids:[a.id,b.id]});
  await rejects(() => action(a,{action:'ready'}),409);
  await write('/transfers/'+transfer.id+'/receive',{stock_ids:[a.id],zone_id:destination.zones[0].id});
  await write('/transfers/'+transfer.id+'/receive',{stock_ids:[a.id],zone_id:destination.zones[0].id});
  const received = await api('/stock/'+a.id);
  assert.equal(received.state,'pret');
  assert.equal(received.site_id,destination.id);
  assert.equal(received.history.filter(event => event.type === 'arrivee').length,1);
  assert.equal((await api('/stock/'+b.id)).state,'transit');
});
test('caisse partagée : relais, restrictions, attribution et prévention de double vente',async () => {
  await login();
  const row = await add();
  await action(row,{action:'ready',price_cents:800});
  const site = (await sites())[0];
  const ines = demoMembers.passages.find(member => member.id.endsWith('ines'));
  const thomas = demoMembers.passages.find(member => member.id.endsWith('thomas'));
  await write('/cash-station',{site_id:site.id,member:ines.id});
  assert(canOpen(await api('/me'),'caisse'));
  assert(!canOpen(await api('/me'),'equipe'));
  await rejects(() => api('/team'),403);
  await rejects(() => api('/activity'),403);
  await rejects(() => write('/cash-station',{site_id:site.id,member:demoMembers.passages[0].id}),403);
  await write('/cash-station',{site_id:site.id,member:thomas.id});
  const sale = {site_id:site.id,payment:'especes',received_cents:1000,lines:[{id:row.id,price_cents:800}]};
  await rejects(() => write('/sales',{...sale,operator_id:ines.id}),409);
  const result = await write('/sales',{...sale,operator_id:thomas.id});
  assert.equal(result.operator_id,thomas.id);
  assert.equal(result.change_cents,200);
  assert.equal((await api('/stock/'+row.id)).exit_type,'vente');
  await rejects(() => write('/sales',{...sale,operator_id:thomas.id}),409);
  await write('/logout');
  await rejects(() => api('/sales'),401);
});
test('caisse : mauvais site, montant insuffisant, prix modifié et remise',async () => {
  await login();
  const row = await add();
  await action(row,{action:'ready',price_cents:1000});
  const site = (await sites())[0];
  const sale = {site_id:site.id,payment:'especes',lines:[{id:row.id,price_cents:1000}]};
  await rejects(() => write('/sales',{...sale,received_cents:999}),400);
  await rejects(() => write('/sales',{...sale,payment:'carte',lines:[{id:row.id,price_cents:999}]}),409);
  await rejects(() => write('/sales',{...sale,payment:'gratuit'}),400);
  const result = await write('/sales',{...sale,received_cents:1000,discount:{type:'percent',value:20}});
  assert.equal(result.total_cents,800);
  assert.equal(result.change_cents,200);
});
test('sorties hors vente et rapports conservent auteur, flux et poids',async () => {
  await login();
  const row = await add({grams:500});
  await action(row,{action:'exit',exit_type:'decheterie'});
  const report = await api('/activity');
  const entry = report.events.find(event => event.code === row.code && event.type === 'reception');
  const exit = report.events.find(event => event.code === row.code && event.type === 'decheterie');
  assert.equal(entry.grams,500);
  assert.equal(exit.grams,500);
  assert.equal((await api('/stock/'+row.id)).history[0].name,(await api('/me')).name);
  await rejects(() => action(row,{action:'ready'}),409);
});
test('méthodes invalides ne modifient pas les ressources',async () => {
  await login();
  const count = (await sites()).length;
  await rejects(() => write('/sites',{},'DELETE'),405);
  await rejects(() => write('/team',{},'PATCH'),405);
  await rejects(() => write('/shifts',{},'DELETE'),405);
  await rejects(() => api('/inconnue'),404);
  assert.equal((await sites()).length,count);
});
test('brouillon de caisse : reprise, séparation par site et retrait des articles vendus',() => {
  const storage = new MemoryStorage();
  const row = {id:'objet',site_id:'A',state:'pret',price_cents:1000};
  saveBasket('org','A',[row],{type:'amount',value:100},storage);
  assert.equal(readBasket('org','A',[row],storage).lines.length,1);
  assert.equal(readBasket('autre','A',[row],storage).lines.length,0);
  assert.equal(readBasket('org','B',[row],storage).lines.length,0);
  assert.equal(readBasket('org','A',[{...row,state:'sorti'}],storage).lines.length,0);
  assert.equal(readBasket('org','A',[{...row,price_cents:50}],storage).discount,null);
  saveBasket('org','A',[],null,storage);
  assert.equal(readBasket('org','A',[row],storage).lines.length,0);
});
test('remises et normalisation des codes du scanner',() => {
  assert.equal(discountCents(999,{type:'percent',value:10}),100);
  assert.equal(discountCents(999,{type:'amount',value:99}),99);
  assert.throws(() => discountCents(999,{type:'amount',value:1000}));
  assert.throws(() => discountCents(999,{type:'percent',value:101}));
  assert.equal(normalizeScanCode('978-2-07-040850-4'),'9782070408504');
});

test('vitrine : seuls les objets disponibles et tarifés restent visibles',async () => {
  await login();
  const row = await add();
  await rejects(() => action(row,{action:'storefront',visible:true}),400);
  await action(row,{action:'ready',price_cents:500});
  await action(row,{action:'storefront',visible:true});
  assert((await api('/storefront')).some(item => item.id === row.id));
  await action(row,{action:'exit',exit_type:'don'});
  assert(!(await api('/storefront')).some(item => item.id === row.id));
});
test('intervention atelier : validation et temps reporté',async () => {
  await login();
  const row = await add();
  await rejects(() => action(row,{action:'workshop',operation:'Réparation',minutes:0}),400);
  await action(row,{action:'workshop',operation:'Réparation',minutes:30,note:'Reliure reprise'});
  const report = await api('/activity');
  assert.equal(report.events.find(event => event.code === row.code && event.type === 'atelier').minutes,30);
});
test('tournées : collecte et livraison avec statuts et droits distincts',async () => {
  await login();
  const site = (await sites())[0];
  const body = {site_id:site.id,label:'Livraison fictive',kind:'Livraison',starts_at:new Date(now).toISOString(),stops:'Adresse fictive A\nAdresse fictive B'};
  await rejects(() => write('/tours',{...body,starts_at:'invalide'}),400);
  await login(demoMembers.passages.find(member => member.roles.includes('collecte')));
  const row = await write('/tours',body);
  await patch('/tours/'+row.id,{status:'done'});
  assert.equal((await api('/tours')).find(item => item.id === row.id).status,'done');
  await rejects(() => api('/stock'),403);
});
test('codes d’étiquettes et métadonnées de livres',async () => {
  const {code128Svg} = await import('../public/barcode.js');
  const {cleanReference} = await import('../public/reference.js');
  assert.match(code128Svg('OBJ-1046'),/^<svg/);
  assert.deepEqual(cleanReference('Livres',{author:' Auteur ',pagination:'1 vol. (256 p.)',unknown:'ignoré'}),
    {author:'Auteur',pagination:'256'});
});
test('routes serveur : refus sans session et sans fournisseur configuré',async () => {
  const {default:worker} = await import('../worker/index.mjs');
  const env = {ASSETS:{fetch:() => new Response('asset')}};
  const url = 'https://demo.example.test/api/terminal-readers?provider=sumup';
  assert.equal((await worker.fetch(new Request(url),env)).status,403);
  const request = new Request(url,{headers:{'oai-authenticated-user-id':'test','X-Seconde-Vie':'terminals'}});
  assert.equal((await worker.fetch(request,env)).status,503);
  assert.equal((await worker.fetch(new Request('https://demo.example.test/api/photo-bench',{method:'POST'}),env)).status,403);
  assert.equal(await (await worker.fetch(new Request('https://demo.example.test/'),env)).text(),'asset');
});


test('entrée après identification : état, prix nul ou absent, référence et note restent modifiables',async()=>{
  await login();
  const row=await add({category:'Électrique',title:'Cafetière identifiée',condition:'Bon état',price_cents:3200,reference:{brand:'Krups',model:'XN1001'},note:'Comparables consultés par l’opérateur.'});
  const saved=await api('/stock/'+row.id);assert.equal(saved.condition,'Bon état');assert.equal(saved.price_cents,3200);assert.equal(saved.reference.model,'XN1001');assert.match(saved.note,/Comparables/);
  assert.equal((await add({price_cents:0})).price_cents,0);assert.equal((await add()).price_cents,null);
});


test('réception assistée : hypothèses conservées, état visuel distinct du test de fonctionnement',async()=>{
 await login();
 const row=await add({category:'Électrique',title:'Raclette à contrôler',reference:{brand:'Tefal',model:'Gamme proposée',color:'Noir'},reference_confirmed:false,reference_status:{brand:'observed',model:'inferred'},condition:'État visuel correct',visual_condition:{grade:'fair',summary:'Rayures visibles',defects:['Rayures'],limits:'Vue du dessus seulement'},functionality:'untested'});
 const value=await api('/stock/'+row.id);assert.equal(value.state,'tri');assert.equal(value.reference_confirmed,false);assert.equal(value.reference_status.model,'inferred');assert.equal(value.visual_condition.grade,'fair');assert.equal(value.functionality,'untested');
 await action(row,{action:'ready',condition:'Bon état',functionality:'working',price_cents:1500});assert.equal((await api('/stock/'+row.id)).functionality,'working');
});
