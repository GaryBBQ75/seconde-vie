import {validateBranding,validateCatalogue,defaultCatalogue} from '../public/module-config.js';
import {commerceRoute,publishCatalogue,catalogueStatus,afterStockWrite} from './commerce.mjs';
import { createBusinessAPI } from '../public/domain.js';
import seed from '../public/seed.js';
import { hasRole, pageRoles } from '../public/permissions.js';
import { modules, requiredModule } from '../public/modules.js';
import { operationCollections } from '../public/operations.js';
import { planningCollections } from '../public/planning-domain.js';

const collections = ['sites','stock','team','transfers','shifts','sales','tours','contacts','audit',...operationCollections,...planningCollections];
export const modulePages = Object.fromEntries(Object.entries(modules).map(([key,value])=>[key,value.pages]));
export const defaultSettings = {
  currency:'EUR',locale:'fr-FR',country:'FR',timeZone:'Europe/Paris',type:'ressourcerie',
  modules:[],catalogue:defaultCatalogue,intake:{price:false,photos:true,reference:false,note:false},customCategories:[],
  origins:['Apport volontaire','Collecte à domicile','Collecte partenaire','Déchèterie','Autre'],
};
const uuid = () => crypto.randomUUID();
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const clean = (value,max=120) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const result = (value,status=200,revision) => Response.json(value,{status,headers:{
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  ...(revision != null ? {'X-Seconde-Vie-Revision':String(revision)} : {}),
}});

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key,value) { this.values.set(key,String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function identity(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  const email=clean(request.headers.get('oai-authenticated-user-email'),254).toLowerCase();
  if (!id || !email) fail(401,'Connectez-vous avec votre compte pour ouvrir cet espace.');
  let name=request.headers.get('oai-authenticated-user-full-name') || email.split('@')[0];
  if(request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name=decodeURIComponent(name); } catch { name=email.split('@')[0]; }
  }
  return {id,email,name:clean(name,100)};
}

async function readBody(request) {
  if(!request.headers.get('Content-Type')?.includes('application/json')) fail(415,'Envoyez des données JSON.');
  const reader=request.body?.getReader();
  if(!reader) fail(400,'Formulaire vide.');
  const decoder=new TextDecoder();let data='',size=0;
  for(;;) {
    const {done,value}=await reader.read();
    if(done) break;
    size+=value.byteLength;
    if(size>12000000) {await reader.cancel();fail(413,'Fichier trop volumineux (12 Mo maximum).');}
    data+=decoder.decode(value,{stream:true});
  }
  try {return JSON.parse(data+decoder.decode());} catch {fail(400,'Données illisibles.');}
}

async function available(db,actor) {
  return (await db.prepare(`SELECT DISTINCT w.id,w.name,w.owner_id FROM sv_workspaces w
    LEFT JOIN sv_records r ON r.workspace_id=w.id AND r.type='team'
    WHERE w.owner_id=? OR (lower(json_extract(r.data,'$.email'))=? AND json_extract(r.data,'$.active')=1)
    ORDER BY w.created_at`).bind(actor.id,actor.email).all()).results;
}

async function load(db,workspaceId) {
  // D1 batch reads are one transaction, so the revision and records describe one snapshot.
  const [meta,records]=await db.batch([
    db.prepare('SELECT * FROM sv_workspaces WHERE id=?').bind(workspaceId),
    db.prepare('SELECT type,id,data FROM sv_records WHERE workspace_id=?').bind(workspaceId),
  ]);
  const workspace=meta.results[0];
  if(!workspace) fail(404,'Espace introuvable.');
  const settings={...defaultSettings,...JSON.parse(workspace.settings)};
  const state={...Object.fromEntries(collections.map(key=>[key,[]])),settings,
    customCategories:settings.customCategories || [],teamSeedVersion:2};
  for(const row of records.results) if(collections.includes(row.type)) state[row.type].push(JSON.parse(row.data));
  state.stock.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  state.audit.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return {workspace,state,records:records.results.filter(row=>collections.includes(row.type))};
}

function principal(actor,workspace,state) {
  const member=state.team.find(row=>row.active && (row.platform_user_id === actor.id || row.email?.toLowerCase() === actor.email));
  if(!member) fail(403,'Votre compte n’a pas accès à cet espace.');
  return member;
}

function business(actor,request,loaded) {
  const {workspace,state}=loaded;
  const principalMember=principal(actor,workspace,state);
  let member=principalMember;
  const cashierId=request.headers.get('X-Seconde-Vie-Cashier');
  const siteId=request.headers.get('X-Seconde-Vie-Station');
  if(cashierId || siteId) {
    if(!cashierId || !siteId || !hasRole(principalMember,'vente')) fail(403,'Poste caisse non autorisé.');
    member=state.team.find(row=>row.id===cashierId && row.active && hasRole(row,'vente'));
    if(!member || !state.sites.some(site=>site.id===siteId)) fail(403,'Ce poste caisse n’est plus disponible.');
  }
  const storage=new MemoryStorage(),session=new MemoryStorage();
  storage.setItem('seconde-vie-demo-v1-'+workspace.id,JSON.stringify(state));
  session.setItem('seconde-vie-demo-profile-v2',JSON.stringify({org:workspace.id,member:member.id,
    ...(cashierId ? {cash_station:{site_id:siteId}} : {})}));
  const api=createBusinessAPI({localStorage:storage,sessionStorage:session,shared:true,
    organisationNames:{[workspace.id]:workspace.name}});
  return {api,storage,session,principalMember,read:()=>JSON.parse(storage.getItem('seconde-vie-demo-v1-'+workspace.id))};
}

function requireAdmin(member) {
  if(!member.roles.includes('admin')) fail(403,'Action réservée au responsable.');
}

function validateSettings(input,current=defaultSettings) {
  const next={...current};
  if(Object.hasOwn(input,'branding'))next.branding=validateBranding(input.branding);
  if(Object.hasOwn(input,'currency')) {
    if(!['EUR','GBP','USD','CAD','AUD','NZD','CHF','JPY'].includes(input.currency)) fail(400,'Choisissez une devise proposée.');
    next.currency=input.currency;
  }
  if(Object.hasOwn(input,'locale')) {
    if(!['fr-FR','en-GB','en-US','de-DE','es-ES','it-IT'].includes(input.locale)) fail(400,'Choisissez un format régional proposé.');
    next.locale=input.locale;
  }
  if(Object.hasOwn(input,'country')) {
    if(!/^[A-Z]{2}$/.test(input.country)) fail(400,'Indiquez un code pays à deux lettres.');
    next.country=input.country;
  }
  if(Object.hasOwn(input,'timeZone')) {
    try {new Intl.DateTimeFormat('fr',{timeZone:input.timeZone}).format();} catch {fail(400,'Fuseau horaire invalide.');}
    next.timeZone=input.timeZone;
  }
  if(Object.hasOwn(input,'type')) {
    if(!['ressourcerie','charity','reseller','network'].includes(input.type)) fail(400,'Type de structure inconnu.');
    next.type=input.type;
  }
  if(Object.hasOwn(input,'modules')) {
    // "rapports" used to be optional. Accept older backups, but keep flow reports in the core.
    if(!Array.isArray(input.modules) || input.modules.some(key=>key!=='rapports' && !Object.hasOwn(modulePages,key))) fail(400,'Module inconnu.');
    next.modules=[...new Set(input.modules.filter(key=>key!=='rapports'))];
  }
  if(Object.hasOwn(input,'catalogue'))next.catalogue=validateCatalogue(input.catalogue,current.catalogue);
  if(Object.hasOwn(input,'intake')) next.intake=Object.fromEntries(['price','photos','reference','note'].map(key=>[key,input.intake?.[key] === true]));
  if(Object.hasOwn(input,'origins')) {
    if(!Array.isArray(input.origins) || !input.origins.length || input.origins.length>15 || input.origins.some(value=>typeof value!=='string' || !value.trim() || value.length>100)) fail(400,'Indiquez entre 1 et 15 provenances.');
    next.origins=[...new Set(input.origins.map(value=>value.trim()))];
  }
  return next;
}

async function createWorkspace(db,actor,body) {
  const name=clean(body.name,100),siteName=clean(body.site_name,100);
  if(!name || !siteName) fail(400,'Nommez la structure et le premier site.');
  const existing=await db.prepare('SELECT id FROM sv_workspaces WHERE owner_id=?').bind(actor.id).first();
  if(existing) return existing.id;
  const id=uuid(),settings=validateSettings(body),siteId=uuid(),memberId=uuid();
  await db.batch([
    db.prepare('INSERT INTO sv_workspaces(id,owner_id,name,settings,created_at) VALUES(?,?,?,?,?)')
      .bind(id,actor.id,name,JSON.stringify(settings),new Date().toISOString()),
    db.prepare('INSERT INTO sv_records(workspace_id,type,id,data) VALUES(?,?,?,?)').bind(id,'team',memberId,
      JSON.stringify({id:memberId,name:actor.name,email:actor.email,platform_user_id:actor.id,roles:['admin'],active:true})),
    db.prepare('INSERT INTO sv_records(workspace_id,type,id,data) VALUES(?,?,?,?)').bind(id,'sites',siteId,
      JSON.stringify({id:siteId,name:siteName,kind:'Réception et stock',zones:[{id:uuid(),name:'Réception'}]})),
  ]);
  return id;
}

async function photos(body,env,workspaceId) {
  const source=body.photos ?? (body.photo ? [body.photo] : null);
  if(source == null) return;
  if(!Array.isArray(source) || source.length>6) fail(400,'Ajoutez au plus six photos.');
  const values=[];
  for(const value of source) {
    if(typeof value !== 'string') fail(400,'Photo invalide.');
    if(value.startsWith('/api/core/photos/'+workspaceId+'/') && /^[a-z0-9-]+$/.test(value.split('/').at(-1))) {
      if(!await env.BUCKET.head(value.replace('/api/core/photos/',''))) fail(400,'Photo introuvable.');
      values.push(value);continue;
    }
    if(value.length>400000 || !/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value)) fail(400,'Choisissez une photo JPEG de moins de 300 Ko.');
    let bytes;
    try {bytes=Uint8Array.from(atob(value.split(',')[1]),char=>char.charCodeAt(0));} catch {fail(400,'Photo illisible.');}
    if(bytes[0]!==255 || bytes[1]!==216) fail(400,'Le fichier n’est pas une photo JPEG.');
    const key=workspaceId+'/'+uuid();
    await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
    values.push('/api/core/photos/'+key);
  }
  body.photos=values;delete body.photo;
}

