import { demoRequest } from './demo-api.js';

export const demoMode=new URL(location.href).searchParams.get('demo') === '1';
let workspace=sessionStorage.getItem('seconde-vie-workspace') || '';
let revision=0;
const versions=new Map();
const pending=new Map();
export const currentRevision=()=>revision;
export function selectWorkspace(id) {
  workspace=id;revision=0;versions.clear();
  sessionStorage.setItem('seconde-vie-workspace',id);
  sessionStorage.removeItem('seconde-vie-station');
}
export function leaveStation() {sessionStorage.removeItem('seconde-vie-station');}
export function isModuleEnabled(config,key) {return !Array.isArray(config?.modules) || config.modules.includes(key);}
function cache(route,value) {
  if(route==='/snapshot') {
    for(const type of ['stock','team','sites','transfers','contacts','shifts']) for(const row of value[type] || []) versions.set(type+'/'+row.id,row._version);
  } else if(route==='/planning') {
    for(const type of ['shifts','availability'])for(const row of value[type] || [])versions.set(type+'/'+row.id,row._version);
  } else {
    const type=route.split('/')[1]?.split('?')[0];
    for(const row of Array.isArray(value) ? value : [value]) if(row?.id) versions.set(type+'/'+row.id,row._version);
  }
}
export async function api(route,{method='GET',body}={}) {
  if(demoMode) return demoRequest(route,{method,body});
  if(route==='/logout') {leaveStation();return {ok:true};}
  const headers={'X-Seconde-Vie':'core','X-Seconde-Vie-Workspace':workspace};
  const station=JSON.parse(sessionStorage.getItem('seconde-vie-station') || 'null');
  if(station) {headers['X-Seconde-Vie-Cashier']=station.member;headers['X-Seconde-Vie-Station']=station.site_id;}
  let pendingKey;
  if(method!=='GET') {
    body ??= {};
    headers['Content-Type']='application/json';headers['If-Match']=String(revision);
    headers['X-Seconde-Vie-Request']=typeof crypto.randomUUID==='function' ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    const key=route.split('/').slice(1,3).join('/');
    if(versions.has(key)) body={...body,expected_version:versions.get(key)};
    const signature=workspace+'|'+method+'|'+route+'|'+JSON.stringify(body);
    if(crypto.subtle) {
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
      pendingKey='seconde-vie-request-'+Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
      const saved=sessionStorage.getItem(pendingKey);
      if(saved)headers['X-Seconde-Vie-Request']=saved;
      else sessionStorage.setItem(pendingKey,headers['X-Seconde-Vie-Request']);
    } else {
      pendingKey=signature;
      if(pending.has(signature))headers['X-Seconde-Vie-Request']=pending.get(signature);
      else pending.set(signature,headers['X-Seconde-Vie-Request']);
    }
  }
  window.dispatchEvent(new CustomEvent('core-sync',{detail:{status:'loading'}}));
  let response;
  try {response=await fetch('/api/core'+route,{method,headers,body:body===undefined ? undefined : JSON.stringify(body)});}
  catch {window.dispatchEvent(new CustomEvent('core-sync',{detail:{status:'offline'}}));throw new Error('Connexion interrompue. Votre saisie reste sur ce poste ; réessayez lorsque le réseau revient.');}
  let value;
  try {value=await response.json();} catch {throw new Error('Réponse illisible. Rechargez la page.');}
  if(pendingKey && response.status<500) {pending.delete(pendingKey);if(crypto.subtle)sessionStorage.removeItem(pendingKey);}
  if(!response.ok) {
    window.dispatchEvent(new CustomEvent('core-sync',{detail:{status:response.status===409 ? 'conflict' : 'error'}}));
    throw Object.assign(new Error(value.error || 'Opération indisponible.'),{status:response.status});
  }
  const received=Number(response.headers.get('X-Seconde-Vie-Revision'));
  if(received && (route==='/snapshot' || method!=='GET')) revision=Math.max(revision,received);
  cache(route,value);
  if(route==='/cash-station') sessionStorage.setItem('seconde-vie-station',JSON.stringify({member:value.id,site_id:value.cash_station.site_id}));
  window.dispatchEvent(new CustomEvent('core-sync',{detail:{status:'synced'}}));
  return value;
}
