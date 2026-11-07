import { modules } from './modules.js';

export function setupWorkspace({root,api,onReady}) {
  root.innerHTML=`<main class="content sign-in core-setup"><img src="/mark.svg" width="48" height="48" alt=""><h1>Votre espace Seconde Vie</h1>
    <p>Recevez les dons, suivez le tri et retrouvez vos objets en stock. Ajoutez ensuite les outils utiles à votre ressourcerie.</p>
    <form id="core-setup" class="stack"><input type="hidden" name="type" value="ressourcerie"><label class="field">Nom de la ressourcerie<input name="name" maxlength="100" required placeholder="Le nom de votre ressourcerie ou recyclerie"></label>
    <label class="field">Premier site<input name="site_name" maxlength="100" required placeholder="Ex. Boutique et atelier"></label>
    <div class="form-row"><label class="field">Pays<select name="country"><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option><option value="GB">Royaume-Uni</option><option value="US">États-Unis</option><option value="CA">Canada</option><option value="AU">Australie</option><option value="NZ">Nouvelle-Zélande</option><option value="DE">Allemagne</option><option value="ES">Espagne</option><option value="IT">Italie</option><option value="JP">Japon</option></select></label>
    <label class="field">Devise<select name="currency">${['EUR','GBP','USD','CAD','AUD','NZD','CHF','JPY'].map(value=>`<option>${value}</option>`).join('')}</select></label></div>
    <div class="form-error" role="alert"></div><button class="btn primary" type="submit">Créer mon espace partagé</button></form>
    <a class="demo-link" href="/?demo=1">Explorer la démonstration avec des exemples</a></main>`;
  const form=root.querySelector('form'),country=form.elements.country;
  const defaults={FR:['EUR','fr-FR','Europe/Paris'],BE:['EUR','fr-FR','Europe/Brussels'],CH:['CHF','fr-FR','Europe/Zurich'],GB:['GBP','en-GB','Europe/London'],US:['USD','en-US','America/New_York'],CA:['CAD','fr-FR','America/Toronto'],AU:['AUD','en-GB','Australia/Sydney'],NZ:['NZD','en-GB','Pacific/Auckland'],DE:['EUR','de-DE','Europe/Berlin'],ES:['EUR','es-ES','Europe/Madrid'],IT:['EUR','it-IT','Europe/Rome'],JP:['JPY','en-GB','Asia/Tokyo']};
  country.addEventListener('change',()=>{form.elements.currency.value=defaults[country.value][0];});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try {const data=Object.fromEntries(new FormData(form));const [,locale,timeZone]=defaults[data.country];
      const value=await api('/workspaces',{method:'POST',body:{...data,locale,timeZone}});await onReady(value.id);
    } catch(error) {form.querySelector('.form-error').textContent=error.message;button.disabled=false;}
  });
}