function rowsFor(state) {
  return collections.flatMap(type=>(state[type] || []).map(row=>({type,id:row.id,data:JSON.stringify(row)})));
}

async function commit(db,loaded,state,actor,requestId,value,path,{snapshot=false}={}) {
  const {workspace,records}=loaded;
  const before=new Map(records.map(row=>[row.type+'/'+row.id,row.data]));
  for(const type of collections) for(const row of state[type] || []) {
    if(JSON.stringify(row)!==before.get(type+'/'+row.id)) row._version=workspace.revision+1;
  }
  if(value && typeof value==='object' && !Array.isArray(value) && value.id) {
    const updated=collections.flatMap(type=>state[type] || []).find(row=>row.id===value.id);
    if(updated?._version)value._version=updated._version;
  }
  const all=rowsFor(state);
  const changed=all.filter(row=>row.data!==before.get(row.type+'/'+row.id));
  const remaining=new Set(all.map(row=>row.type+'/'+row.id));
  const removed=records.filter(row=>!remaining.has(row.type+'/'+row.id));
  const revision=workspace.revision,conditions='EXISTS (SELECT 1 FROM sv_workspaces WHERE id=? AND revision=?)';
  const statements=[];
  if(snapshot) {
    const snapshotId=uuid();
    statements.push(db.prepare(`INSERT INTO sv_snapshots SELECT ?,id,name,settings,revision,? FROM sv_workspaces WHERE id=? AND revision=?`)
      .bind(snapshotId,new Date().toISOString(),workspace.id,revision));
    statements.push(db.prepare(`INSERT INTO sv_snapshot_records SELECT ?,type,id,data FROM sv_records WHERE workspace_id=? AND type!='commerce_private' AND ${conditions}`)
      .bind(snapshotId,workspace.id,workspace.id,revision));
  }
  // Write only changed records. All predicates use the old revision inside the same atomic batch.
  for(let i=0;i<changed.length;i+=100) statements.push(db.prepare(`INSERT INTO sv_records(workspace_id,type,id,data)
    SELECT ?,json_extract(value,'$.type'),json_extract(value,'$.id'),json_extract(value,'$.data') FROM json_each(?)
    WHERE ${conditions} ON CONFLICT(workspace_id,type,id) DO UPDATE SET data=excluded.data`)
    .bind(workspace.id,JSON.stringify(changed.slice(i,i+100)),workspace.id,revision));
  for(let i=0;i<removed.length;i+=100) statements.push(db.prepare(`DELETE FROM sv_records WHERE workspace_id=?
    AND type||'/'||id IN (SELECT value FROM json_each(?)) AND ${conditions}`)
    .bind(workspace.id,JSON.stringify(removed.slice(i,i+100).map(row=>row.type+'/'+row.id)),workspace.id,revision));
  const auditId=uuid(),audit={id:auditId,created_at:new Date().toISOString(),actor:actor.name,actor_id:actor.id,
    action:path,changed:changed.length,removed:removed.length};
  statements.push(db.prepare(`INSERT INTO sv_records SELECT ?,'audit',?,? WHERE ${conditions}`)
    .bind(workspace.id,auditId,JSON.stringify(audit),workspace.id,revision));
  statements.push(db.prepare(`INSERT INTO sv_requests SELECT ?,?,?,?,?,? WHERE ${conditions}`)
    .bind(workspace.id,actor.id,requestId,JSON.stringify(value),revision+1,new Date().toISOString(),workspace.id,revision));
  const settings={...state.settings,customCategories:state.customCategories || []};
  statements.push(db.prepare('UPDATE sv_workspaces SET name=?,settings=?,revision=revision+1 WHERE id=? AND revision=?')
    .bind(workspace.name,JSON.stringify(settings),workspace.id,revision));
  const response=await db.batch(statements);
  if(!response.at(-1).meta.changes) fail(409,'Une autre personne a modifié cet espace. Actualisez puis réessayez.');
  return revision+1;
}

