import {hasRole} from './permissions.js';
import {uuid} from './identifiers.js';
import {dateKey,mondayOf,addDays,moveLocalDays,overlap,published,validDay} from './planning-model.js';

export const planningMethods={planning:['GET'],shifts:['GET','POST','PATCH','DELETE'],availability:['GET','POST','DELETE']};
export const planningCollections=['availability'];
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value='',max=500)=>{if(typeof value!=='string' || value.trim().length>max)fail(400,'Texte trop long ou invalide.');return value.trim();};
const get=(rows,id)=>rows.find(row=>row.id===id) || fail(404,'Créneau ou déclaration introuvable.');
const manager=me=>hasRole(me,'planning');
const requireManager=me=>{if(!manager(me))fail(403,'Action réservée au responsable du planning.');};
const now=()=>new Date().toISOString();
function range(body,maxDays) {
  if(!['starts_at','ends_at'].every(key=>typeof body[key]==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(body[key])))fail(400,'Envoyez des horaires avec leur fuseau.');
  const start=new Date(body.starts_at),end=new Date(body.ends_at);
  if(!Number.isFinite(+start) || !Number.isFinite(+end) || end<=start || end-start>maxDays*86400000)fail(400,'Vérifiez la durée du créneau.');
  return {starts_at:start.toISOString(),ends_at:end.toISOString()};
}
const active=row=>!row.cancelled_at;
function history(row,me,action,detail='') {row.updated_at=now();(row.history??=[]).push({at:row.updated_at,by:me.name,member_id:me.id,action,detail});}
function validateShift(body,state,activities,excludeId) {
  const times=range(body,1),member=get(state.team,body.member_id),site=get(state.sites,body.site_id);
  if(!member.active)fail(400,'Cette personne est désactivée.');
  if(!activities.includes(body.activity))fail(400,'Choisissez une activité valide.');
  const publication=body.publication || 'published';if(!['draft','published'].includes(publication))fail(400,'Statut du planning invalide.');
  if(state.shifts.some(row=>active(row) && row.id!==excludeId && row.member_id===member.id && overlap(row,times)))fail(409,member.name+' est déjà affecté sur ce créneau, y compris sur un autre site.');
  const override_reason=text(body.override_reason??'');
  if(state.availability.some(row=>active(row) && row.kind==='unavailable' && row.member_id===member.id && overlap(row,times)) && !override_reason)fail(409,member.name+' a déclaré une indisponibilité. Ajustez le créneau ou expliquez la dérogation.');
  return {...times,member_id:member.id,member_name:member.name,site_id:site.id,site_name:site.name,activity:body.activity,publication,note:text(body.note??''),override_reason};
}
function canRead(row,me) {return manager(me) || row.member_id===me.id && row.publication!=='draft';}
function cleanShift(row,state,me) {
  const conflicts=state.availability.filter(value=>active(value) && value.kind==='unavailable' && value.member_id===row.member_id && overlap(value,row));
  const {override_reason,...safe}=row;
  return {...safe,...(manager(me)?{override_reason}:{}),publication:row.publication || 'published',response:row.response || 'pending',has_unavailability:conflicts.length>0,member_inactive:!state.team.some(member=>member.id===row.member_id && member.active)};
}
export function planningOperation({path,method,body={},state,me,activities,searchParams}) {
  if(me.cash_station)fail(403,'Quittez le poste caisse pour ouvrir le planning.');
  state.shifts??=[];state.availability??=[];
  const [resource,id,action]=path.split('/').filter(Boolean),timeZone=state.settings?.timeZone || 'Europe/Paris';
  const visible=()=>state.shifts.filter(row=>canRead(row,me) && (searchParams.get('history')==='1' && manager(me) || active(row))).map(row=>cleanShift(row,state,me));
  if(resource==='planning')return {shifts:manager(me)?visible():state.shifts.filter(row=>row.member_id===me.id && row.publication!=='draft').map(row=>cleanShift(row,state,me)),team_shifts:state.shifts.filter(published).map(row=>({id:row.id,member_id:row.member_id,member_name:row.member_name,site_id:row.site_id,site_name:row.site_name,activity:row.activity,starts_at:row.starts_at,ends_at:row.ends_at,publication:'published'})),availability:state.availability.filter(row=>active(row) && (manager(me) || row.member_id===me.id)),people:manager(me)?state.team.filter(member=>member.active).map(({id,name,roles})=>({id,name,roles})):[],timeZone,manager:manager(me)};
  if(resource==='availability') {
    if(method==='GET')return state.availability.filter(row=>active(row) && (manager(me) || row.member_id===me.id));
    if(method==='DELETE') {
      const row=get(state.availability,id);if(!manager(me) && row.member_id!==me.id)fail(403,'Vous ne pouvez retirer que vos propres déclarations.');
      if(!active(row))fail(409,'Cette déclaration est déjà retirée.');row.cancelled_at=now();row.cancelled_by=me.name;return row;
    }
    if(id)fail(405,'Adresse de déclaration invalide.');
    const member_id=body.member_id || me.id;if(!manager(me) && member_id!==me.id)fail(403,'Déclarez uniquement vos propres disponibilités.');
    const member=get(state.team,member_id);if(!member.active)fail(400,'Personne désactivée.');
    if(!['available','unavailable'].includes(body.kind))fail(400,'Choisissez disponible ou indisponible.');
    const times=range(body,90),weeks=body.repeat_weeks??1;
    if(!Number.isInteger(weeks) || weeks<1 || weeks>8)fail(400,'Répétition limitée à huit semaines.');
    const created=[];
    for(let week=0;week<weeks;week++) {
      const period={starts_at:moveLocalDays(times.starts_at,week*7,timeZone),ends_at:moveLocalDays(times.ends_at,week*7,timeZone)};
      if(state.availability.some(row=>active(row) && row.member_id===member_id && overlap(row,period)))fail(409,'Une déclaration existe déjà sur cette période. Retirez-la avant de la remplacer.');
      const row={id:uuid(),member_id,member_name:member.name,kind:body.kind,...period,note:text(body.note??''),created_at:now(),created_by:me.name};state.availability.push(row);created.push(row);
    }
    return weeks===1?created[0]:{created};
  }
  if(method==='GET') {const rows=visible();return id?get(rows,id):rows;}
  if(action==='respond') {
    const row=get(state.shifts,id);
    if(!published(row) || row.member_id!==me.id)fail(403,'Vous ne pouvez répondre qu’à vos créneaux publiés.');
    if(row.ends_at<=now())fail(409,'Ce créneau est déjà terminé.');
    if(!['confirmed','unavailable'].includes(body.response))fail(400,'Réponse invalide.');
    const message=text(body.message??'');if(body.response==='unavailable' && !message)fail(400,'Ajoutez un message pour le responsable.');
    row.response=body.response;row.response_message=message;row.responded_at=now();history(row,me,'response',body.response);return cleanShift(row,state,me);
  }
  requireManager(me);
  if(id==='publish') {
    if(!Array.isArray(body.ids) || !body.ids.length || body.ids.length>200 || new Set(body.ids).size!==body.ids.length)fail(400,'Choisissez entre 1 et 200 brouillons.');
    const rows=body.ids.map(id=>get(state.shifts,id));
    for(const row of rows) {if(!active(row) || row.publication!=='draft')fail(409,'La sélection a changé. Actualisez le planning.');validateShift({...row,publication:'published'},state,activities,row.id);}
    for(const row of rows){row.publication='published';row.response='pending';history(row,me,'publish');}return {published:rows.length};
  }
  if(id==='copy-week') {
    const from=mondayOf(validDay(body.week_start)),to=addDays(from,7);
    const selected=state.shifts.filter(row=>active(row) && dateKey(row.starts_at,timeZone)>=from && dateKey(row.starts_at,timeZone)<to && (!body.site_id || row.site_id===body.site_id));
    if(!selected.length || selected.length>200)fail(400,'Choisissez une semaine contenant entre 1 et 200 créneaux.');
    const created=[];
    for(const row of selected) {
      const data=validateShift({...row,publication:'draft',override_reason:'',starts_at:moveLocalDays(row.starts_at,7,timeZone),ends_at:moveLocalDays(row.ends_at,7,timeZone)},state,activities);
      const copy={id:uuid(),...data,response:'pending',created_at:now(),history:[]};history(copy,me,'copy','Depuis '+from);state.shifts.push(copy);created.push(copy);
    }
    return {created};
  }
  if(id) {
    const row=get(state.shifts,id);if(!active(row))fail(409,'Ce créneau est annulé.');
    if(method==='DELETE') {row.cancelled_at=now();row.cancelled_by=me.name;row.cancellation_reason=text(body.reason??'');history(row,me,'cancel',row.cancellation_reason);return {ok:true};}
    if(method!=='PATCH' || action)fail(405,'Action de planning invalide.');
    const data=validateShift({...row,...body},state,activities,row.id);
    const reset=['starts_at','ends_at','site_id','activity','member_id','publication'].some(key=>data[key]!==row[key]);
    Object.assign(row,data);if(reset){row.response='pending';delete row.response_message;delete row.responded_at;}
    history(row,me,'edit',reset?'Confirmation à renouveler':'');return cleanShift(row,state,me);
  }
  if(method!=='POST')fail(405,'Action de planning invalide.');
  const members=body.member_ids || [body.member_id],weeks=body.repeat_weeks??1;
  if(!Array.isArray(members) || !members.length || members.length>25 || new Set(members).size!==members.length || !Number.isInteger(weeks) || weeks<1 || weeks>8 || members.length*weeks>200)fail(400,'Vérifiez les personnes et la répétition (200 créneaux maximum).');
  const times=range(body,1),created=[];
  for(let week=0;week<weeks;week++)for(const member_id of members) {
    const data=validateShift({...body,member_id,starts_at:moveLocalDays(times.starts_at,week*7,timeZone),ends_at:moveLocalDays(times.ends_at,week*7,timeZone)},state,activities);
    const row={id:uuid(),...data,response:'pending',created_at:now(),history:[]};history(row,me,'create');state.shifts.push(row);created.push(row);
  }
  return created.length===1?created[0]:{created};
}