export function corePages({api,esc,field,input,button,formEnd,formSubmit,showDialog,header,changed,config,me,option,date,notice}) {
  function download(value,name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function contactsPage(main) {
    main.innerHTML=header('Contacts','Une fiche commune pour les donateurs, clients, fournisseurs et partenaires.',button('Ajouter un contact','plus','contact-add','primary'))
      +'<label class="field">Rechercher<input id="contact-search" type="search" placeholder="Nom, e-mail ou téléphone"></label><div id="contact-list" class="cards"></div>';
    const rows=await api('/contacts'),list=main.querySelector('#contact-list');if(!list?.isConnected)return;
    function edit(row={}) {
      const types=['Donateur','Client','Fournisseur','Déposant','Partenaire'];
      showDialog(row.id?'Modifier le contact':'Ajouter un contact',`<form id="contact-form" class="stack">
        ${field('Nom',input('name',`required maxlength="120" value="${esc(row.name)}"`))}
        <fieldset><legend>Ce contact est…</legend><div class="form-row">${types.map(type=>`<label class="check"><input type="checkbox" name="types" value="${type}" ${row.types?.includes(type)?'checked':''}>${type}</label>`).join('')}</div></fieldset>
        <div class="form-row">${field('E-mail',input('email',`type="email" maxlength="254" value="${esc(row.email)}"`))}${field('Téléphone',input('phone',`type="tel" maxlength="50" value="${esc(row.phone)}"`))}</div>
        ${field('Adresse',`<textarea name="address" maxlength="500">${esc(row.address)}</textarea>`)}
        ${field('Note',`<textarea name="note" maxlength="1000">${esc(row.note)}</textarea>`)}${formEnd('Enregistrer')}</form>`);
      formSubmit('contact-form',async data=>{await api('/contacts'+(row.id?'/'+row.id:''),{method:row.id?'PATCH':'POST',body:{...Object.fromEntries(data),types:data.getAll('types')}});await changed('Contact enregistré.');});
    }
    function draw() {
      const q=main.querySelector('#contact-search').value.trim().toLocaleLowerCase();
      list.innerHTML=rows.filter(row=>[row.name,row.email,row.phone,...row.types].join(' ').toLocaleLowerCase().includes(q)).map(row=>`<article class="card"><div class="card-line"><h2>${esc(row.name)}</h2>${button('Modifier','users','contact-'+row.id)}</div><p>${row.types.map(type=>`<span class="pill">${esc(type)}</span>`).join(' ')}</p><p>${esc([row.email,row.phone].filter(Boolean).join(' · '))}</p><p>${esc(row.address)}</p></article>`).join('') || '<p class="surface empty">Aucun contact pour cette recherche.</p>';
      rows.forEach(row=>document.getElementById('contact-'+row.id)?.addEventListener('click',()=>edit(row)));
    }
    main.querySelector('#contact-add').addEventListener('click',()=>edit());
    main.querySelector('#contact-search').addEventListener('input',draw);draw();
  }

  function settingsPage(main) {
    main.innerHTML=header('Réglages de la ressourcerie','Adaptez la saisie et les outils aux besoins de votre équipe.')
      +`<form id="core-settings" class="surface stack"><h2>Votre structure</h2>${field('Nom',input('name',`required maxlength="100" value="${esc(me.org_name)}"`))}
      ${field('Pays (code à deux lettres)',input('country',`required pattern="[A-Z]{2}" maxlength="2" value="${esc(config.country)}"`))}
      <div class="form-row">${field('Devise',`<select name="currency">${['EUR','GBP','USD','CAD','AUD','NZD','CHF','JPY'].map(value=>option(value,value,config.currency)).join('')}</select>`)}
      ${field('Formats régionaux',`<select name="locale">${['fr-FR','en-GB','en-US','de-DE','es-ES','it-IT'].map(value=>option(value,value,config.locale)).join('')}</select>`)}</div>
      ${field('Fuseau horaire',input('timeZone',`required value="${esc(config.timeZone)}" list="timezones"`))}<datalist id="timezones">${['Europe/Paris','Europe/London','America/New_York','America/Toronto','Australia/Sydney','Pacific/Auckland','Asia/Tokyo'].map(value=>`<option value="${value}">`).join('')}</datalist>
      ${field('Provenances proposées (une par ligne)',`<textarea name="origins" required>${esc((config.origins || []).join('\n'))}</textarea>`)}
      <p class="help">La devise reste fixe dès que des prix sont enregistrés. L’interface actuelle est en français ; les formats de date et de montant suivent vos réglages.</p>
      <fieldset><legend>Informations visibles à la réception</legend><p class="help">Gardez une saisie courte. Les informations détaillées pourront être complétées plus tard.</p>
      ${Object.entries({price:'Prix de vente',photos:'Photos',reference:'Descriptif et caractéristiques',note:'Notes détaillées'}).map(([key,label])=>`<label class="check"><input type="checkbox" name="intake" value="${key}" ${config.intake?.[key]?'checked':''}> ${label}</label>`).join('')}</fieldset>
      <section class="notice"><h2>Toujours inclus</h2><p>Réception des dons et donateurs, tri, objets et lots, stock et emplacements, transferts, étiquettes, sorties, suivi des flux et des poids, équipe et droits.</p></section>
      <fieldset><legend>Outils en option pour votre ressourcerie</legend><p class="help">Activez ce qui vous sert. Les outils partagent les mêmes fiches. Désactiver un outil conserve ses données et son historique.</p>
      <div class="module-grid">${Object.entries(modules).map(([key,value])=>`<div><label class="check"><input type="checkbox" name="modules" value="${key}" ${config.modules?.includes(key)?'checked':''}> ${value.label}</label><p class="help">${value.description}</p></div>`).join('')}</div></fieldset>
      ${formEnd('Enregistrer les réglages')}</form>
      <section class="surface stack"><h2>Sauvegarde et restauration</h2><p>Exportez vos fiches, mouvements, contacts et réglages. Les photos restent hébergées dans votre espace. Les comptes et leurs droits sont conservés lors d’une restauration.</p>
      <div class="page-actions">${button('Exporter une sauvegarde','download','core-backup')}${button('Restaurer une sauvegarde','upload','core-restore')}${button('Versions avant restauration','book','core-snapshots')}</div><div id="core-snapshots-list"></div>
      <input type="file" id="core-restore-file" accept="application/json,.json" hidden><div id="core-backup-status" role="status"></div></section>
      <section class="surface stack"><h2>Historique de l’espace</h2>${button('Afficher les dernières opérations','book','core-audit')}<div id="core-audit-list"></div></section>`;
    formSubmit('core-settings',async data=>{
      await api('/settings',{method:'PATCH',body:{...Object.fromEntries(data),origins:data.get('origins').split('\n').map(value=>value.trim()).filter(Boolean),modules:data.getAll('modules'),intake:Object.fromEntries(['price','photos','reference','note'].map(key=>[key,data.getAll('intake').includes(key)]))}});
      await changed('Réglages enregistrés.');
    });
    main.querySelector('#core-backup').addEventListener('click',async()=>{
      try {download(await api('/backup'),'seconde-vie-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json');notice('Sauvegarde exportée.');}
      catch(error){main.querySelector('#core-backup-status').textContent=error.message;}
    });
    const fileInput=main.querySelector('#core-restore-file');
    function confirmRestore(backup) {
      showDialog('Restaurer cette sauvegarde',`<form id="restore-confirm" class="stack"><p>La sauvegarde du ${esc(date(backup.created_at))} contient ${backup.state.stock?.length || 0} fiches et ${backup.state.contacts?.length || 0} contacts. Elle remplacera les données métier actuelles. Une copie de l’état actuel sera conservée sur le serveur.</p>
        ${field('Recopiez le nom de la structure pour confirmer',input('confirm',`required autocomplete="off" placeholder="${esc(me.org_name)}"`))}${formEnd('Restaurer les données')}</form>`);
      formSubmit('restore-confirm',async data=>{await api('/restore',{method:'POST',body:{confirm:data.get('confirm'),backup}});await changed('Sauvegarde restaurée.');});
    }
    main.querySelector('#core-snapshots').addEventListener('click',async()=>{
      try {
        const rows=await api('/snapshots'),area=main.querySelector('#core-snapshots-list');
        area.innerHTML=rows.length ? rows.map(row=>`<p>${esc(date(row.created_at))} · version ${row.revision} ${button('Restaurer cette version','book','snapshot-'+row.id)}</p>`).join('') : '<p>Aucune restauration précédente.</p>';
        for(const row of rows)main.querySelector('#snapshot-'+row.id).addEventListener('click',async()=>{
          try {confirmRestore(await api('/snapshots/'+row.id));} catch(error){main.querySelector('#core-backup-status').textContent=error.message;}
        });
      }catch(error){main.querySelector('#core-backup-status').textContent=error.message;}
    });
    main.querySelector('#core-restore').addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files[0];fileInput.value='';if(!file)return;
      try {
        if(file.size>12000000)throw new Error('Fichier de 12 Mo maximum.');
        const backup=JSON.parse(await file.text());
        if(backup.format!=='seconde-vie-core' || backup.workspace_id!==me.org)throw new Error('Choisissez une sauvegarde de cet espace.');
        confirmRestore(backup);
      } catch(error){main.querySelector('#core-backup-status').textContent=error.message;}
    });
    main.querySelector('#core-audit').addEventListener('click',async()=>{
      const labels={stock:'Fiches objets',contacts:'Contacts',sites:'Sites et zones',team:'Équipe',settings:'Réglages',restore:'Restauration',transfers:'Transfert',sales:'Vente','cash-station':'Relais en caisse',shifts:'Planning',tours:'Tournée'};
      try {const rows=await api('/audit');main.querySelector('#core-audit-list').innerHTML=rows.length ? `<ul class="log">${rows.map(row=>`<li>${esc(labels[row.action.split('/')[1]] || 'Mise à jour')}<span>${esc(row.actor)} · ${esc(date(row.created_at))}</span></li>`).join('')}</ul>` : '<p>Aucune modification enregistrée.</p>';}
      catch(error){main.querySelector('#core-audit-list').textContent=error.message;}
    });
  }
  return {contactsPage,settingsPage};
}
