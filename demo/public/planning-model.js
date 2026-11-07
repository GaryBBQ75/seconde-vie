const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function validDay(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Date invalide.');
  const date=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(+date) || date.toISOString().slice(0,10)!==value)fail('Date invalide.');return value;
}
export function addDays(day,count) {validDay(day);const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);}
export function mondayOf(day) {validDay(day);return addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));}
export function localParts(timestamp,timeZone='Europe/Paris') {
  const value=new Date(timestamp);if(!Number.isFinite(+value))fail('Horaire invalide.');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
  return Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}
export function localInput(timestamp,timeZone) {const p=localParts(timestamp,timeZone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function dateKey(timestamp,timeZone) {return localInput(timestamp,timeZone).slice(0,10);}
export function localToISO(value,timeZone='Europe/Paris') {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail('Indiquez une date et une heure.');
  validDay(value.slice(0,10));const [hour,minute]=value.slice(11).split(':').map(Number);
  if(hour>23 || minute>59)fail('Heure invalide.');
  const [year,month,day]=value.slice(0,10).split('-').map(Number),desired=Date.UTC(year,month-1,day,hour,minute);let candidate=desired;
  for(let i=0;i<5;i++) {
    const p=localParts(candidate,timeZone),shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute),delta=desired-shown;
    if(!delta)break;candidate+=delta;
  }
  if(localInput(candidate,timeZone)!==value)fail('Cette heure n’existe pas lors du changement d’heure. Choisissez un autre horaire.');
  if([-3600000,3600000].some(delta=>localInput(candidate+delta,timeZone)===value))fail('Cette heure est ambiguë lors du changement d’heure. Choisissez un horaire non ambigu.');
  return new Date(candidate).toISOString();
}
export function moveLocalDays(timestamp,days,timeZone) {const original=new Date(timestamp);if(!days)return original.toISOString();const input=localInput(timestamp,timeZone);return new Date(+new Date(localToISO(addDays(input.slice(0,10),days)+input.slice(10),timeZone))+original.getUTCSeconds()*1000+original.getUTCMilliseconds()).toISOString();}
export const overlap=(a,b)=>a.starts_at<b.ends_at && a.ends_at>b.starts_at;
export const published=row=>!row.cancelled_at && row.publication!=='draft';
export function exportCalendar(rows,{timeZone='Europe/Paris',name='Mon planning Seconde Vie'}={}) {
  const escape=value=>String(value??'').replaceAll('\\','\\\\').replaceAll('\r','').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');
  const utc=value=>new Date(value).toISOString().replaceAll(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const stamp=utc(new Date());
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Seconde Vie//Planning//FR','CALSCALE:GREGORIAN','X-WR-CALNAME:'+escape(name),'X-WR-TIMEZONE:'+escape(timeZone)];
  for(const row of rows.filter(row=>row.publication!=='draft'))lines.push('BEGIN:VEVENT','UID:'+escape(row.id)+'@seconde-vie','DTSTAMP:'+stamp,'LAST-MODIFIED:'+utc(row.updated_at || row.created_at || new Date()),'DTSTART:'+utc(row.starts_at),'DTEND:'+utc(row.ends_at),'SUMMARY:'+escape(row.activity+' · '+row.site_name),'LOCATION:'+escape(row.site_name),'DESCRIPTION:'+escape(row.note || ''),'STATUS:'+(row.cancelled_at?'CANCELLED':row.response==='confirmed'?'CONFIRMED':'TENTATIVE'),'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(line=>{let out='',length=0;for(const character of line){const size=new TextEncoder().encode(character).length;if(length+size>73){out+='\r\n ';length=1;}out+=character;length+=size;}return out;}).join('\r\n')+'\r\n';
}
