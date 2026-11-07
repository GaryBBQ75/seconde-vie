import {overlap} from './planning-model.js';

export function calendarRange(start,end,minutes=180) {
  const from=new Date(start),to=end?new Date(end):new Date(+from+minutes*60000);
  if(!Number.isFinite(+from) || !Number.isFinite(+to) || to<=from || to-from>86400000)throw new Error('Choisissez une plage horaire de 24 heures maximum.');
  return {starts_at:from.toISOString(),ends_at:to.toISOString()};
}
export function placementConflict(data,proposal) {
  if(!data.people.some(member=>member.id===proposal.member_id))return 'Choisissez une personne active.';
  if(data.shifts.some(row=>!row.cancelled_at && row.id!==proposal.id && row.member_id===proposal.member_id && overlap(row,proposal)))return 'Cette personne est déjà affectée sur cette plage, y compris sur un autre site.';
  if(data.availability.some(row=>!row.cancelled_at && row.kind==='unavailable' && row.member_id===proposal.member_id && overlap(row,proposal)))return 'Cette personne est indisponible. Ouvrez le formulaire pour justifier une dérogation.';
  return '';
}
export async function persistGesture({save,revert,onError}) {
  try{return {ok:true,value:await save()};}
  catch(error){revert?.();onError?.(error.message);return {ok:false};}
}
