import { icon } from './icons.js';

const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toastArea = document.querySelector('#toast');
const pageNames = { accueil: 'Aujourd’hui', stock: 'Stock', controle: 'À vérifier', transferts: 'Transferts', planning: 'Planning', equipe: 'Équipe', sites: 'Sites et zones' };
const statusNames = { tri: 'À trier', controle: 'À vérifier', pret: 'Prêt', transit: 'En transit', sorti: 'Sorti' };
const exitNames = { vente: 'Vendu', don: 'Donné', recyclage: 'Recyclage', reparti: 'Lot réparti' };
const roleNames = { admin: 'Responsable', reception: 'Réception', tri: 'Tri', atelier: 'Atelier', stock: 'Stock', vente: 'Vente' };
const categoryIcons = { Livres: ['book','violet'], Textile: ['shirt','blue'], Vaisselle: ['cup','rose'], 'Maison et déco': ['lamp','amber'], 'Jeux et jouets': ['game','violet'], Électrique: ['wrench','amber'], Mobilier: ['chair','rose'], 'Sport et loisirs': ['game','blue'] };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
let config, me, sites = [], stock = [], transfers = [], shifts = [], team = [];
let page = 'accueil', filter = '', search = '', siteFilter = localStorage.getItem('secondevie-site') || '';
let lastCategory = localStorage.getItem('secondevie-category') || '';
let stopCamera;
const admin = () => me?.roles.includes('admin');
const allowed = (...roles) => admin() || roles.some(r => me?.roles.includes(r));
const getSite = id => sites.find(site => site.id === id);
const workingSite = () => getSite(siteFilter) || sites.find(site => /réception/i.test(site.kind)) || sites[0];
const siteRows = () => stock.filter(row => !siteFilter || row.site_id === siteFilter);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, { method, headers: body === undefined ? {} : { 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'La demande a échoué.'), { status: res.status });
  return data;
}

const brand = () => '<div class="brand"><img src="/mark.svg" alt=""><div><strong>seconde vie</strong><span>Atelier de réemploi</span></div></div>';
function button(label, symbol, id, tone = '', attr = '') {
  return `<button type="button" class="btn ${tone}" id="${id}" ${attr}>${symbol ? icon(symbol, 16) : ''}${esc(label)}</button>`;
}
function notice(message) {
  const p = document.createElement('div');
  p.className = 'toast-entry';
  p.textContent = message;
  toastArea.append(p);
  setTimeout(() => p.remove(), 4500);
}
function report(error) {
  const p = document.createElement('div');
  p.className = 'toast-entry error';
  p.textContent = error.message;
  toastArea.append(p);
  setTimeout(() => p.remove(), 7000);
}
function on(id, fn, event = 'click') {
  document.getElementById(id)?.addEventListener(event, e => Promise.resolve().then(() => fn(e)).catch(report));
}
function tile(symbol, color = '') {
  return `<span class="tile ${color}">${icon(symbol,18)}</span>`;
}
function status(row) {
  return `<span class="pill ${row.state}">${esc(row.state === 'sorti' ? exitNames[row.exit_type] || 'Sorti' : statusNames[row.state])}</span>`;
}
function field(label, input) {
  return `<label class="field">${esc(label)}${input}</label>`;
}
function input(name, extra = '') { return `<input name="${name}" ${extra}>`; }
function option(value, label, selected) { return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`; }
function zones(site, selected, label = 'Sans zone précise') {
  return option('', label, selected) + (getSite(site)?.zones || []).map(z => option(z.id, z.name, selected)).join('');
}
function measure(row) {
  const parts = [];
  if (row.quantity != null) parts.push(row.quantity + (row.quantity > 1 ? ' pièces' : ' pièce'));
  if (row.grams != null) parts.push(decimal.format(row.grams / 1000) + ' kg');
  return parts.join(' · ');
}
function date(value) { return dateFmt.format(new Date(value)); }

function showDialog(title, html) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" id="close-dialog" type="button" aria-label="Fermer">${icon('close')}</button></div><div class="dialog-body">${html}</div>`;
  dialog.showModal();
  on('close-dialog', () => dialog.close());
}
dialog.addEventListener('close', () => { stopCamera?.(); stopCamera = null; });

function formSubmit(id, fn) {
  document.getElementById(id).addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = event.submitter || form.querySelector('button[type=submit]');
    const error = form.querySelector('.form-error');
    error.textContent = '';
    if (submit) submit.disabled = true;
    try { await fn(new FormData(form), form); }
    catch (e) { error.textContent = e.message; }
    finally { if (submit) submit.disabled = false; }
  });
}
const formEnd = (label) => `<div class="form-error" role="alert"></div><div class="dialog-actions"><button class="btn primary" type="submit">${esc(label)}</button></div>`;