function validateBackup(body,workspace,state,actor) {
  if(body.format!=='seconde-vie-core' || body.version!==1 || body.workspace_id!==workspace.id || !body.state)
    fail(400,'Cette sauvegarde ne correspond pas à cet espace.');
  const imported=body.state;
  const next={settings:validateSettings(imported.settings || {},state.settings),customCategories:imported.customCategories || []};
  for(const type of collections) {
    const source=imported[type] ?? ([...operationCollections,...planningCollections].includes(type)?[]:undefined);
    if(!Array.isArray(source) || source.length>10000) fail(400,'Sauvegarde incomplète ou trop volumineuse.');
    next[type]=source;
    const ids=new Set();
    for(const row of next[type]) {
      if(!row || typeof row!=='object' || !/^[a-z0-9-]{1,80}$/i.test(row.id || '') || ids.has(row.id)) fail(400,'Identifiants invalides dans la sauvegarde.');
      ids.add(row.id);
      if(JSON.stringify(row).length>1500000) fail(400,'Une fiche dépasse la taille maximale.');
    }
  }
  // Restoring business data never creates or changes account grants.
  const canonical=rows=>JSON.stringify(rows.map(row=>JSON.stringify(row)).sort());
  for(const type of ['sales','cashSessions','refunds','documents','memberships']) {
    if(canonical(next[type])!==canonical(state[type]))fail(409,'Cette restauration modifierait le journal de caisse, une pièce ou une cotisation. Utilisez les corrections tracées.');
  }
  next.team=state.team;
  const sites=new Map(next.sites.map(site=>[site.id,site]));
  for(const site of next.sites) if(!clean(site.name) || !Array.isArray(site.zones) || site.zones.some(zone=>!clean(zone.id) || !clean(zone.name))) fail(400,'Sites invalides.');
  const contacts=new Set(next.contacts.map(row=>row.id));
  const codes=new Set();
  for(const row of next.stock) {
    const site=sites.get(row.site_id);
    if(!site || !['item','lot'].includes(row.kind) || !['tri','controle','pret','transit','sorti'].includes(row.state)
      || !clean(row.title,150) || !clean(row.code) || codes.has(row.code) || !Array.isArray(row.history)
      || (row.contact_id && !contacts.has(row.contact_id))
      || (row.zone_id && !site.zones.some(zone=>zone.id===row.zone_id))
      || (row.quantity!=null && (!Number.isSafeInteger(row.quantity) || row.quantity<0))
      || (row.grams!=null && (!Number.isSafeInteger(row.grams) || row.grams<0))
      || (row.price_cents!=null && (!Number.isSafeInteger(row.price_cents) || row.price_cents<0 || row.price_cents>100000000))
      || !Number.isFinite(Date.parse(row.created_at))) fail(400,'Une fiche de la sauvegarde est invalide.');
    codes.add(row.code);
    if((row.photos || []).some(value=>!value.startsWith('/api/core/photos/'+workspace.id+'/'))) fail(400,'Une photo appartient à un autre espace.');
  }
  for(const transfer of next.transfers) if(!sites.has(transfer.origin_id) || !sites.has(transfer.destination_id)
    || !Array.isArray(transfer.lines) || transfer.lines.some(line=>!next.stock.some(row=>row.id===line.id))) fail(400,'Transfert invalide.');
  next.shifts=next.shifts.filter(row=>sites.has(row.site_id) && state.team.some(member=>member.id===row.member_id));
  for(const row of next.shifts) {
    if(!Number.isFinite(+new Date(row.starts_at)) || !Number.isFinite(+new Date(row.ends_at)) || row.ends_at<=row.starts_at || !seed.config.activities.includes(row.activity)
      || row.publication && !['draft','published'].includes(row.publication) || row.response && !['pending','confirmed','unavailable'].includes(row.response))fail(400,'Planning invalide dans la sauvegarde.');
  }
  for(const row of next.availability)if(!state.team.some(member=>member.id===row.member_id) || !['available','unavailable'].includes(row.kind) || !Number.isFinite(+new Date(row.starts_at)) || !Number.isFinite(+new Date(row.ends_at)) || row.ends_at<=row.starts_at)fail(400,'Disponibilités invalides dans la sauvegarde.');
  return next;
}

