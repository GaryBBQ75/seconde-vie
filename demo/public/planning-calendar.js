import {dateKey,mondayOf,localInput} from './planning-model.js';
import {calendarRange,placementConflict,persistGesture} from './planning-gestures.js';

let vendorPromise,stylePromise;
function loadStyles() {
  if(!stylePromise)stylePromise=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/vendor/planning-calendar.css';link.addEventListener('load',resolve,{once:true});link.addEventListener('error',()=>{stylePromise=null;reject(new Error('Le calendrier ne peut pas être chargé. La vue Liste reste disponible.'));},{once:true});document.head.append(link);});
  return stylePromise;
}
export async function mountInteractiveCalendar(host,{data,rows,week,zone,sites,siteFilter,activities,preferences,esc,roleNames,api,onOpen,onCreate,onSaved,onPreference,onNavigate,notice}) {
  vendorPromise??=import('./vendor/planning-calendar.js').catch(error=>{vendorPromise=null;throw error;});
  const [vendor]=await Promise.all([vendorPromise,loadStyles()]);if(!host.isConnected)return ()=>{};
  const {Calendar,Draggable,interactionPlugin,timeGridPlugin,monarchPlugin,frLocale}=vendor;
  let disposed=false,saving=false,interacting=false,dragMember='',selected=data.people.some(member=>member.id===preferences.member)?preferences.member:'',activity=activities.includes(preferences.activity)?preferences.activity:activities[0],duration=[60,120,180,240,480].includes(preferences.duration)?preferences.duration:180;
  let targetSite=siteFilter || (sites.some(site=>site.id===preferences.site)?preferences.site:sites[0]?.id),query='';
  const mobile=matchMedia('(max-width:760px)').matches;
  const preferredView=mobile?preferences.mobileCalendarView:preferences.calendarView;
  const initialView=['timeGridWeek','timeGridDay'].includes(preferredView)?preferredView:mobile?'timeGridDay':'timeGridWeek';
  const today=dateKey(Date.now(),zone);
  let focus=preferences.focus && mondayOf(preferences.focus)===week?preferences.focus:mondayOf(today)===week?today:week;
  host.innerHTML=`<div class="plan-interactive-layout ${data.manager?'has-roster':''}">${data.manager?`<details class="plan-roster" ${mobile?'':'open'}><summary>Affecter une personne</summary><div class="plan-roster-content"><div class="plan-roster-title"><span class="eyebrow">Affectation rapide</span><h2>L’équipe</h2><p>Glissez un nom sur une heure, ou sélectionnez-le puis touchez un créneau.</p></div><label class="field">Site à affecter<select id="drag-site" ${siteFilter?'disabled':''}>${sites.map(site=>`<option value="${site.id}" ${site.id===targetSite?'selected':''}>${esc(site.name)}</option>`).join('')}</select></label><label class="field">Poste à affecter<select id="drag-activity">${activities.map(value=>`<option ${value===activity?'selected':''}>${esc(value)}</option>`).join('')}</select></label><label class="field">Durée proposée<select id="drag-duration">${[60,120,180,240,480].map(value=>`<option value="${value}" ${duration===value?'selected':''}>${value/60} h</option>`).join('')}</select></label><label class="field">Rechercher une personne<input id="drag-search" type="search" placeholder="Prénom ou fonction"></label><div id="drag-people" class="plan-drag-people"></div><button type="button" id="drag-add" class="btn">Ajouter avec le formulaire</button><p class="help">Les nouvelles affectations sont créées en brouillon.</p></div></details>`:''}<section class="plan-calendar-panel"><div id="drag-feedback" role="status" class="plan-drag-feedback">${data.manager?'Glissez les affectations pour les déplacer. Tirez leur bord pour modifier la durée.':'Votre agenda publié. Touchez une affectation pour voir les détails.'}</div><div id="interactive-calendar" class="plan-calendar"></div></section></div>`;
  const root=host.querySelector('.plan-interactive-layout'),canvas=host.querySelector('#interactive-calendar'),roster=host.querySelector('#drag-people'),feedback=host.querySelector('#drag-feedback');
  const main=host.closest('main') || host;
  const savePreferences=()=>onPreference({member:selected,activity,duration,site:targetSite});
  function busy() {if(main.isConnected)main.dataset.planningBusy=saving || interacting?'1':'0';root.classList.toggle('is-saving',saving);root.setAttribute('aria-busy',String(saving));}
  function message(value,error=false) {if(disposed)return;feedback.textContent=value;feedback.classList.toggle('is-error',error);}
  function errorMessage(value) {message(value,true);notice(value);}
  const colors=['#527b43','#a17c28','#8363a5','#4b77a8','#bf7345','#3d8b86'];
  function calendarEvents() {
    return rows.filter(row=>!row.cancelled_at).map(row=>({id:row.id,title:row.member_name+' · '+row.activity,start:row.starts_at,end:row.ends_at,allDay:false,editable:data.manager && !row.member_inactive,backgroundColor:colors[Math.max(0,activities.indexOf(row.activity))%colors.length],borderColor:colors[Math.max(0,activities.indexOf(row.activity))%colors.length],classNames:[row.publication==='draft'?'is-draft':'is-published',row.response==='unavailable' || row.has_unavailability?'has-warning':''],extendedProps:{shift:row}}));
  }
  function conflicts(member,start,end,id) {
    try{return placementConflict(data,{member_id:member,id,...calendarRange(start,end,duration)});}catch(error){return error.message;}
  }
  async function saved(label) {try{await onSaved(label);}catch(error){notice(error.message);}}
  async function createAt(start,end,member=selected) {
    if(saving || disposed)return;
    let range;try{range=calendarRange(start,end,duration);}catch(error){return errorMessage(error.message);}
    if(!member){onCreate({...range,day:dateKey(range.starts_at,zone),member:'',site:targetSite,activity});return;}
    const invalid=conflicts(member,range.starts_at,range.ends_at);if(invalid)return errorMessage(invalid);
    saving=true;busy();message('Enregistrement de l’affectation…');
    const result=await persistGesture({save:()=>api('/shifts',{method:'POST',body:{...range,member_id:member,site_id:targetSite,activity,publication:'draft'}}),onError:errorMessage});
    saving=false;busy();if(result.ok)await saved('Affectation créée en brouillon.');
  }
  async function change(info,label) {
    if(saving || disposed){info.revert();return;}
    const row=info.event.extendedProps.shift;
    let range;try{range=calendarRange(info.event.start,info.event.end);}catch(error){info.revert();return errorMessage(error.message);}
    const invalid=conflicts(row.member_id,range.starts_at,range.ends_at,row.id);if(invalid){info.revert();return errorMessage(invalid);}
    saving=true;busy();message('Enregistrement de la modification…');
    const result=await persistGesture({save:()=>api('/shifts/'+row.id,{method:'PATCH',body:{...range,override_reason:''}}),revert:()=>{if(!disposed)info.revert();},onError:errorMessage});
    saving=false;busy();if(result.ok)await saved(label);
  }
  const calendar=new Calendar(canvas,{
    plugins:[monarchPlugin,timeGridPlugin,interactionPlugin],locale:frLocale,timeZone:zone,initialView,initialDate:focus,
    headerToolbar:{left:'prev,next today',center:'title',right:'timeGridWeek,timeGridDay'},buttonText:{today:'Aujourd’hui',week:'Semaine',day:'Jour'},firstDay:1,
    height:680,allDaySlot:false,slotMinTime:'06:00:00',slotMaxTime:'23:00:00',slotDuration:'00:30:00',snapDuration:'00:15:00',scrollTime:'08:00:00',scrollTimeReset:false,
    nowIndicator:true,dayMaxEvents:false,expandRows:true,eventMinHeight:34,eventShortHeight:45,eventDisplay:'block',eventOverlap:true,
    editable:data.manager,eventResizableFromStart:true,droppable:data.manager,selectable:data.manager,selectMinDistance:7,dragScroll:true,eventDragMinDistance:6,eventLongPressDelay:300,selectLongPressDelay:350,
    events:calendarEvents(),
    eventContent(info) {
      const row=info.event.extendedProps.shift;if(!row)return;
      const element=document.createElement('div');element.className='plan-calendar-event';
      for(const [tag,text,className] of [['span',info.timeText,'plan-calendar-time'],['strong',row.member_name,''],['span',row.activity,''],['small',row.site_name,'']]){const node=document.createElement(tag);node.textContent=text;node.className=className;element.append(node);}
      const status=document.createElement('small');status.className='plan-calendar-state';status.textContent=row.publication==='draft'?'Brouillon':row.response==='confirmed'?'Confirmé':row.response==='unavailable'?'Empêchement':'À confirmer';element.append(status);return {domNodes:[element]};
    },
    eventDidMount(info) {const row=info.event.extendedProps.shift;if(!row)return;const label=row.member_name+' · '+row.activity+' · '+localInput(row.starts_at,zone).replace('T',' ')+' → '+localInput(row.ends_at,zone).replace('T',' ');info.el.classList.add('plan-calendar-slot');info.el.classList.toggle('is-draft',row.publication==='draft');info.el.classList.toggle('has-warning',row.response==='unavailable' || row.has_unavailability);info.el.style.setProperty('--fc-event-color',colors[Math.max(0,activities.indexOf(row.activity))%colors.length]);info.el.style.setProperty('--fc-event-contrast-color','#fff');if(data.manager){info.el.querySelector('.fc-x7')?.classList.add('plan-resize-end');info.el.querySelector('.fc-lW')?.classList.add('plan-resize-start');}info.el.setAttribute('aria-label',label);info.el.title=label;info.el.dataset.shiftId=row.id;info.el.tabIndex=0;info.el.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();onOpen(row.id);}});},
    eventClick(info){info.jsEvent.preventDefault();if(!saving)onOpen(info.event.id);},
    eventDragStart(){interacting=true;busy();},eventDragStop(){interacting=false;busy();},eventResizeStart(){interacting=true;busy();},eventResizeStop(){interacting=false;busy();},
    eventDrop:info=>change(info,'Créneau déplacé. Une nouvelle confirmation est demandée si nécessaire.'),eventResize:info=>change(info,'Durée modifiée. Une nouvelle confirmation est demandée si nécessaire.'),
    eventAllow(dropInfo,event){if(saving)return false;const row=event?.extendedProps.shift,member=row?.member_id || dragMember || selected;if(!member)return true;const reason=conflicts(member,dropInfo.start,dropInfo.end,row?.id);message(reason || 'Déposez pour enregistrer l’affectation.',Boolean(reason));return !reason;},
    drop(info){if(data.manager){const member=info.draggedEl?.dataset.memberId || dragMember;if(member)createAt(info.date,null,member);}},
    dateClick(info){if(data.manager)createAt(info.date);},
    select(info){if(data.manager){calendar.unselect();createAt(info.start,info.end);}},
    datesSet(info){const currentFocus=dateKey(info.view.calendar.getDate(),zone),view=info.view.type;focus=currentFocus;queueMicrotask(()=>{if(!disposed && host.isConnected)onNavigate({focus:currentFocus,[mobile?'mobileCalendarView':'calendarView']:view,week:mondayOf(currentFocus)});});},
  });
  calendar.render();
  let background;
  function availabilityBackground() {
    background?.remove();
    if(selected)background=calendar.addEventSource(data.availability.filter(row=>row.member_id===selected && row.kind==='unavailable').map(row=>({id:'availability-'+row.id,start:row.starts_at,end:row.ends_at,display:'background',backgroundColor:'#f7b6a5',overlap:true,editable:false})));
  }
  function renderPeople() {
    if(!roster)return;const q=query.trim().toLocaleLowerCase();
    const people=data.people.filter(person=>[person.name,...person.roles.map(role=>roleNames[role]||role)].join(' ').toLocaleLowerCase().includes(q));
    roster.innerHTML=people.map(person=>`<button type="button" class="plan-drag-person ${person.id===selected?'selected':''}" data-member-id="${person.id}" aria-pressed="${person.id===selected}" aria-label="Affecter ${esc(person.name)}"><span class="plan-drag-avatar">${esc(person.name.split(/\s+/).map(value=>value[0]).slice(0,2).join(''))}</span><span><strong>${esc(person.name)}</strong><small>${esc(person.roles.map(role=>roleNames[role]).join(' · '))}</small></span><span class="plan-drag-handle" aria-hidden="true">⠿</span></button>`).join('') || '<p class="help">Aucune personne pour cette recherche.</p>';
    roster.querySelectorAll('[data-member-id]').forEach(element=>element.addEventListener('click',()=>{if(saving)return;selected=selected===element.dataset.memberId?'':element.dataset.memberId;savePreferences();renderPeople();availabilityBackground();message(selected?'Personne sélectionnée : touchez une heure ou glissez son nom. Ses indisponibilités sont colorées en rouge.':'Sélectionnez une personne ou glissez son nom sur le calendrier.');}));
  }
  renderPeople();availabilityBackground();
  let draggable;
  if(data.manager) {
    draggable=new Draggable(roster,{itemSelector:'[data-member-id]',longPressDelay:300,minDistance:6,eventData(element){dragMember=element.dataset.memberId;const member=data.people.find(row=>row.id===dragMember);return {title:member?.name || '',duration:{minutes:duration},create:false,extendedProps:{member_id:dragMember}};}});
    host.querySelector('#drag-search').addEventListener('input',event=>{query=event.target.value;renderPeople();});
    host.querySelector('#drag-activity').addEventListener('change',event=>{activity=event.target.value;savePreferences();});
    host.querySelector('#drag-duration').addEventListener('change',event=>{duration=Number(event.target.value);savePreferences();});
    host.querySelector('#drag-site').addEventListener('change',event=>{targetSite=event.target.value;savePreferences();});
    host.querySelector('#drag-add').addEventListener('click',()=>{if(!saving)onCreate({day:focus,member:selected,site:targetSite,activity});});
    roster.addEventListener('pointerdown',()=>{interacting=true;busy();},{passive:true});
  }
  const release=()=>setTimeout(()=>{interacting=false;dragMember='';busy();},100);
  document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);
  return ()=>{disposed=true;draggable?.destroy();calendar.destroy();document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);delete main.dataset.planningBusy;};
}