function login() {
  root.innerHTML = `<main class="login"><section class="login-side">${brand()}<div><div class="eyebrow" style="color:#c9df9c">Suivi des objets et des lots</div><h1>Du don à la prochaine vie.</h1><p>Un espace pour réceptionner, orienter et retrouver ce qui passe entre vos mains.</p></div></section><section class="login-main"><div class="login-card"><h2>Ouvrir mon espace</h2>
    <form id="login-form">${field('Adresse e-mail', input('email', 'type="email" autocomplete="username" required'))}${field('Mot de passe', input('password','type="password" autocomplete="current-password" required'))}<div class="form-error" role="alert"></div><button class="btn primary" type="submit">Se connecter ${icon('arrow', 16)}</button>${config.demo ? button('Entrer dans la démo', 'dashboard','try-demo') : ''}</form></div></section></main>`;
  const connect = async (email, password) => {
    await api('/login',{ method:'POST',body:{ email,password } });
    await startWorkspace();
  };
  formSubmit('login-form', d => connect(d.get('email'), d.get('password')));
  on('try-demo', () => connect('demo@seconde-vie.test', 'demo-seconde-vie'));
}

async function refresh() {
  [sites, stock, transfers, shifts, team] = await Promise.all([
    api('/sites'), api('/stock'), api('/transfers'), api('/shifts'), admin() ? api('/team') : Promise.resolve([]),
  ]);
  if (siteFilter && !getSite(siteFilter)) siteFilter = '';
}
async function startWorkspace() {
  me = await api('/me');
  await refresh();
  go(location.hash.slice(1) || 'accueil', true);
}
async function changed(message, { close = true } = {}) {
  if (close && dialog.open) dialog.close();
  await refresh();
  render();
  notice(message);
}
function go(target, replace = false, nextFilter = '') {
  if (!pageNames[target] || (!admin() && target === 'equipe')) target = 'accueil';
  page = target;
  filter = nextFilter;
  search = '';
  if (location.hash !== '#' + target) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + target);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (me) go(location.hash.slice(1), true); });