export async function core(request,env) {
  try {
    const actor=identity(request),url=new URL(request.url),path=url.pathname.slice('/api/core'.length) || '/';
    if(!env.DB || !env.BUCKET) fail(503,'L’espace partagé est en cours de préparation. Réessayez dans un instant.');
    const db=env.DB,write=!['GET','HEAD'].includes(request.method);
    if(write && (request.headers.get('Origin')!==url.origin || request.headers.get('X-Seconde-Vie')!=='core')) fail(403,'Action non autorisée depuis cette page.');
    let body=write ? await readBody(request) : undefined;
    if(path==='/bootstrap') {
      if(request.method!=='GET') fail(405,'Méthode indisponible.');
      return result({actor,workspaces:await available(db,actor)});
    }
    if(path==='/workspaces' && request.method==='POST') {
      const id=await createWorkspace(db,actor,body);return result({id},201);
    }
    const choices=await available(db,actor);
    const photoPath=path.match(/^\/photos\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
    const workspaceId=photoPath?.[1] || request.headers.get('X-Seconde-Vie-Workspace') || choices[0]?.id;
    if(!choices.some(item=>item.id===workspaceId)) fail(403,'Votre compte n’a pas accès à cet espace.');
    if(photoPath) {
      if(request.method!=='GET') fail(405,'Méthode indisponible.');
      const photo=await env.BUCKET.get(photoPath[1]+'/'+photoPath[2]);
      return photo ? new Response(photo.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}}) : result({error:'Photo introuvable.'},404);
    }
    const loaded=await load(db,workspaceId),{workspace}=loaded;
    let state=loaded.state;
    const context=business(actor,request,loaded),me=await context.api('/me');
    if(path==='/catalogue-status' && request.method==='GET') {if(!hasRole(me,'stock'))fail(403,'Accès réservé au stock.');return result(await catalogueStatus(env,workspace.id),200,workspace.revision);}
    if(path==='/catalogue-publish' || path.startsWith('/commerce')) {
      if(me.cash_station)fail(403,'Action indisponible depuis un poste caisse.');
      if(write&&Number(request.headers.get('If-Match'))!==workspace.revision)fail(409,'Actualisez l’espace avant la synchronisation.');
      if(path==='/catalogue-publish') {
        requireAdmin(me);if(request.method!=='POST')fail(405,'Méthode indisponible.');if(!state.settings.modules.includes('vitrine'))fail(403,'Activez le module Catalogue.');
        return result(await publishCatalogue(env,workspace,state),200,workspace.revision);
      }
      return result(await commerceRoute({env,workspace,state,me,path,method:request.method,body}),200,workspace.revision);
    }
    if(path==='/revision' && request.method==='GET') return result({revision:workspace.revision},200,workspace.revision);
    if(path==='/snapshot' && request.method==='GET') {
      const read=async (route,roles=[])=>hasRole(me,...roles) ? context.api(route) : [];
      return result({me,config:await context.api('/config'),sites:await context.api('/sites'),
        stock:await read('/stock',['reception','tri','atelier','stock','vente','rapports']),
        transfers:me.cash_station ? [] : await read('/transfers',['reception','tri','stock']),
        shifts:state.settings.modules.includes('planning') ? await context.api('/shifts') : [],team:await read('/team',['admin'])},200,workspace.revision);
    }
    if(write) {
      const requestId=request.headers.get('X-Seconde-Vie-Request');
      if(!/^[a-z0-9-]{16,80}$/i.test(requestId || '')) fail(400,'Identifiant de l’opération manquant.');
      const previous=await db.prepare('SELECT result,revision FROM sv_requests WHERE workspace_id=? AND actor_id=? AND request_id=?')
        .bind(workspaceId,actor.id,requestId).first();
      if(previous) return result(JSON.parse(previous.result),200,previous.revision);
      if(Number(request.headers.get('If-Match'))!==workspace.revision) fail(409,'Des modifications sont disponibles. Actualisez avant d’enregistrer.');
      const [,resource,itemId]=path.split('/');
      const collection={registers:'cashSessions','billing-profile':'businessProfiles'}[resource] || resource;
      const current=state[collection]?.find?.(row=>row.id===itemId);
      if(current && resource==='shifts' && !hasRole(me,'planning') && !(path.endsWith('/respond') && current.member_id===me.id && !current.cancelled_at && current.publication!=='draft'))fail(403,'Vous ne pouvez répondre qu’à vos créneaux publiés.');
      if(current && resource==='availability' && !hasRole(me,'planning') && current.member_id!==me.id)fail(403,'Cette déclaration ne vous appartient pas.');
      if(current?._version && body.expected_version!==current._version)
        fail(409,'Cette fiche a été modifiée depuis son ouverture. Actualisez avant de recommencer.');
      if(path==='/settings') {
        requireAdmin(me);if(request.method!=='PATCH') fail(405,'Méthode indisponible.');
        const settings=validateSettings(body,state.settings);
        if(settings.currency!==state.settings.currency && (state.stock.some(row=>row.price_cents!=null) || state.cashSessions.length || state.documents.length || state.memberships.length)) fail(409,'La devise ne peut plus changer après la saisie de prix, de mouvements ou de documents.');
        if(!clean(body.name,100)) fail(400,'Nommez la structure.');
        workspace.name=clean(body.name,100);state.settings=settings;
      } else if(path==='/restore') {
        requireAdmin(me);if(request.method!=='POST' || body.confirm!==workspace.name) fail(400,'Recopiez le nom de la structure pour confirmer.');
        state=validateBackup(body.backup,workspace,state,actor);
        state.audit=loaded.state.audit;
      } else {
        if(/^\/(login|logout|profiles|config|me|snapshot|backup|audit|revision)(?:\/|$)/.test(path)) fail(405,'Action indisponible.');
        if(path.startsWith('/team/')) {
          const target=state.team.find(row=>row.id===path.split('/')[2]);
          if(target?.platform_user_id===workspace.owner_id && (body.active===false || !body.roles?.includes('admin') || body.email!==target.email)) fail(400,'Conservez l’accès du propriétaire de l’espace.');
        }
        const required=requiredModule(path,request.method,body);
        if(required && !state.settings.modules.includes(required)) fail(403,'Activez le module « '+modules[required].label+' » dans les réglages.');
        if(body && (Object.hasOwn(body,'photos') || Object.hasOwn(body,'photo'))) {
          if(!hasRole(me,'reception','tri','atelier','stock')) fail(403,'Ajout de photo non autorisé.');
          await photos(body,env,workspaceId);
        }
        const value=await context.api(path+url.search,{method:request.method,body});
        if(path==='/stock-import' && body.mode==='preview')return result(value,200,workspace.revision);
        state=context.read();
        const revision=await commit(db,loaded,state,actor,requestId,value,path);
        if(['/stock','/sales','/refunds','/transfers'].some(prefix=>path===prefix||path.startsWith(prefix+'/')))await afterStockWrite(env,{...workspace,revision},state);
        return result(value,200,revision);
      }
      const value={ok:true};
      const revision=await commit(db,loaded,state,actor,requestId,value,path,{snapshot:path==='/restore'});
      if(env.CATALOGUE_URL)await afterStockWrite(env,{...workspace,revision},state);
      return result(value,200,revision);
    }
    if(request.method!=='GET') fail(405,'Méthode indisponible.');
    if(path==='/backup') {
      requireAdmin(me);
      return result({format:'seconde-vie-core',version:1,workspace_id:workspace.id,name:workspace.name,
        created_at:new Date().toISOString(),revision:workspace.revision,state},200,workspace.revision);
    }
    if(path==='/snapshots') {
      requireAdmin(me);
      const rows=await db.prepare('SELECT id,created_at,revision FROM sv_snapshots WHERE workspace_id=? ORDER BY created_at DESC LIMIT 10').bind(workspace.id).all();
      return result(rows.results,200,workspace.revision);
    }
    if(/^\/snapshots\/[a-z0-9-]+$/.test(path)) {
      requireAdmin(me);
      const snapshot=await db.prepare('SELECT * FROM sv_snapshots WHERE id=? AND workspace_id=?').bind(path.split('/')[2],workspace.id).first();
      if(!snapshot)fail(404,'Version introuvable.');
      const rows=(await db.prepare('SELECT type,id,data FROM sv_snapshot_records WHERE snapshot_id=?').bind(snapshot.id).all()).results;
      const previous={...Object.fromEntries(collections.map(type=>[type,[]])),settings:JSON.parse(snapshot.settings),customCategories:JSON.parse(snapshot.settings).customCategories || []};
      for(const row of rows)previous[row.type].push(JSON.parse(row.data));
      return result({format:'seconde-vie-core',version:1,workspace_id:workspace.id,name:snapshot.name,revision:snapshot.revision,created_at:snapshot.created_at,state:previous},200,workspace.revision);
    }
    if(path==='/audit') {requireAdmin(me);return result(state.audit.slice(0,200),200,workspace.revision);}
    if(['/login','/logout','/profiles'].includes(path)) fail(405,'Utilisez votre compte connecté.');
    const required=requiredModule(path);
    if(required && !state.settings.modules.includes(required)) fail(403,'Activez le module « '+modules[required].label+' » dans les réglages.');
    return result(await context.api(path+url.search),200,workspace.revision);
  } catch(error) {
    return result({error:error.status ? error.message : 'L’opération n’a pas été enregistrée. Réessayez.'},error.status || 500);
  }
}
