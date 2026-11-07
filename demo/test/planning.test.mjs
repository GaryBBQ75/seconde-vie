import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {localBindings} from '../scripts/local-bindings.mjs';
import {core} from '../worker/core.mjs';
import {dateKey,mondayOf,addDays,localToISO,localInput,moveLocalDays,exportCalendar} from '../public/planning-model.js';

let env,directory;
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'sv-planning-'));env=await localBindings(directory,{memory:true});});
afterEach(async()=>{env.close();await rm(directory,{recursive:true,force:true});});
function client(actor={id:'owner',email:'owner@example.test',name:'Responsable'}) {
  let workspace='',revision=0;const versions=new Map();
  return {get workspace(){return workspace;},set workspace(value){workspace=value;},get revision(){return revision;},async call(path,body,status=200,{method=body===undefined?'GET':'POST',requestId=crypto.randomUUID(),headers={}}={}) {
    const parts=path.split('/'),key=parts[1]+'/'+parts[2];if(body && versions.has(key))body={...body,expected_version:versions.get(key)};
    const response=await core(new Request('https://sv.example.test/api/core'+path,{method,headers:{Origin:'https://sv.example.test','oai-authenticated-user-id':actor.id,'oai-authenticated-user-email':actor.email,'oai-authenticated-user-full-name':actor.name,'X-Seconde-Vie':'core','X-Seconde-Vie-Workspace':workspace,'X-Seconde-Vie-Request':requestId,'If-Match':String(revision),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));
    if(response.headers.has('X-Seconde-Vie-Revision'))revision=Math.max(revision,Number(response.headers.get('X-Seconde-Vie-Revision')));
    if(path==='/workspaces' && value.id)workspace=value.id;
    if(path==='/planning' || path==='/snapshot')for(const type of ['shifts','availability'])for(const row of value[type]||[])versions.set(type+'/'+row.id,row._version);
    for(const row of Array.isArray(value)?value:[value])if(row?.id)versions.set(parts[1]+'/'+row.id,row._version);
    return value;
  }};
}
const base=()=>mondayOf(addDays(dateKey(Date.now(),'Europe/Paris'),14));
const times=(day=base(),from='09:00',to='12:00')=>({starts_at:localToISO(day+'T'+from,'Europe/Paris'),ends_at:localToISO(day+'T'+to,'Europe/Paris')});
async function setup() {
  const owner=client();await owner.call('/workspaces',{name:'Atelier',site_name:'Boutique'},201);const snapshot=await owner.call('/snapshot');
  await owner.call('/settings',{name:'Atelier',modules:['planning']},200,{method:'PATCH'});
  await owner.call('/team',{name:'Alice',email:'alice@example.test',roles:['reception']});await owner.call('/team',{name:'Benoît',email:'benoit@example.test',roles:['stock']});
  const people=await owner.call('/team');const alice=people.find(row=>row.email==='alice@example.test'),benoit=people.find(row=>row.email==='benoit@example.test');
  const worker=client({id:'alice',email:alice.email,name:alice.name});worker.workspace=owner.workspace;const other=client({id:'benoit',email:benoit.email,name:benoit.name});other.workspace=owner.workspace;
  const body={site_id:snapshot.sites[0].id,member_id:alice.id,activity:'Réception',...times()};return {owner,worker,other,alice,benoit,body,site:snapshot.sites[0]};
}

test('responsable prépare, publie et conserve la confidentialité des brouillons',async()=>{
  const {owner,worker,other,body,alice}=await setup();
  const row=await owner.call('/shifts',{...body,publication:'draft',note:'Consigne privée du créneau'});
  assert.equal((await worker.call('/planning')).shifts.length,0);assert.equal((await other.call('/planning')).team_shifts.length,0);
  await owner.call('/shifts/publish',{ids:[row.id]});
  const mine=await worker.call('/planning');assert.equal(mine.shifts[0].member_id,alice.id);assert.equal(mine.shifts[0].note,'Consigne privée du créneau');
  const team=await other.call('/planning');assert.equal(team.shifts.length,0);assert.equal(team.team_shifts.length,1);assert(!JSON.stringify(team).includes('Consigne privée'));assert.equal(team.people.length,0);
  await other.call('/shifts/'+row.id,undefined,404);
});
test('modification et réponse : les confirmations sont invalidées par un changement d’horaire',async()=>{
  const {owner,worker,other,body}=await setup();const row=await owner.call('/shifts',body);
  await worker.call('/planning');const confirmed=await worker.call('/shifts/'+row.id+'/respond',{response:'confirmed'});assert.equal(confirmed.response,'confirmed');
  await other.call('/planning');await other.call('/shifts/'+row.id+'/respond',{response:'confirmed'},403);
  await owner.call('/planning');const moved=await owner.call('/shifts/'+row.id,{...times(base(),'13:00','16:00')},200,{method:'PATCH'});assert.equal(moved.response,'pending');
  await worker.call('/planning');await worker.call('/shifts/'+row.id+'/respond',{response:'unavailable'},400);
  const response=await worker.call('/shifts/'+row.id+'/respond',{response:'unavailable',message:'Empêchement à revoir'});assert.equal(response.response,'unavailable');
  await owner.call('/planning');const note=await owner.call('/shifts/'+row.id,{note:'Consignes mises à jour'},200,{method:'PATCH'});assert.equal(note.response,'unavailable');
});
test('disponibilités personnelles : sécurité, conflits et dérogation explicite',async()=>{
  const {owner,worker,other,body,benoit}=await setup();await worker.call('/planning');
  const declaration=await worker.call('/availability',{kind:'unavailable',...times(),note:'Message réservé à la coordination'});
  await worker.call('/availability',{kind:'available',member_id:benoit.id,...times(addDays(base(),1))},403);
  const publicView=await other.call('/planning');assert.equal(publicView.availability.length,0);assert(!JSON.stringify(publicView).includes('Message réservé'));
  await other.call('/availability/'+declaration.id,{},403,{method:'DELETE'});
  await owner.call('/planning');await owner.call('/shifts',body,409);
  const row=await owner.call('/shifts',{...body,override_reason:'Accord explicite à vérifier avec Alice'});
  const myView=await worker.call('/planning');assert.equal(myView.shifts[0].has_unavailability,true);assert(!JSON.stringify(myView).includes('Accord explicite'));
  await worker.call('/availability/'+declaration.id,{},200,{method:'DELETE'});
  await owner.call('/planning');assert.equal((await owner.call('/shifts/'+row.id)).has_unavailability,false);
});
test('affectation collective et répétition atomiques, chevauchements contrôlés entre sites',async()=>{
  const {owner,body,alice,benoit}=await setup();
  const created=await owner.call('/shifts',{...body,member_ids:[alice.id,benoit.id],repeat_weeks:2,publication:'draft'});assert.equal(created.created.length,4);
  assert.equal((await owner.call('/shifts')).length,4);
  await owner.call('/sites',{name:'Deuxième site',kind:'Stock',zones:'Accueil'});const second=(await owner.call('/sites')).find(row=>row.name==='Deuxième site');
  await owner.call('/shifts',{...body,site_id:second.id},409);
  const conflict={...body,...times(addDays(base(),-7)),member_ids:[alice.id,benoit.id],repeat_weeks:2};
  await owner.call('/shifts',conflict,409);assert.equal((await owner.call('/shifts')).length,4);
});
test('copie de semaine : brouillons, heures locales et refus sans copie partielle',async()=>{
  const {owner,worker,body}=await setup();await owner.call('/shifts',body);
  const copy=await owner.call('/shifts/copy-week',{week_start:base()});assert.equal(copy.created[0].publication,'draft');assert.equal(localInput(copy.created[0].starts_at,'Europe/Paris'),addDays(base(),7)+'T09:00');
  assert.equal((await worker.call('/planning')).shifts.length,1);
  await owner.call('/shifts/copy-week',{week_start:base()},409);assert.equal((await owner.call('/shifts')).length,2);
});
test('publication bloquée si une indisponibilité est déclarée après la préparation',async()=>{
  const {owner,worker,body}=await setup();const row=await owner.call('/shifts',{...body,publication:'draft'});
  await worker.call('/planning');await worker.call('/availability',{kind:'unavailable',...times()});await owner.call('/planning');
  await owner.call('/shifts/publish',{ids:[row.id]},409);assert.equal((await owner.call('/shifts/'+row.id)).publication,'draft');
});
test('annulation conservée : visible par la personne, export calendrier annulé et réponse refusée',async()=>{
  const {owner,worker,body}=await setup();const row=await owner.call('/shifts',body);await owner.call('/shifts/'+row.id,{reason:'Site fermé'},200,{method:'DELETE'});
  assert.equal((await owner.call('/shifts')).length,0);assert.equal((await owner.call('/shifts?history=1')).length,1);
  const mine=await worker.call('/planning');assert.equal(mine.shifts[0].cancellation_reason,'Site fermé');assert.equal(mine.team_shifts.length,0);
  await worker.call('/shifts/'+row.id+'/respond',{response:'confirmed'},403);assert(exportCalendar(mine.shifts).includes('STATUS:CANCELLED'));
});
test('coordination du planning sans accès aux comptes ni à l’administration de la structure',async()=>{
  const {owner,body}=await setup();await owner.call('/team',{name:'Coordination',email:'coord@example.test',roles:['planning']});
  const coordinator=client({id:'coord',email:'coord@example.test',name:'Coordination'});coordinator.workspace=owner.workspace;
  const planning=await coordinator.call('/planning');assert.equal(planning.manager,true);assert(planning.people.length>0);assert(!JSON.stringify(planning.people).includes('@example.test'));
  await coordinator.call('/shifts',body);await coordinator.call('/team',undefined,403);await coordinator.call('/settings',{name:'Modifié'},403,{method:'PATCH'});
});
test('une modification concurrente refuse la réponse à une ancienne version de créneau',async()=>{
  const {owner,worker,body}=await setup();const row=await owner.call('/shifts',body);await worker.call('/planning');
  await owner.call('/shifts/'+row.id,{note:'Nouvelle consigne'},200,{method:'PATCH'});
  await worker.call('/shifts/'+row.id+'/respond',{response:'confirmed'},409);
  await worker.call('/planning');await worker.call('/shifts/'+row.id+'/respond',{response:'confirmed'});
});
test('module désactivé et accès de test : aucun contournement de l’identité et des droits serveur',async()=>{
  const {owner}=await setup();await owner.call('/login',{test_access:true,test_member:'owner',org:'passages'},405);
  await owner.call('/settings',{name:'Atelier',modules:[]},200,{method:'PATCH'});await owner.call('/planning',undefined,403);await owner.call('/availability',{kind:'available',...times()},403);
});
test('heures locales : copie autour du changement d’heure, saisies inexistantes et ambiguës refusées',()=>{
  assert.equal(localToISO('2026-03-23T09:00','Europe/Paris'),'2026-03-23T08:00:00.000Z');
  assert.equal(moveLocalDays('2026-03-23T08:00:00.000Z',7,'Europe/Paris'),'2026-03-30T07:00:00.000Z');
  assert.throws(()=>localToISO('2026-03-29T02:30','Europe/Paris'),/n’existe pas/);
  assert.throws(()=>localToISO('2026-10-25T02:30','Europe/Paris'),/ambiguë/);
  assert.throws(()=>localToISO('2026-02-31T09:00','Europe/Paris'),/Date invalide/);
});
test('agenda : pas de brouillons, échappement des notes et identifiant stable',()=>{
  const row={id:'shift-id',...times(),member_id:'a',site_name:'Lieu, test',activity:'Réception',publication:'published',note:'Ligne 1\nBEGIN:VEVENT',created_at:new Date().toISOString()};
  const calendar=exportCalendar([row,{...row,id:'draft-id',publication:'draft'}]);assert(calendar.includes('UID:shift-id@seconde-vie'));assert(!calendar.includes('draft-id'));assert(calendar.includes('Lieu\\, test'));assert(calendar.includes('Ligne 1\\nBEGIN:VEVENT'));
});
test('identifiants : création dans un navigateur sans crypto.randomUUID',()=>{
  const moduleURL=new URL('../public/identifiers.js',import.meta.url).href;
  execFileSync(process.execPath,['--input-type=module','-e',`const native=globalThis.crypto;let calls=0;Object.defineProperty(globalThis,'crypto',{value:{getRandomValues(array){calls++;return native.getRandomValues(array);}},configurable:true});const {uuid}=await import(${JSON.stringify(moduleURL)});const first=uuid(),second=uuid();if(calls!==2 || first===second || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first))throw Error('UUID invalide');`]);
});