const nav = (pages) => pages.map(([key, sym]) => `<a href="#${key}" class="navlink ${page === key ? 'active' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(sym,17)}${pageNames[key]}</a>`).join('');
function render() {
  if (!me) return login();
  const initials = me.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  root.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Navigation principale">
    ${brand()}<nav class="navgroup"><div class="navtitle">Au quotidien</div>${nav([['accueil','dashboard'],['stock','box'],['controle','wrench'],['transferts','truck']])}</nav>
    <nav class="navgroup"><div class="navtitle">Organisation</div>${nav([['planning','calendar'], ...(admin() ? [['equipe','users']] : []), ['sites','pin']])}</nav>
    <div class="profile"><span class="avatar">${esc(initials)}</span><div><strong>${esc(me.name)}</strong><small>${esc(me.roles.map(r => roleNames[r]).join(' · '))}</small></div><button type="button" id="logout" aria-label="Se déconnecter">${icon('logout',17)}</button></div></aside>
    <div class="workspace"><header class="topbar"><button type="button" id="menu" class="icon-button mobile-menu" aria-label="Menu" aria-expanded="false">${icon('menu')}</button><div class="breadcrumb"><span class="org">${esc(me.org_name)}</span><span class="org">${icon('chevron',12)}</span><strong>${pageNames[page]}</strong></div><div class="topright"><select id="current-site" class="site-switch" aria-label="Filtrer par site">${option('', 'Tous les sites', siteFilter)}${sites.map(s => option(s.id,s.name,siteFilter)).join('')}</select></div></header>
    <main class="content" id="main"></main></div></div>`;
  document.querySelectorAll('[data-page]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.page); }));
  on('menu', e => {
    const isOpen = document.querySelector('#sidebar').classList.toggle('open');
    document.getElementById('menu').setAttribute('aria-expanded', String(isOpen));
  });
  on('logout', async () => { await api('/logout',{ method:'POST' }); me = null; login(); });
  on('current-site', e => { siteFilter = e.target.value; localStorage.setItem('secondevie-site',siteFilter); render(); }, 'change');
  const main = document.querySelector('#main');
  if (page === 'accueil') home(main);
  if (page === 'stock' || page === 'controle') inventory(main);
  if (page === 'transferts') transferPage(main);
  if (page === 'planning') planningPage(main);
  if (page === 'equipe') teamPage(main);
  if (page === 'sites') sitePage(main);
}

function home(main) {
  const rows = siteRows();
  const count = state => rows.filter(r => r.state === state).length;
  const actions = [
    ...(allowed('reception','tri') ? [['receive','Enregistrer un don','Lots, cartons ou objets','quick-receive']] : []),
    ['scan','Scanner une étiquette','Retrouver une fiche','quick-scan'],
    ['wrench','Voir les objets à vérifier','Reprendre un contrôle','quick-control'],
  ];
  main.innerHTML = `<section class="hero"><div><div class="eyebrow">${esc(today.format(new Date()))}</div><h1>Bonjour, ${esc(me.name.split(' ')[0])}.</h1><p>Voici ce qui se passe à l’atelier aujourd’hui.</p></div><span class="hero-status"><i class="dot"></i>${config.demo ? 'Espace de démonstration' : 'Espace de travail'}</span></section>
    <section><div class="section-head"><h2>Actions rapides</h2></div><div class="quick">${actions.map(([sym,title,sub,key]) => `<button id="${key}" class="quick-button ${key === 'quick-receive' ? 'primary' : ''}" type="button">${tile(sym)}<span><strong>${title}</strong><small>${sub}</small></span>${icon('arrow',16)}</button>`).join('')}</div></section>
    <section><div class="section-head"><h2>Le stock en un coup d’œil</h2></div><div class="metrics">${[['tri','À trier','sort','violet'],['controle','À vérifier','wrench','amber'],['pret','Prêts à sortir','check',''],['transit','En transit','truck','blue']].map(([state,label,sym,color]) => `<button type="button" class="metric" data-metric="${state}"><span class="metric-top">${tile(sym,color)}${label}</span><strong>${count(state)}</strong></button>`).join('')}</div></section>
    <section><div class="section-head"><h2>Dernières entrées</h2>${button('Voir le stock','arrow','all-stock','ghost')}</div>${table(rows.slice(0,6))}</section>`;
  on('quick-receive', () => receive());
  on('quick-scan', () => scan());
  on('quick-control', () => go('controle'));
  on('all-stock', () => go('stock'));
  document.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => go(b.dataset.metric === 'controle' ? 'controle' : 'stock', false, b.dataset.metric)));
  bindStock(main);
}

function header(title, sub, actions = '') {
  return `<header class="page-head"><div><div class="eyebrow">Espace de travail</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="tabs">${actions}</div></header>`;
}
function table(rows) {
  if (!rows.length) return '<div class="surface empty">Aucun objet ou lot ici pour le moment.</div>';
  return `<div class="surface table-scroll"><table><thead><tr><th>Objet ou lot</th><th>Site / zone</th><th>État</th><th>Quantité</th><th>Prix</th></tr></thead><tbody>${rows.map(row => {
    const [sym,color] = categoryIcons[row.category] || ['box',''];
    return `<tr><td><div class="item-title">${tile(sym,color)}<div><button type="button" data-stock="${row.id}">${esc(row.title)}</button><small>${esc(row.code)} · ${esc(row.category)}</small></div></div></td>
      <td>${row.state === 'transit' ? 'En déplacement' : esc(row.site_name)}${row.zone_name && row.state !== 'transit' ? `<span class="minor">${esc(row.zone_name)}</span>` : ''}</td><td>${status(row)}</td><td>${esc(measure(row))}</td><td>${row.price_cents == null ? '—' : euro.format(row.price_cents/100)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function bindStock(container) {
  container.querySelectorAll('[data-stock]').forEach(el => el.addEventListener('click', () => detail(el.dataset.stock).catch(report)));
}
function inventory(main) {
  const inCheck = page === 'controle';
  const buttons = button('Scanner','scan','stock-scan') + (allowed('reception','tri') ? button('Nouveau don','plus','stock-add','primary') : '') + (admin() && !inCheck ? '<a class="btn" href="/api/export/stock.csv">'+icon('download',16)+'Export CSV</a>' : '');
  main.innerHTML = header(inCheck ? 'À vérifier' : 'Stock', inCheck ? 'Les objets mis de côté et le motif du contrôle.' : 'Retrouvez vos objets et lots, du tri jusqu’à leur sortie.', buttons)
    + `<div class="toolbar"><label class="searchbox">${icon('search',16)}<input id="stock-search" type="search" value="${esc(search)}" placeholder="Nom, catégorie ou référence…" aria-label="Rechercher dans le stock"></label>
    ${inCheck ? '' : `<div class="tabs">${[['','Tout'], ...Object.entries(statusNames)].map(([state,label]) => `<button type="button" class="${filter === state ? 'active' : ''}" data-filter="${state}" aria-pressed="${filter === state}">${label}</button>`).join('')}</div>`}</div><div id="stock-table"></div>`;
  function draw() {
    const normalized = search.trim().toLowerCase();
    const rows = siteRows().filter(r => (inCheck ? r.state === 'controle' : !filter || filter === r.state)
      && (!normalized || [r.title,r.category,r.code,r.barcode,r.note].some(v => (v || '').toLowerCase().includes(normalized))));
    const node = document.getElementById('stock-table');
    node.innerHTML = table(rows);
    bindStock(node);
  }
  draw();
  on('stock-add', () => receive());
  on('stock-scan', () => scan());
  on('stock-search', e => { search = e.target.value; draw(); }, 'input');
  main.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    main.querySelectorAll('[data-filter]').forEach(x => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    draw();
  }));
}

function receive({ parent, barcode = '', title = '', category = '', unit = Boolean(parent || barcode) } = {}) {
  const site = parent ? getSite(parent.site_id) : workingSite();
  if (!site) return report(new Error('Ajoutez un site avant de réceptionner un don.'));
  const initialCategory = category || parent?.category || lastCategory;
  const initialMode = parent?.grams != null ? 'poids' : 'quantite';
  showDialog(parent ? 'Isoler un objet du lot' : 'Enregistrer un don', `<form id="receive-form">
    ${parent ? `<p class="notice">Lot d’origine <strong>${esc(parent.title)}</strong> · ${esc(measure(parent))}</p>` : ''}
    <fieldset><legend>Catégorie</legend><div class="category-grid" id="categories">${config.categories.map(c => `<button type="button" class="chip ${c === initialCategory ? 'selected' : ''}" data-category="${esc(c)}" aria-pressed="${c === initialCategory}">${esc(c)}</button>`).join('')}</div></fieldset>
    ${input('category',`type="hidden" value="${esc(initialCategory)}"`)}
    <div class="form-row">
      ${field('Suivre comme', `<select id="entry-kind" name="kind">${option('lot','Un lot',unit?'item':'lot')}${option('item','Un objet',unit?'item':'lot')}</select>`)}
      ${field('Site', `<select id="entry-site" name="site_id">${(parent ? [site] : sites).map(s => option(s.id,s.name,site.id)).join('')}</select>`)}
    </div>
    <div id="entry-measure"></div>
    ${field('Nom de l’objet', input('title', `maxlength="160" placeholder="Facultatif · sinon, la catégorie suffit" value="${esc(title)}"`))}
    <details ${barcode ? 'open' : ''}><summary>Photo, note, zone ou provenance</summary><div class="stack">
      ${field('Zone', `<select id="entry-zone" name="zone_id">${zones(site.id,parent?.zone_id || site.zones.find(z=>z.name==='Réception')?.id)}</select>`)}
      ${field('Provenance', `<select name="origin">${['Apport volontaire','Collecte à domicile','Collecte partenaire','Déchèterie','Autre'].map(x => option(x,x,'Apport volontaire')).join('')}</select>`)}
      ${field('Photo de l’objet', input('photo','type="file" accept="image/*" capture="environment"'))}
      ${field('Code-barres fabricant', input('barcode', `maxlength="80" inputmode="numeric" value="${esc(barcode)}"`))}
      ${field('Note', '<textarea name="note" maxlength="1000" placeholder="Une pièce manque, un câble est à vérifier…"></textarea>')}
    </div></details>
    <div class="form-error" role="alert"></div><div class="dialog-actions">${!parent ? '<label class="check grow"><input type="checkbox" name="repeat"> Enregistrer en série</label>' : ''}<button class="btn primary" type="submit">Enregistrer ${icon('check',16)}</button></div>
  </form>`);
  const form = document.getElementById('receive-form');
  function drawMeasure() {
    const kind = form.elements.kind.value;
    const node = document.querySelector('#entry-measure');
    if (kind === 'item') {
      node.innerHTML = parent?.grams != null ? field('Poids de l’objet (kg)',input('weight','type="number" inputmode="decimal" min="0.001" step="0.001" required')) : '';
      return;
    }
    node.innerHTML = `<div class="form-row">${field('Mode de suivi',`<select id="measure-mode" name="mode">${option('quantite','Quantité',initialMode)}${option('poids','Poids',initialMode)}</select>`)}<div id="measure-value"></div></div>`;
    const drawField = () => {
      document.getElementById('measure-value').innerHTML = form.elements.mode.value === 'poids'
        ? field('Poids (kg)',input('weight','type="number" inputmode="decimal" min="0.001" step="0.001" required'))
        : field('Quantité',input('quantity','type="number" inputmode="numeric" min="1" step="1" required'));
    };
    on('measure-mode', drawField, 'change'); drawField();
  }
  drawMeasure();
  on('entry-kind',drawMeasure,'change');
  on('entry-site',e => document.getElementById('entry-zone').innerHTML = zones(e.target.value,getSite(e.target.value)?.zones.find(z=>z.name==='Réception')?.id), 'change');
  form.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', () => {
    form.elements.category.value = b.dataset.category;
    form.querySelectorAll('[data-category]').forEach(el => {
      el.classList.toggle('selected',el === b);
      el.setAttribute('aria-pressed',String(el===b));
    });
    (form.elements.quantity || form.elements.weight || form.elements.title).focus();
  }));
  formSubmit('receive-form', async d => {
    if (!d.get('category')) throw new Error('Choisissez une catégorie.');
    const photo = d.get('photo');
    const row = await api('/stock',{ method:'POST', body:{
      kind:d.get('kind'), category:d.get('category'), title:d.get('title'), site_id:d.get('site_id'),zone_id:d.get('zone_id'),
      quantity:d.get('quantity') ? Number(d.get('quantity')) : null, grams:d.get('weight') ? Math.round(Number(d.get('weight'))*1000) : null,
      note:d.get('note'), barcode:d.get('barcode'), origin:d.get('origin'),parent_id:parent?.id, photo: photo?.size ? await encodePhoto(photo) : null,
    } });
    lastCategory = row.category;
    localStorage.setItem('secondevie-category',lastCategory);
    if (d.get('repeat')) {
      await changed('Entrée enregistrée · ' + row.code,{ close:false });
      for (const name of ['title','barcode','quantity','weight','photo','note']) if(form.elements[name]) form.elements[name].value='';
      (form.elements.quantity || form.elements.weight || form.elements.title).focus();
    } else {
      await changed('Entrée enregistrée · ' + row.code);
      if (parent) await detail(row.id);
    }
  });
}

async function encodePhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const factor = Math.min(1, 1250 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg', .8);
  } finally { bitmap.close(); }
}

function scan() {
  showDialog('Scanner une étiquette',`<form id="scan-form">
    <p class="help">Scannez un code avec une douchette, utilisez la caméra ou saisissez la référence.</p>
    ${field('Code de l’objet ou code fabricant',input('code','id="scan-input" required maxlength="80" autocomplete="off" placeholder="OBJ-… ou ISBN"'))}
    <div id="scan-results"></div>
    <video id="scan-video" class="scan-video" hidden playsinline muted></video>
    <div class="form-error" role="alert"></div><div class="dialog-actions">${button('Utiliser la caméra','camera','scan-camera','grow')}<button type="submit" class="btn primary">${icon('search',16)} Rechercher</button></div>
  </form>`);
  document.getElementById('scan-input').focus();
  const renderResult = async key => {
    const rows = await api('/stock/scan?code=' + encodeURIComponent(key));
    if (!dialog.open || !document.getElementById('scan-results')) return;
    if (rows.length === 1 && rows[0].code.toUpperCase() === key.toUpperCase()) return detail(rows[0].id);
    const target = document.getElementById('scan-results');
    if (rows.length) {
      target.innerHTML = table(rows);
      bindStock(target);
      if (allowed('reception','tri')) {
        target.insertAdjacentHTML('beforeend',button('Ajouter un autre exemplaire','plus','scan-add'));
        on('scan-add', () => receive({ barcode:key, title:rows[0].title, category:rows[0].category }));
      }
      return;
    }
    let found;
    if (/^(\d{9}[\dX]|97[89]\d{10})$/i.test(key.replaceAll('-',''))) {
      try { found = await api('/catalog/isbn/' + encodeURIComponent(key)); } catch {}
    }
    if (!dialog.open || target !== document.getElementById('scan-results')) return;
    target.innerHTML = `<p class="notice">${found?.found ? `Livre trouvé · ${esc(found.title)}${found.author ? ' · '+esc(found.author) : ''}` : 'Aucune fiche pour ce code. Vous pouvez l’ajouter manuellement.'}</p>${allowed('reception','tri') ? button('Ajouter au stock','plus','scan-add') : ''}`;
    on('scan-add', () => receive({ barcode:key, title:found?.title || '', category:found?.found ? 'Livres' : '' }));
  };
  formSubmit('scan-form',d => renderResult(d.get('code').trim()));
  on('scan-camera',async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('La caméra nécessite une connexion HTTPS ou localhost. Vous pouvez saisir le code.');
    const video = document.getElementById('scan-video');
    document.getElementById('scan-camera').disabled = true;
    try {
      await loadScanner();
      if (!dialog.open || video !== document.getElementById('scan-video')) return;
      video.hidden = false;
      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      let done = false;
      const controls = await reader.decodeFromVideoDevice(undefined,video,(result, error, control) => {
        if (!result || done || !dialog.open || video !== document.getElementById('scan-video')) return;
        done = true;
        control.stop();
        video.hidden = true;
        const key = result.getText();
        document.getElementById('scan-input').value = key;
        renderResult(key).catch(report);
      });
      if (!dialog.open || video !== document.getElementById('scan-video')) controls.stop();
      else stopCamera = () => controls.stop();
    } catch {
      video.hidden = true;
      if (document.getElementById('scan-camera')) document.getElementById('scan-camera').disabled = false;
      throw new Error('Caméra indisponible. Vérifiez les autorisations ou saisissez le code.');
    }
  });
}
let scanner;
function loadScanner() {
  if (window.ZXingBrowser) return Promise.resolve();
  if (!scanner) scanner = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/zxing/zxing-browser.min.js';
    script.onload=resolve;
    script.onerror=()=>{scanner=null;reject(new Error('Lecteur indisponible.'));};
    document.head.append(script);
  });
  return scanner;
}

async function detail(id) {
  const r = await api('/stock/' + id);
  const active = !['transit','sorti'].includes(r.state);
  const control = allowed('reception','tri','atelier','stock');
  showDialog(r.title,`<div class="stack">
    <div class="card-line"><strong>${esc(r.code)}</strong>${status(r)}</div>
    ${r.has_photo ? `<img class="item-photo" src="/api/photos/${id}?v=${Date.now()}" alt="Photo de l’objet">` : ''}
    <div class="notice">${esc(r.category)} · ${esc(measure(r))}${r.price_cents != null ? ' · '+euro.format(r.price_cents/100) : ''}<br>${r.state==='transit' ? 'En déplacement' : esc([r.site_name,r.zone_name].filter(Boolean).join(' / '))}
    ${r.parent_code ? '<br>Lot d’origine '+esc(r.parent_code) : ''}${r.condition ? '<br>État · '+esc(r.condition) : ''}${r.barcode ? '<br>Code fabricant · '+esc(r.barcode) : ''}</div>
    ${r.note ? '<p class="help">'+esc(r.note)+'</p>' : ''}
    <div class="tabs">${button('Imprimer l’étiquette','printer','print-label')}
      ${active && control ? button('Mettre de côté','wrench','detail-block') + button(r.has_photo ? 'Changer la photo' : 'Ajouter une photo','camera','detail-photo') : ''}
      ${active && allowed('tri','atelier') ? button('Marquer prêt','check','detail-ready','primary') : ''}
      ${active && r.kind === 'lot' && allowed('tri','reception') ? button('Isoler un objet','plus','detail-isolate') : ''}
      ${active && allowed('stock','tri','atelier') ? button('Ranger dans une zone','pin','detail-move') : ''}
      ${active && allowed('stock','tri') && sites.length > 1 ? button('Transférer','truck','detail-transfer') : ''}
      ${active && allowed('stock','vente') ? button('Enregistrer une sortie','arrow','detail-exit','danger') : ''}
    </div>
    <details><summary>Historique · ${r.history.length} actions</summary><ul class="log">${r.history.map(e=>`<li>${esc(e.detail)}<span>${esc(e.name)} · ${date(e.created_at)}</span></li>`).join('')}</ul></details>
  </div>`);
  on('print-label',()=>printLabel(r));
  on('detail-block',()=>actionForm(r,'block','Mettre de côté',field('Motif du contrôle','<textarea name="note" required maxlength="500" placeholder="Ex. câble abîmé"></textarea>'),d=>({note:d.get('note')})));
  on('detail-ready',()=>actionForm(r,'ready','Valider le tri',field('État constaté',input('condition',`maxlength="100" placeholder="Ex. Testé, fonctionne" value="${esc(r.condition)}"`)) + field('Prix (€)',input('price',`type="number" min="0" step="0.01" value="${r.price_cents == null ? '' : r.price_cents/100}"`)),d=>({condition:d.get('condition'),price_cents:d.get('price') !== '' ? Math.round(Number(d.get('price'))*100) : null})));
  on('detail-move',()=>actionForm(r,'move','Changer de zone',field('Zone',`<select name="zone_id" required>${zones(r.site_id,'','Choisir une zone')}</select>`),d=>({zone_id:d.get('zone_id')})));
  on('detail-photo',()=>actionForm(r,'photo','Photo de l’objet',field('Photo',input('photo','type="file" accept="image/*" capture="environment" required')),async d=>({photo:await encodePhoto(d.get('photo'))})));
  on('detail-isolate',()=>receive({parent:r}));
  on('detail-transfer',()=>newTransfer(r.site_id,r.id));
  on('detail-exit',()=>actionForm(r,'exit','Confirmer la sortie',field('Motif',`<select name="exit_type" required><option value="">Choisir un motif</option>${allowed('vente')&&r.state==='pret'?option('vente','Vente'):''}${option('don','Don')}${option('recyclage','Recyclage')}</select>`)+'<p class="help">Cette fiche sera retirée du stock disponible.</p>',d=>({exit_type:d.get('exit_type')})));
}
function actionForm(row,action,title,fields,body) {
  showDialog(title,`<form id="action-form">${fields}${formEnd('Enregistrer')}</form>`);
  formSubmit('action-form',async d=>{
    await api('/stock/'+row.id+'/action',{method:'POST',body:{action,...await body(d)}});
    await changed('Fiche mise à jour.');
    await detail(row.id);
  });
}
function printLabel(row) {
  const section = document.createElement('section');
  section.className='print-label';
  section.innerHTML=`<h2>${esc(row.title)}</h2><p>${esc(row.code)}${row.price_cents==null?'':' · '+euro.format(row.price_cents/100)}</p><img src="/api/labels/${row.id}" alt="">`;
  document.body.append(section);
  section.querySelector('img').onload=()=>{
    document.body.classList.add('printing');
    window.addEventListener('afterprint',()=>{document.body.classList.remove('printing');section.remove();},{once:true});
    window.print();
  };
  section.querySelector('img').onerror=()=>{section.remove();report(new Error('Étiquette indisponible.'));};
}

function transferPage(main) {
  const rows = transfers.filter(t => !siteFilter || t.origin_id === siteFilter || t.destination_id === siteFilter);
  main.innerHTML = header('Transferts', 'Voyez ce qui est parti, arrivé ou encore en route.',
    allowed('stock','tri') && sites.length > 1 ? button('Nouveau transfert','plus','new-transfer','primary') : '')
    + (rows.length ? '<div class="cards">' + rows.map(t => {
      const received = t.lines.filter(l => l.received_at).length;
      const complete = received === t.lines.length;
      return `<article class="card"><div class="card-line"><span class="pill ${complete ? 'pret' : 'transit'}">${complete ? 'Reçu' : received ? 'Arrivé en partie' : 'En transit'}</span><small>${date(t.created_at)}</small></div>
        <h2>${esc(t.origin_name)} → ${esc(t.destination_name)}</h2><p>${received} / ${t.lines.length} fiches reçues</p>
        <ul class="log">${t.lines.map(l => `<li>${esc(l.title)}<span>${esc(l.code)} · ${l.received_at ? 'Reçu' : 'En transit'}</span></li>`).join('')}</ul>
        ${!complete && allowed('stock','reception','tri') ? button('Confirmer l’arrivée','check','arrival-'+t.id,'primary') : ''}</article>`;
    }).join('') + '</div>' : '<div class="surface empty">Aucun transfert pour ces sites.</div>');
  on('new-transfer', () => newTransfer());
  for (const row of rows) on('arrival-'+row.id, () => receiveTransfer(row));
}
function siteOptions(selected, exclude) {
  return sites.filter(s => s.id !== exclude).map(s => option(s.id,s.name,selected)).join('');
}
function stockCheck(row, checked) {
  return `<label class="check"><input type="checkbox" name="stock_ids" value="${row.id}" ${checked ? 'checked' : ''}><span>${esc(row.title)} <small>${esc(row.code)}</small></span></label>`;
}
function newTransfer(origin = workingSite()?.id, preselected) {
  showDialog('Démarrer un transfert',`<form id="transfer-form"><div class="form-row">
    ${field('Site de départ',`<select id="transfer-origin" name="origin">${siteOptions(origin)}</select>`)}
    ${field('Site d’arrivée','<select id="transfer-destination" name="destination_id" required></select>')}
    </div><fieldset><legend>Objets ou lots à déplacer</legend><div class="checklist" id="transfer-stock"></div></fieldset>${formEnd('Marquer comme parti')}</form>`);
  function draw() {
    const site = document.getElementById('transfer-origin').value;
    document.getElementById('transfer-destination').innerHTML = option('','Choisir un site') + siteOptions('',site);
    document.getElementById('transfer-stock').innerHTML = stock.filter(r=>r.site_id === site && !['sorti','transit'].includes(r.state))
      .map(r=>stockCheck(r,r.id===preselected)).join('') || '<p class="help">Aucune fiche disponible pour ce départ.</p>';
  }
  draw();
  on('transfer-origin',draw,'change');
  formSubmit('transfer-form', async d => {
    await api('/transfers',{method:'POST',body:{destination_id:d.get('destination_id'),stock_ids:d.getAll('stock_ids')}});
    await changed('Transfert enregistré.'); go('transferts');
  });
}
function receiveTransfer(t) {
  showDialog('Confirmer l’arrivée',`<form id="arrival-form"><p class="notice">Arrivée à <strong>${esc(t.destination_name)}</strong>. Décochez les fiches qui sont encore en route.</p>
    <fieldset><legend>Fiches reçues</legend><div class="checklist">${t.lines.filter(l=>!l.received_at).map(l=>stockCheck(l,true)).join('')}</div></fieldset>
    ${field('Zone d’arrivée',`<select name="zone_id">${zones(t.destination_id)}</select>`)}${formEnd('Confirmer la réception')}</form>`);
  formSubmit('arrival-form',async d=>{
    await api('/transfers/'+t.id+'/receive',{method:'POST',body:{stock_ids:d.getAll('stock_ids'),zone_id:d.get('zone_id')}});
    await changed('Arrivée enregistrée.');
  });
}

function teamPage(main) {
  main.innerHTML = header('Équipe', 'Attribuez une ou plusieurs fonctions à chaque personne.', button('Ajouter une personne','plus','team-add','primary'))
    + '<div class="cards">' + team.map(m=>`<article class="card"><div class="card-line"><h2>${esc(m.name)}</h2><span class="pill ${m.active?'pret':'sorti'}">${m.active?'Actif':'Désactivé'}</span></div>
    <p>${esc(m.email)}</p><p>${esc(m.roles.map(r=>roleNames[r]).join(' · '))}</p>${button('Modifier les fonctions','users','member-'+m.id)}</article>`).join('') + '</div>';
  on('team-add',()=>memberForm());
  team.forEach(m=>on('member-'+m.id,()=>memberForm(m)));
}
function memberForm(member) {
  const roles = member?.roles || ['reception'];
  showDialog(member ? member.name : 'Ajouter une personne',`<form id="member-form">
    ${member ? '' : field('Nom',input('name','maxlength="100" required')) + field('E-mail',input('email','type="email" maxlength="254" required')) + field('Mot de passe initial',input('password','type="password" minlength="12" autocomplete="new-password" required'))}
    <fieldset><legend>Fonctions</legend><div class="form-row">${Object.entries(roleNames).map(([id,label])=>`<label class="check"><input type="checkbox" name="roles" value="${id}" ${roles.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset>
    ${member && member.id !== me.id ? `<label class="check"><input type="checkbox" name="active" ${member.active?'checked':''}> Compte actif</label>` : ''}
    ${formEnd('Enregistrer')}</form>`);
  formSubmit('member-form',async d=>{
    const body = { roles:d.getAll('roles') };
    if (member) body.active = member.id === me.id || d.has('active');
    else Object.assign(body,{name:d.get('name'),email:d.get('email'),password:d.get('password')});
    await api('/team'+(member?'/'+member.id:''),{method:member?'PATCH':'POST',body});
    await changed('Équipe mise à jour.');
  });
}
function planningPage(main) {
  const list = shifts.filter(s => +new Date(s.ends_at) >= Date.now() && (!siteFilter || s.site_id === siteFilter));
  main.innerHTML = header('Planning', 'Retrouvez qui est prévu, où et sur quel poste.', admin() ? button('Ajouter un créneau','plus','new-shift','primary') : '')
    + (list.length ? '<div class="cards">' + list.map(s=>`<article class="card"><div class="card-line"><h2>${esc(s.member_name)}</h2><span class="pill pret">${esc(s.activity)}</span></div>
    <p>${esc(s.site_name)}</p><p>${date(s.starts_at)} → ${date(s.ends_at)}</p>
    ${admin()?button('Supprimer le créneau',null,'shift-'+s.id,'danger'):''}</article>`).join('') + '</div>' : '<div class="surface empty">Aucun créneau à venir pour ces sites.</div>');
  on('new-shift',newShift);
  list.forEach(s=>on('shift-'+s.id,()=>{
    showDialog('Supprimer le créneau',`<form id="remove-shift"><p class="help">${esc(s.member_name)} · ${date(s.starts_at)}</p>${formEnd('Confirmer la suppression')}</form>`);
    formSubmit('remove-shift',async()=>{
      await api('/shifts/'+s.id,{method:'DELETE'});
      await changed('Créneau supprimé.');
    });
  }));
}
function newShift() {
  showDialog('Ajouter un créneau',`<form id="shift-form">
    ${field('Personne',`<select name="member_id" required>${option('','Choisir une personne')}${team.filter(m=>m.active).map(m=>option(m.id,m.name)).join('')}</select>`)}
    <div class="form-row">${field('Site',`<select name="site_id">${siteOptions(workingSite()?.id)}</select>`)}
    ${field('Activité',`<select name="activity">${config.activities.map(a=>option(a,a)).join('')}</select>`)}</div>
    <div class="form-row">${field('Début',input('starts_at','type="datetime-local" required'))}${field('Fin',input('ends_at','type="datetime-local" required'))}</div>
    ${formEnd('Ajouter au planning')}</form>`);
  formSubmit('shift-form',async d=>{
    const body = Object.fromEntries(d);
    body.starts_at = new Date(body.starts_at).toISOString();
    body.ends_at = new Date(body.ends_at).toISOString();
    await api('/shifts',{method:'POST',body});
    await changed('Créneau ajouté.');
  });
}
function sitePage(main) {
  main.innerHTML = header('Sites et zones', 'Organisez les lieux et nommez leurs emplacements.', admin() ? button('Ajouter un site','plus','new-site','primary') : '')
    + '<div class="cards">' + sites.map(s=>`<article class="card"><div class="card-line"><h2>${esc(s.name)}</h2>${tile('building')}</div><p>${esc(s.kind)}</p>
    <div class="tabs">${s.zones.map(z=>`<span class="pill">${esc(z.name)}</span>`).join('') || '<small>Aucune zone renseignée.</small>'}</div></article>`).join('') + '</div>';
  on('new-site',()=>{
    showDialog('Ajouter un site',`<form id="site-form">${field('Nom du site',input('name','maxlength="100" required'))}
      ${field('Activités sur ce site',input('kind','maxlength="120" placeholder="Ex. Réception et atelier" required'))}
      ${field('Zones séparées par des virgules',input('zones','maxlength="600" placeholder="Ex. Quai, Rayon A, Atelier"'))}
      ${formEnd('Ajouter le site')}</form>`);
    formSubmit('site-form',async d=>{
      await api('/sites',{method:'POST',body:Object.fromEntries(d)});
      await changed('Site ajouté.');
    });
  });
}

async function init() {
  try {
    config = await api('/config');
    try { await startWorkspace(); }
    catch (error) {
      if (error.status !== 401) throw error;
      login();
    }
  } catch (error) {
    root.innerHTML = '<main class="content"><div class="surface empty"><h1>Connexion indisponible</h1><p>Rechargez la page pour réessayer.</p></div></main>';
    report(error);
  }
}
init();
