import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localBindings} from '../scripts/local-bindings.mjs';
import {core} from '../worker/core.mjs';
import {parseCSV} from '../public/csv.js';

let env,directory;
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'sv-ops-'));env=await localBindings(directory,{memory:true});});
afterEach(async()=>{env.close();await rm(directory,{recursive:true,force:true});});
function client(actor={id:'owner',email:'owner@example.test',name:'Responsable'}) {
  let revision=0,workspace='';const versions=new Map();
  return {get workspace(){return workspace;},set workspace(value){workspace=value;},get revision(){return revision;},async call(path,body,expected=200,{method=body===undefined?'GET':'POST',requestId=crypto.randomUUID(),headers={}}={}) {
    const parts=path.split('/'),key=parts[1]+'/'+parts[2];
    if(body && versions.has(key))body={...body,expected_version:versions.get(key)};
    const response=await core(new Request('https://sv.example.test/api/core'+path,{method,headers:{Origin:'https://sv.example.test','oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email,'oai-authenticated-user-full-name':actor.name,'X-Seconde-Vie':'core','X-Seconde-Vie-Workspace':workspace,'X-Seconde-Vie-Request':requestId,'If-Match':String(revision),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
    const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));
    if(response.headers.has('X-Seconde-Vie-Revision'))revision=Math.max(revision,Number(response.headers.get('X-Seconde-Vie-Revision')));
    if(path==='/workspaces' && value.id)workspace=value.id;
    if(path==='/snapshot')for(const type of ['stock','sites','team'])for(const row of value[type])versions.set(type+'/'+row.id,row._version);
    for(const row of Array.isArray(value)?value:[value])if(row?.id)versions.set(parts[1]+'/'+row.id,row._version);
    return value;
  }};
}
async function setup(modules=['caisse','administration','adhesions']) {
  const owner=client();await owner.call('/workspaces',{name:'Atelier',site_name:'Boutique'},201);
  const snapshot=await owner.call('/snapshot'),site=snapshot.sites[0];
  await owner.call('/settings',{name:'Atelier',modules},200,{method:'PATCH'});return {owner,site};
}
async function article(owner,site,price=500) {
  const row=await owner.call('/stock',{kind:'item',title:'Livre pilote',category:'Livres',site_id:site.id,zone_id:site.zones[0].id,grams:400});
  await owner.call('/stock/'+row.id+'/action',{action:'ready',price_cents:price});return owner.call('/stock/'+row.id);
}
const sale=(row,site)=>({site_id:site.id,lines:[{id:row.id,price_cents:row.price_cents}],payment:'especes',received_cents:1000});
const profile={legal_name:'Association pilote',address:'Adresse fictive',registration:'IDENTIFIANT-TEST',legal_form:'Association',vat_number:'TVA-TEST',vat_exemption:'Régime de test sans TVA',payment_terms:'Escompte : néant. Paiement à échéance.',late_penalties:'Conditions de test',guarantee:'Mention de garantie à adapter avant usage réel.'};
async function customer(owner) {return owner.call('/contacts',{name:'Client pilote',email:'client@example.test',address:'Adresse fictive du client',types:['Client']});}
const draft=contact=>({kind:'invoice',contact_id:contact.id,professional:true,customer_registration:'CLIENT-TEST',operation_type:'goods',service_date:'2026-11-07',due_date:'2099-12-31',lines:[{label:'Objet de réemploi',quantity:2,unit_ht_cents:1000,vat_bps:2000}]});

test('caisse : ouverture obligatoire, mouvements, comptage et clôture figée',async()=>{
  const {owner,site}=await setup();const row=await article(owner,site);
  await owner.call('/sales',sale(row,site),409);
  const register=await owner.call('/registers',{site_id:site.id,opening_cents:10000});
  await owner.call('/registers',{site_id:site.id,opening_cents:0},409);
  const ticket=await owner.call('/sales',sale(row,site));assert.equal(ticket.register_id,register.id);
  await owner.call('/registers/'+register.id+'/movement',{direction:'in',amount_cents:2000,reason:'Fonds ajoutés'});
  await owner.call('/registers/'+register.id+'/movement',{direction:'out',amount_cents:1000,reason:'Dépôt en coffre'});
  const summary=(await owner.call('/registers'))[0];assert.equal(summary.expected_cents,11500);assert.equal(summary.tickets,1);
  await owner.call('/registers/'+register.id+'/close',{counted_cents:11450},400);
  const closed=await owner.call('/registers/'+register.id+'/close',{counted_cents:11450,note:'Écart constaté au comptage'});assert.equal(closed.difference_cents,-50);
  await owner.call('/registers/'+register.id+'/movement',{direction:'in',amount_cents:1,reason:'Trop tard'},409);
  const next=await article(owner,site);await owner.call('/sales',sale(next,site),409);
});
test('remboursement : une seule correction et retour stock atomique, requête répétée sans doublon',async()=>{
  const {owner,site}=await setup();const row=await article(owner,site);await owner.call('/registers',{site_id:site.id,opening_cents:5000});
  const ticket=await owner.call('/sales',sale(row,site)),body={sale_id:ticket.id,kind:'refund',payment:'Espèces',reason:'Retour client',return_ids:[row.id],confirm_payment:true},requestId=crypto.randomUUID();
  const refund=await owner.call('/refunds',body,200,{requestId});const repeated=await owner.call('/refunds',body,200,{requestId});assert.equal(refund.id,repeated.id);
  await owner.call('/refunds',body,409);assert.equal((await owner.call('/refunds')).length,1);
  const returned=await owner.call('/stock/'+row.id);assert.equal(returned.state,'controle');assert.equal(returned.history[0].type,'retour');
  assert.equal((await owner.call('/registers'))[0].expected_cents,5000);
});
test('annulation ancienne et remboursement sans trésorerie refusés',async()=>{
  const {owner,site}=await setup();const row=await article(owner,site);const first=await owner.call('/registers',{site_id:site.id,opening_cents:0});
  const ticket=await owner.call('/sales',sale(row,site));await owner.call('/registers/'+first.id+'/close',{counted_cents:500});await owner.call('/registers',{site_id:site.id,opening_cents:0});
  const body={sale_id:ticket.id,kind:'cancel',payment:'Espèces',reason:'Correction',confirm_payment:true};
  await owner.call('/refunds',body,400);await owner.call('/refunds',{...body,kind:'refund'},400);
  await owner.call('/refunds',{...body,kind:'refund',payment:'Carte'});assert.equal((await owner.call('/stock/'+row.id)).state,'sorti');
});
test('documents : mentions contrôlées, numéro séquentiel et pièce émise non réinscriptible',async()=>{
  const {owner}=await setup();const contact=await customer(owner),body=draft(contact);
  const first=await owner.call('/documents',body);await owner.call('/documents/'+first.id+'/issue',{},400);
  await owner.call('/billing-profile',profile,200,{method:'PATCH'});
  const issued=await owner.call('/documents/'+first.id+'/issue',{});assert.match(issued.number,/^F\d{4}-000001$/);assert.equal(issued.total_cents,2400);
  await owner.call('/documents/'+first.id,{...body,lines:[{label:'Altérée',quantity:1,unit_ht_cents:1,vat_bps:0}]},409,{method:'PATCH'});
  await owner.call('/billing-profile',{...profile,legal_name:'Nom modifié'},200,{method:'PATCH'});
  assert.equal((await owner.call('/documents/'+first.id)).seller.legal_name,profile.legal_name);
  const second=await owner.call('/documents',body);const next=await owner.call('/documents/'+second.id+'/issue',{});assert(next.number.endsWith('000002'));
});
test('devis : conversion unique, paiements bornés, avoir intégral et remboursement tracé',async()=>{
  const {owner}=await setup();const contact=await customer(owner);await owner.call('/billing-profile',profile,200,{method:'PATCH'});
  const quote=await owner.call('/documents',{...draft(contact),kind:'quote'});await owner.call('/documents/'+quote.id+'/issue',{});
  const invoice=await owner.call('/documents/'+quote.id+'/invoice',{});await owner.call('/documents/'+quote.id+'/invoice',{},409);
  await owner.call('/documents/'+invoice.id+'/issue',{});
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await owner.call('/documents/'+invoice.id+'/payment',{amount_cents:2401,payment:'Virement',date},400);
  let paid=await owner.call('/documents/'+invoice.id+'/payment',{amount_cents:2400,payment:'Virement',date});assert.equal(paid.balance_cents,0);
  const credit=await owner.call('/documents/'+invoice.id+'/credit',{reason:'Commande annulée'});assert.equal(credit.source_number,paid.number);assert.match(credit.number,/^AV/);
  await owner.call('/documents/'+invoice.id+'/credit',{reason:'Encore'},409);
  paid=await owner.call('/documents/'+invoice.id+'/payment',{amount_cents:2400,payment:'Virement',date,kind:'refund'});assert.equal(paid.paid_cents,0);assert.equal(paid.balance_cents,0);
  await owner.call('/documents/'+invoice.id+'/payment',{amount_cents:1,payment:'Virement',date,kind:'refund'},400);
});
test('adhésions : périodes sans chevauchement, dates valides, annulation conservée',async()=>{
  const {owner}=await setup();const contact=await customer(owner),body={contact_id:contact.id,starts_on:'2026-01-01',ends_on:'2026-12-31',paid_on:'2026-01-01',amount_cents:1000,payment:'Carte'};
  const first=await owner.call('/memberships',body);await owner.call('/memberships',body,409);
  await owner.call('/memberships',{...body,starts_on:'2027-01-01',ends_on:'2027-12-31'});
  await owner.call('/memberships',{...body,starts_on:'2026-02-31'},400);
  await owner.call('/memberships/'+first.id+'/cancel',{reason:'Erreur de saisie'});
  assert((await owner.call('/memberships')).find(row=>row.id===first.id).cancelled_at);
});
test('import : aperçu sans écriture, CSV français, doublons externes et atomicité',async()=>{
  const {owner,site}=await setup();const csv='reference_externe;titre;categorie;type;quantite;poids_g;prix\nR1;"Livres; jeunesse";Livres;lot;12;3000;12,50\n';
  const revision=owner.revision;const preview=await owner.call('/stock-import',{mode:'preview',site_id:site.id,csv});assert.equal(preview.imported,1);assert.equal(owner.revision,revision);assert.equal((await owner.call('/stock')).length,0);
  const saved=await owner.call('/stock-import',{mode:'commit',site_id:site.id,csv});assert.equal(saved.imported,1);
  const row=(await owner.call('/stock'))[0];assert.equal(row.grams,3000);assert.equal(row.price_cents,1250);assert.equal(row.quantity,12);
  assert.equal((await owner.call('/stock-import',{mode:'commit',site_id:site.id,csv})).duplicates,1);
  const invalid=csv.replace('R1;','R2;')+'R3;Erreur;Inconnue;item;1;;\n';
  await owner.call('/stock-import',{mode:'commit',site_id:site.id,csv:invalid},400);assert.equal((await owner.call('/stock')).length,1);
  assert.throws(()=>parseCSV('reference_externe;titre;categorie\nR1;"non terminé;Livres'));
});
test('modules et droits : administration distincte de la caisse et isolation des postes',async()=>{
  const {owner,site}=await setup([]);await owner.call('/documents',undefined,403);await owner.call('/memberships',undefined,403);
  await owner.call('/settings',{name:'Atelier',modules:['administration','adhesions','caisse']},200,{method:'PATCH'});
  await owner.call('/team',{name:'Bureau',email:'bureau@example.test',roles:['administration']});
  const bureau=client({id:'bureau',email:'bureau@example.test',name:'Bureau'});bureau.workspace=owner.workspace;await bureau.call('/snapshot');
  await bureau.call('/contacts');await bureau.call('/documents');await bureau.call('/registers',undefined,403);await bureau.call('/stock-import',{mode:'preview',csv:'',site_id:site.id},403);
  await owner.call('/sites',{name:'Autre lieu',kind:'Stock',zones:['Réception']});
  const otherSite=(await owner.call('/sites')).find(row=>row.name==='Autre lieu');
  await owner.call('/snapshot');await owner.call('/registers',{site_id:site.id,opening_cents:0});
  const me=await owner.call('/me');await owner.call('/registers',{site_id:otherSite.id,opening_cents:0},403,{headers:{'X-Seconde-Vie-Cashier':me.id,'X-Seconde-Vie-Station':site.id}});
});
test('restauration : impossible d’effacer une pièce, des ventes ou une cotisation',async()=>{
  const {owner}=await setup(),backup=await owner.call('/backup'),contact=await customer(owner);await owner.call('/documents',draft(contact));
  await owner.call('/restore',{confirm:'Atelier',backup},409);assert.equal((await owner.call('/documents')).length,1);
});
test('factures concurrentes : aucune collision de numéros et reprise après actualisation',async()=>{
  const {owner}=await setup(),contact=await customer(owner);await owner.call('/billing-profile',profile,200,{method:'PATCH'});
  const docs=[await owner.call('/documents',draft(contact)),await owner.call('/documents',draft(contact))];
  const responses=await Promise.all(docs.map(doc=>core(new Request('https://sv.example.test/api/core/documents/'+doc.id+'/issue',{
    method:'POST',headers:{Origin:'https://sv.example.test','oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test','X-Seconde-Vie':'core','X-Seconde-Vie-Workspace':owner.workspace,'X-Seconde-Vie-Request':crypto.randomUUID(),'If-Match':String(owner.revision),'Content-Type':'application/json'},body:JSON.stringify({expected_version:doc._version})}),env)));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  const first=await responses.find(response=>response.status===200).json();
  await owner.call('/snapshot');const rows=await owner.call('/documents'),remaining=rows.find(row=>row.status==='draft');
  const second=await owner.call('/documents/'+remaining.id+'/issue',{});assert.notEqual(first.number,second.number);assert(second.number.endsWith('000002'));
});
