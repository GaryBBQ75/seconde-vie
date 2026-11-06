import { demoRequest as api } from './demo-api.js';
import { toString as makeQr } from './vendor/qrcode/index.js';
import { icon } from './icons.js';
import { scanCameraFrames } from './scanner.js';
import { referenceFields } from './reference.js';
import { catalogDescription, catalogImages, catalogPrefill, catalogSource, catalogType, lookupCatalog, normalizeScanCode } from './catalog.js';
import { itemPhotos, maxItemPhotos } from './photos.js';
import { acceptedCategories, categoryIcons, colors, pictograms } from './categories.js';

const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toastArea = document.querySelector('#toast');
const pageNames = { accueil: 'Réception', scanner: 'Scanner', stock: 'Stock', controle: 'À vérifier', transferts: 'Transferts', planning: 'Planning', equipe: 'Équipe', sites: 'Sites et zones' };
const statusNames = { tri: 'À trier', controle: 'À vérifier', pret: 'Prêt', transit: 'En transit', sorti: 'Sorti' };
const exitNames = { vente: 'Vendu', don: 'Donné', recyclage: 'Recyclage', reparti: 'Lot réparti' };
const roleNames = { admin: 'Responsable', reception: 'Réception', tri: 'Tri', atelier: 'Atelier', stock: 'Stock', vente: 'Vente' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
let config, me, sites = [], stock = [], transfers = [], shifts = [], team = [];
let page = 'accueil', filter = '', search = '', siteFilter = localStorage.getItem('secondevie-site') || '';
const handheld = window.matchMedia('(max-width: 600px)');
const defaultPage = () => handheld.matches ? 'scanner' : 'accueil';
let stopCamera;
let preferredCamera = 'auto';
const endScan = () => { stopCamera?.(); stopCamera = null; };
const admin = () => me?.roles.includes('admin');
const allowed = (...roles) => admin() || roles.some(r => me?.roles.includes(r));
const getSite = id => sites.find(site => site.id === id);
const workingSite = () => getSite(siteFilter) || sites.find(site => /réception/i.test(site.kind)) || sites[0];
const siteRows = () => stock.filter(row => !siteFilter || row.site_id === siteFilter);
const siteCategories = site => acceptedCategories(site, config.categories);
const allCategories = () => [...config.categories, ...config.customCategories.map(category => category.name)];
function categoryAppearance(name) {
  const custom = config.customCategories.find(category => category.name === name);
  return custom ? [custom.icon, custom.color]
    : Object.prototype.hasOwnProperty.call(categoryIcons, name) ? categoryIcons[name] : ['box', 'neutral'];
}
const categoryTile = name => tile(...categoryAppearance(name));

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

const nativeDialog = typeof dialog.showModal === 'function';
let modalOpener;
if (!nativeDialog) {
  dialog.classList.add('legacy-dialog');
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not([type=hidden]):not(:disabled), select, textarea, summary, a[href]'))
      .filter(element => element.getClientRects().length && element.tabIndex >= 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

function closeDialog() {
  if (nativeDialog) { dialog.close(); return; }
  dialog.removeAttribute('open');
  root.removeAttribute('aria-hidden');
  document.body.classList.remove('legacy-modal');
  modalOpener?.focus();
}

function showDialog(title, html) {
  const wasOpen = dialog.hasAttribute('open');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" id="close-dialog" type="button" aria-label="Fermer">${icon('close')}</button></div><div class="dialog-body">${html}</div>`;
  if (nativeDialog && !wasOpen) dialog.showModal();
  else {
    if (!nativeDialog && !wasOpen) {
      modalOpener = document.activeElement;
      dialog.setAttribute('open', '');
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.add('legacy-modal');
    }
    dialog.querySelector('#close-dialog').focus();
  }
  on('close-dialog', closeDialog);
  watchCatalogImages(dialog);
}

function formSubmit(id, fn) {
  const node = document.getElementById(id);
  let clicked;
  node.addEventListener('click', event => {
    clicked = event.target.closest('button[type=submit]');
    setTimeout(() => { clicked = null; }, 0);
  });
  node.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.saving) return;
    const data = new FormData(form);
    const submitter = event.submitter || clicked;
    if (submitter?.name) data.append(submitter.name, submitter.value);
    const buttons = Array.from(form.querySelectorAll('button[type=submit]:enabled'));
    const error = form.querySelector('.form-error');
    error.textContent = '';
    form.dataset.saving = 'true';
    buttons.forEach(button => { button.disabled = true; });
    try { await fn(data, form); }
    catch (e) { error.textContent = e.message; }
    finally {
      delete form.dataset.saving;
      buttons.forEach(button => { button.disabled = false; });
    }
  });
}
const formEnd = (label) => `<div class="form-error" role="alert"></div><div class="dialog-actions"><button class="btn primary" type="submit">${esc(label)}</button></div>`;

async function refresh() {
  [sites, stock, transfers, shifts, team] = await Promise.all([
    api('/sites'), api('/stock'), api('/transfers'), api('/shifts'), admin() ? api('/team') : Promise.resolve([]),
  ]);
  if (siteFilter && !getSite(siteFilter)) siteFilter = '';
}
async function startWorkspace() {
  me = await api('/me');
  await refresh();
  go(location.hash.slice(1) || defaultPage(), true);
}
async function changed(message, draft) {
  if (dialog.hasAttribute('open')) closeDialog();
  await refresh();
  render(draft);
  notice(message);
}
function go(target, replace = false, nextFilter = '') {
  if (!pageNames[target] || (!admin() && target === 'equipe')) target = defaultPage();
  page = target;
  filter = nextFilter;
  search = '';
  if (location.hash !== '#' + target) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + target);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (me) go(location.hash.slice(1), true); });

const nav = (pages) => pages.map(([key, sym]) => `<a href="#${key}" class="navlink ${page === key ? 'active' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(sym,17)}${pageNames[key]}</a>`).join('');
function render(draft) {
  endScan();
  const initials = me.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  root.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Navigation principale">
    ${brand()}<nav class="navgroup"><div class="navtitle">Au quotidien</div>${nav([['accueil','receive'],['scanner','scan'],['stock','box'],['controle','wrench'],['transferts','truck']])}</nav>
    <nav class="navgroup"><div class="navtitle">Organisation</div>${nav([['planning','calendar'], ...(admin() ? [['equipe','users']] : []), ['sites','pin']])}</nav>
    <div class="profile"><span class="avatar">${esc(initials)}</span><div><strong>${esc(me.name)}</strong><small>${admin() ? 'Responsable' : esc(me.roles.map(r => roleNames[r]).join(' · '))}</small><small>Données d’essai</small></div></div></aside>
    <div class="workspace"><header class="topbar"><button type="button" id="menu" class="icon-button mobile-menu" aria-label="Menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button><div class="breadcrumb"><span class="org">${esc(me.org_name)}</span><span class="org">${icon('chevron',12)}</span><strong>${pageNames[page]}</strong></div><div class="topright">${page === 'scanner' ? '' : `<select id="current-site" class="site-switch" aria-label="${page === 'accueil' ? 'Site de réception' : 'Filtrer par site'}">${page === 'accueil' ? siteOptions(workingSite()?.id) : option('', 'Tous les sites', siteFilter) + siteOptions(siteFilter)}</select>`}</div></header>
    <main class="content ${page === 'accueil' ? 'receiving-content' : ''}" id="main"></main>
    <nav class="mobile-nav" aria-label="Actions terrain">${nav([['accueil','receive'],['scanner','scan'],['stock','box']])}</nav></div></div>`;
  document.querySelectorAll('[data-page]').forEach(a => a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(a.dataset.page);
  }));
  on('menu', e => {
    const isOpen = document.querySelector('#sidebar').classList.toggle('open');
    document.getElementById('menu').setAttribute('aria-expanded', String(isOpen));
  });
  on('current-site', e => { siteFilter = e.target.value; localStorage.setItem('secondevie-site',siteFilter); render(); }, 'change');
  const main = document.querySelector('#main');
  if (page === 'accueil') home(main, draft);
  if (page === 'scanner') scanPage(main);
  if (page === 'stock' || page === 'controle') inventory(main);
  if (page === 'transferts') transferPage(main);
  if (page === 'planning') planningPage(main);
  if (page === 'equipe') teamPage(main);
  if (page === 'sites') sitePage(main);
}

function home(main, draft) {
  const site = workingSite();
  if (!site) {
    main.innerHTML = header('Réception des dons') + '<p class="surface empty">Ajoutez un site avant de réceptionner un don.</p>';
    return;
  }
  const rows = stock.filter(row => row.site_id === site.id);
  main.innerHTML = header('Réception des dons', site.name,
    button('Scanner','scan','receive-scan') + button('Voir le stock','box','receive-stock'))
    + `<div class="receiving-layout">
      <section class="surface receiving-panel" aria-labelledby="receive-title">
        <div class="panel-head"><h2 id="receive-title">Nouvelle entrée</h2></div>
        <div class="panel-body" id="receiving-form"></div>
      </section>
      <section class="intake-activity" aria-labelledby="recent-title">
        <div class="work-counts">
          <button type="button" id="intake-tri">${icon('sort', 17)} À trier <strong>${rows.filter(row => row.state === 'tri').length}</strong></button>
          <button type="button" id="intake-check">${icon('wrench', 17)} À vérifier <strong>${rows.filter(row => row.state === 'controle').length}</strong></button>
        </div>
        <div class="section-head"><h2 id="recent-title">Dernières entrées</h2></div>
        ${recentEntries(rows.slice(0, 8))}
      </section>
    </div>`;
  receive({ inline: true, ...draft });
  on('receive-scan', () => go('scanner'));
  on('receive-stock', () => openSiteStock(site));
  on('intake-tri', () => openSiteStock(site, 'tri'));
  on('intake-check', () => openSiteStock(site, 'controle'));
  bindStock(main);
}

function openSiteStock(site, state = '') {
  siteFilter = site.id;
  localStorage.setItem('secondevie-site', site.id);
  go(state === 'controle' ? 'controle' : 'stock', false, state);
}

function recentEntries(rows) {
  if (!rows.length) return '<div class="surface empty">Aucune entrée sur ce site.</div>';
  return `<ul class="surface recent-list">${rows.map(row => `<li><button type="button" data-stock="${esc(row.id)}">
    ${categoryTile(row.category)}<span class="recent-title"><strong>${esc(row.title)}</strong><small>${esc([measure(row), row.zone_name].filter(Boolean).join(' · '))}</small></span>
    ${status(row)}${icon('chevron', 14)}
  </button></li>`).join('')}</ul>`;
}

function header(title, sub = '', actions = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="page-actions">${actions}</div></header>`;
}
function table(rows) {
  if (!rows.length) return '<div class="surface empty">Aucun objet ou lot ici pour le moment.</div>';
  return `<div class="surface table-scroll"><table><thead><tr><th>Objet ou lot</th><th>Site / zone</th><th>État</th><th>Quantité</th><th>Prix</th></tr></thead><tbody>${rows.map(row => {
    return `<tr><td><div class="item-title">${categoryTile(row.category)}<div><button type="button" data-stock="${row.id}">${esc(row.title)}</button><small>${esc(row.code)} · ${esc(row.category)}</small><small class="stock-compact-data">${esc(measure(row))}${row.price_cents == null ? '' : ' · ' + euro.format(row.price_cents / 100)}</small></div></div></td>
      <td>${row.state === 'transit' ? 'En déplacement' : esc(row.site_name)}${row.zone_name && row.state !== 'transit' ? `<span class="minor">${esc(row.zone_name)}</span>` : ''}</td><td>${status(row)}</td><td>${esc(measure(row))}</td><td>${row.price_cents == null ? '—' : euro.format(row.price_cents/100)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function bindStock(container) {
  container.querySelectorAll('[data-stock]').forEach(el => el.addEventListener('click', () => detail(el.dataset.stock).catch(report)));
}
function inventory(main) {
  const inCheck = page === 'controle';
  const buttons = button('Scanner','scan','stock-scan') + (allowed('reception','tri') ? button('Nouveau don','plus','stock-add','primary') : '') + (admin() && !inCheck ? button('Export CSV','download','stock-export') : '');
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
  on('stock-add', () => go('accueil'));
  on('stock-scan', () => go('scanner'));
  on('stock-export', downloadStock);
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

function choice(name, value, label, { checked, graphic = '', hint = '', required = false } = {}) {
  return `<label class="choice">
    <input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''} ${required ? 'required' : ''}>
    <span class="choice-face">${graphic}<span><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</span></span>
  </label>`;
}

function receive({ parent, barcode = '', title = '', category = '', catalog, reference, referenceConfirmed = false, kind = parent || barcode ? 'item' : 'lot', mode = 'quantite', inline = false } = {}) {
  const site = parent ? getSite(parent.site_id) : workingSite();
  if (!site) return report(new Error('Ajoutez un site avant de réceptionner un don.'));
  const id = inline ? 'intake-form' : 'receive-form';
  const entryZone = current => parent?.zone_id || current.zones.find(zone => zone.name === 'Réception')?.id;
  const formHtml = `<form id="${id}" class="intake-form">
    ${parent ? `<p class="notice">Lot d’origine <strong>${esc(parent.title)}</strong> · ${esc(measure(parent))}</p>` : ''}
    ${!inline && !parent ? field('Site de réception', `<select name="site_id">${siteOptions(site.id)}</select>`) : ''}
    <fieldset><legend>Catégorie</legend><div class="category-grid" data-entry-categories></div></fieldset>
    ${parent ? input('kind', 'type="hidden" value="item"') : `<fieldset><legend>Suivre comme</legend><div class="choice-row">
      ${choice('kind', 'lot', 'Un lot', { checked:kind === 'lot', graphic:tile('box'), hint:'Plusieurs pièces ensemble' })}
      ${choice('kind', 'item', 'Un objet', { checked:kind === 'item', graphic:tile('item'), hint:'Une fiche pour une pièce' })}
    </div></fieldset>`}
    ${parent ? '' : `<div data-lot-measure>
      <fieldset><legend>Mode de suivi du lot</legend><div class="choice-row">
        ${choice('mode', 'quantite', 'En pièces', { checked:mode === 'quantite', graphic:icon('count', 18) })}
        ${choice('mode', 'poids', 'Au poids', { checked:mode === 'poids', graphic:icon('scale', 18) })}
      </div></fieldset>
      <fieldset data-quantity><legend>Quantité</legend>
        <div class="quantity-choices" aria-label="Quantités courantes">
          ${[1, 2, 5, 10, 20].map(value => `<button type="button" class="btn quantity-choice" data-quantity-value="${value}" aria-pressed="false">${value}</button>`).join('')}
          ${input('quantity', 'type="number" inputmode="numeric" min="1" step="1" placeholder="Autre" aria-label="Nombre de pièces"')}
        </div>
      </fieldset>
    </div>`}
    ${!parent || parent.grams != null ? `<div data-weight>${field('Poids (kg)', input('weight', 'type="number" inputmode="decimal" min="0.001" step="0.001" placeholder="0,000"'))}</div>` : ''}
    ${field('Nom de l’entrée (facultatif)', input('title', `maxlength="160" placeholder="Ex. Carton de livres" value="${esc(title)}"`))}
    ${barcode ? `<p class="intake-barcode">${icon('scan', 15)} Code scanné <strong>${esc(barcode)}</strong></p>` : ''}
    ${catalogCard(catalog)}
    <details class="entry-extras" ${catalog || reference ? 'open' : ''}><summary>Descriptif et caractéristiques</summary><div class="stack">
      <div data-reference-fields></div>${descriptionField(catalogDescription(catalog))}
    </div></details>
    <details class="entry-extras"><summary>Photos facultatives</summary><div class="stack">
      ${catalogGallery(catalog, [], true)}${photoInput()}
      <p class="help">Jusqu’à trois photos de l’exemplaire. Vous pouvez les ajouter après la réception.</p>
    </div></details>
    <details class="entry-extras"><summary>Note, zone et provenance</summary><div class="stack">
      ${field('Zone', `<select name="zone_id">${zones(site.id, entryZone(site))}</select>`)}
      ${field('Provenance', `<select name="origin">${['Apport volontaire','Collecte à domicile','Collecte partenaire','Déchèterie','Autre'].map(x => option(x,x,'Apport volontaire')).join('')}</select>`)}
      ${field('Code-barres fabricant', input('barcode', `maxlength="80" inputmode="numeric" value="${esc(barcode)}"`))}
      ${field('Note', '<textarea name="note" maxlength="1000"></textarea>')}
    </div></details>
    <div class="form-error" role="alert"></div>
    <div class="intake-actions">
      <button class="btn primary" type="submit">${icon('check', 17)} ${parent ? 'Isoler l’objet' : 'Enregistrer'}</button>
      ${inline ? '<button class="btn" type="submit" name="next" value="true">Enregistrer et continuer</button>' : ''}
    </div>
  </form>`;
  if (inline) {
    const panel = document.getElementById('receiving-form');
    panel.innerHTML = formHtml;
    watchCatalogImages(panel);
  } else showDialog(parent ? 'Isoler un objet du lot' : 'Nouvelle entrée', formHtml);
  const form = document.getElementById(id);
  const categoryGroup = form.querySelector('[data-entry-categories]');
  function drawCategories(currentSite, selected) {
    const choices = [...siteCategories(currentSite)];
    if (parent && !choices.includes(parent.category)) choices.push(parent.category);
    categoryGroup.innerHTML = choices.map(name => choice('category', name, name,
      { checked:name === selected, graphic:categoryTile(name), required:true })).join('')
      || '<p class="help">Ce site n’a aucune catégorie ouverte à la réception.</p>';
    form.querySelectorAll('button[type=submit]').forEach(button => { button.disabled = !choices.length; });
  }
  drawCategories(site, category || parent?.category);
  const referenceContainer = form.querySelector('[data-reference-fields]');
  const referenceDraft = referenceConfirmed ? { ...reference } : { ...catalogPrefill(catalog), ...reference };
  function drawReference() {
    for (const control of referenceContainer.querySelectorAll('input')) referenceDraft[control.name.slice(4)] = control.value;
    const selected = new FormData(form).get('category');
    referenceContainer.innerHTML = referenceInputs(selected, referenceDraft);
  }
  drawReference();

  function drawMeasure() {
    const lot = form.elements.kind.value === 'lot';
    const byWeight = form.elements.mode?.value === 'poids';
    if (!parent) {
      form.querySelector('[data-lot-measure]').hidden = !lot;
      form.querySelector('[data-quantity]').hidden = byWeight;
      form.elements.quantity.disabled = !lot || byWeight;
      form.elements.quantity.required = lot && !byWeight;
    }
    if (form.elements.weight) {
      const showWeight = parent ? parent.grams != null : lot && byWeight;
      form.querySelector('[data-weight]').hidden = !showWeight;
      form.elements.weight.disabled = !showWeight;
      form.elements.weight.required = showWeight;
    }
  }
  drawMeasure();
  form.addEventListener('change', event => {
    if (['kind', 'mode'].includes(event.target.name)) drawMeasure();
    if (event.target.name === 'category') drawReference();
    if (event.target.name === 'site_id') {
      const selected = new FormData(form).get('category');
      const currentSite = getSite(event.target.value);
      form.elements.zone_id.innerHTML = zones(currentSite.id, entryZone(currentSite));
      drawCategories(currentSite, selected);
      drawReference();
    }
  });
  const quantity = form.elements.quantity;
  if (quantity) {
    const presets = form.querySelectorAll('[data-quantity-value]');
    const highlightQuantity = () => presets.forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.quantityValue === quantity.value)));
    quantity.addEventListener('input', highlightQuantity);
    presets.forEach(button => button.addEventListener('click', () => {
      quantity.value = button.dataset.quantityValue;
      highlightQuantity();
    }));
  }
  formSubmit(id, async data => {
    const photos = await photoFormData(data);
    const row = await api('/stock', { method:'POST', body:{
      kind:data.get('kind'), category:data.get('category'), title:data.get('title'), site_id:data.get('site_id') || site.id,
      zone_id:data.get('zone_id'), quantity:data.get('quantity') ? Number(data.get('quantity')) : null,
      grams:data.get('weight') ? Math.round(Number(data.get('weight')) * 1000) : null,
      note:data.get('note'), barcode:data.get('barcode'), origin:data.get('origin'), parent_id:parent?.id, catalog,
      reference:formReference(data, data.get('category')), description:data.get('description'), ...photos,
    } });
    const next = data.has('next') ? { category:row.category, kind:row.kind, mode:data.get('mode') } : undefined;
    await changed('Entrée enregistrée · ' + row.code, next);
    if (parent) await detail(row.id);
    else if (inline) {
      const nextControl = next && row.kind === 'lot' && next.mode === 'quantite'
        ? document.querySelector('#intake-form [data-quantity-value]') : null;
      (nextControl || document.querySelector('#intake-form [name=category]'))?.focus({ preventScroll:true });
    }
  });
}

async function encodePhoto(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Cette photo ne peut pas être lue. Choisissez un fichier JPEG ou PNG.'));
      image.src = url;
    });
    const factor = Math.min(1, 1250 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .74);
  } finally { URL.revokeObjectURL(url); }
}

function catalogGallery(info, selected, picker = false) {
  const images = catalogImages(info).filter(image => picker || selected == null || selected.includes(image.url));
  if (!images.length) return '';
  return `<section class="photo-section" aria-label="Images de référence">
    <p class="photo-caption">Images de référence · état de l’exemplaire à vérifier</p>
    <div class="photo-grid">${images.map(image => {
      const checked = selected?.includes(image.url);
      return `<div class="photo-tile" data-catalog-image>
        <img src="${esc(image.url)}" alt="${esc(image.label)}" referrerpolicy="no-referrer" loading="lazy">
        ${picker ? `<label class="check"><input type="checkbox" name="catalog_images" value="${esc(image.url)}" ${checked ? 'checked' : 'disabled'} > Utiliser · ${esc(image.label)}</label>` : ''}
        <small><a href="${esc(image.link)}" target="_blank" rel="noopener noreferrer">${esc(image.source)}</a></small>
      </div>`;
    }).join('')}</div>
  </section>`;
}

function watchCatalogImages(container) {
  container.querySelectorAll('[data-catalog-image]').forEach(tile => {
    const image = tile.querySelector('img');
    const input = tile.querySelector('input');
    const loaded = () => { if (input) input.disabled = false; };
    const unavailable = () => {
      if (input?.checked) {
        image.hidden = true;
        return;
      }
      tile.hidden = true;
      const section = tile.closest('.photo-section');
      if (!section.querySelector('[data-catalog-image]:not([hidden])')) section.hidden = true;
    };
    image.addEventListener('load', loaded, { once:true });
    image.addEventListener('error', unavailable, { once:true });
    if (image.complete) (image.naturalWidth ? loaded : unavailable)();
  });
}

function ownGallery(photos, picker = false) {
  if (!photos.length) return '';
  return `<section class="photo-section" aria-label="Photos de l’exemplaire">
    <p class="photo-caption">Photos de l’exemplaire</p><div class="photo-grid">
    ${photos.map((photo, index) => `<div class="photo-tile">
      <img src="${esc(photo)}" alt="Photo de l’exemplaire ${index + 1}" loading="lazy">
      ${picker ? `<label class="check"><input type="checkbox" name="keep_photos" value="${index}" checked> Garder la photo ${index + 1}</label>` : ''}
    </div>`).join('')}</div>
  </section>`;
}

const photoInput = () => field('Ajouter des photos de l’exemplaire', input('photos', 'type="file" accept="image/*" multiple'));

async function photoFormData(data, existing = []) {
  const keep = data.getAll('keep_photos').map(index => existing[Number(index)]).filter(Boolean);
  const files = data.getAll('photos').filter(file => file.size > 0);
  if (keep.length + files.length > maxItemPhotos) throw new Error('Gardez au plus trois photos de l’exemplaire.');
  for (const file of files) keep.push(await encodePhoto(file));
  return { photos:keep, catalog_images:data.getAll('catalog_images') };
}

function descriptionField(value) {
  return field('Descriptif', `<textarea name="description" maxlength="1200" rows="3">${esc(value)}</textarea>`);
}

function effectiveReference(row) {
  return row.reference_confirmed ? row.reference : { ...catalogPrefill(row.catalog), ...row.reference };
}

function referenceInputs(category, values) {
  return `<div class="form-row">${referenceFields(category).map(([name, label]) =>
    field(label, input('ref_' + name, `maxlength="120" value="${esc(values?.[name])}"`))).join('')}</div>`;
}

function formReference(data, category) {
  return Object.fromEntries(referenceFields(category).map(([key]) => [key, data.get('ref_' + key)]));
}

function referenceCard(category, values) {
  if (!values) return '';
  const facts = referenceFields(category).filter(([name]) => values[name]);
  if (!facts.length) return '';
  return `<section class="catalog-card" aria-label="Caractéristiques de la fiche">
    <h2>Caractéristiques de la fiche</h2>
    <dl>${facts.map(([name, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(values[name])}</dd></div>`).join('')}</dl>
  </section>`;
}

function catalogCard(info, showTitle = false) {
  if (!info) return '';
  const source = catalogSource(info);
  if (!source) return '';
  const primary = [
    ['Auteur', info.author], ['Éditeur', info.publisher],
    ['Pagination', info.pages ? info.pages + ' pages' : info.pagination],
    ['Marque', info.brand], ['Modèle', info.model],
  ];
  const additional = [
    ['Parution', info.published], ['Édition', info.edition], ['Collection', info.collection],
    ['Format', info.format], ['Conditionnement', info.packaging],
  ];
  const facts = (showTitle ? [...primary, ...additional] : additional).filter(([, value]) => value);
  const description = showTitle ? catalogDescription(info) : '';
  return `<section class="catalog-card" aria-label="Informations du catalogue">
    ${showTitle ? `<h2>${esc(info.title || 'Référence trouvée')}</h2>` : ''}
    ${facts.length ? `<dl>${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
    ${description ? `<p class="item-description">${esc(description)}</p>` : ''}
    ${showTitle ? catalogGallery(info) : ''}
    <p class="catalog-source">Source <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a>
    ${info.updated ? ` · Notice du ${esc(info.updated)}` : ''}
    ${info.retrieved ? ` · Consultée le ${esc(info.retrieved.split('-').reverse().join('/'))}` : ''}</p>
  </section>`;
}

function scanPage(main) {
  const canFlip = handheld.matches || window.matchMedia('(pointer: coarse)').matches;
  main.innerHTML = header('Scanner', 'Retrouvez une fiche ou identifiez un objet par son code.')
    + `<section class="scan-panel" aria-label="Lecteur de codes">
      <dialog class="scan-camera-panel" id="scan-camera-panel" aria-labelledby="scan-camera-title" hidden>
        <header class="scan-camera-header">
          <h2 id="scan-camera-title">Scanner un code</h2>
          ${button('Fermer', 'close', 'scan-close')}
        </header>
        <div class="scan-frame" id="scan-frame">
          <div class="scan-reticle" aria-hidden="true"></div>
        </div>
        <footer class="scan-camera-footer">
          <p id="scan-hint" role="status">Ouverture de la caméra…</p>
          <div class="scan-camera-tools">
            <div class="scan-zoom" role="group" aria-label="Zoom">
              ${[[1,'1×'],[1.5,'1,5×'],[2,'2×']].map(([value,label]) =>
                button(label, '', 'scan-zoom-' + value, '', `data-scan-zoom="${value}" aria-pressed="${value === 1}" disabled`)).join('')}
            </div>
            <label class="field scan-device" hidden>Objectif<select id="scan-device" disabled></select></label>
          </div>
          <div class="scan-alternatives">
            ${button('Photo du code', canFlip ? 'camera' : 'image', 'scan-camera-photo')}
            ${button('Saisir le code', '', 'scan-camera-manual')}
          </div>
        </footer>
      </dialog>
      <div class="scan-actions">
        ${button('Ouvrir la caméra', 'scan', 'scan-camera', 'primary')}
        <label class="btn scan-photo">${icon('image', 16)} Lire une photo du code
          <input type="file" id="scan-photo" accept="image/*">
        </label>
        <label class="btn scan-photo scan-capture">${icon('camera', 16)} Photographier le code
          <input type="file" id="scan-capture" accept="image/*" capture="environment">
        </label>
      </div>
      <form id="scan-form">
        ${field('Référence ou code-barres', input('code', 'id="scan-input" required maxlength="80" autocomplete="off" autocapitalize="characters" placeholder="Ex. OBJ-03588BDF51"'))}
        <button type="submit" class="btn">${icon('search', 16)} Rechercher</button>
        <div class="form-error" role="alert"></div>
      </form>
      <div id="scan-error" class="form-error" role="alert"></div>
    </section><section id="scan-results" class="scan-results" aria-live="polite"></section>`;
  const codeInput = document.getElementById('scan-input');
  const target = document.getElementById('scan-results');
  const cameraError = document.getElementById('scan-error');
  const cameraPanel = document.getElementById('scan-camera-panel');
  const cameraSelect = document.getElementById('scan-device');
  const frame = document.getElementById('scan-frame');
  const hint = document.getElementById('scan-hint');
  const zoomButtons = [...cameraPanel.querySelectorAll('[data-scan-zoom]')];
  let zoomCamera;
  let lookup = 0;
  if (!handheld.matches) codeInput.focus({ preventScroll:true });

  async function renderResult(rawCode) {
    const current = ++lookup;
    const key = normalizeScanCode(rawCode);
    target.innerHTML = '';
    if (!key) throw new Error('Saisissez une référence ou un code-barres.');
    const rows = await api('/stock/scan?code=' + encodeURIComponent(key));
    if (!target.isConnected || current !== lookup) return;
    if (rows.length === 1 && rows[0].code.toUpperCase() === key.toUpperCase()) {
      target.innerHTML = recentEntries(rows);
      bindStock(target);
      await detail(rows[0].id);
      return;
    }

    const type = catalogType(key);
    let info = rows.find(row => row.catalog?.code === key)?.catalog;
    const referenceRow = rows.filter(row => row.reference)
      .sort((a, b) => (b.reference_updated_at || '').localeCompare(a.reference_updated_at || ''))[0];
    target.innerHTML = (rows.length ? recentEntries(rows) : '')
      + referenceCard(referenceRow?.category, referenceRow?.reference)
      + '<div id="scan-catalog"></div>'
      + (allowed('reception', 'tri')
        ? button(rows.length ? 'Ajouter un autre exemplaire' : 'Créer une fiche', 'plus', 'scan-add', 'primary')
        : '');
    bindStock(target);
    const catalog = target.querySelector('#scan-catalog');
    const add = target.querySelector('#scan-add');

    function display(message) {
      catalog.innerHTML = info ? catalogCard(info, true) : message ? `<p class="notice">${esc(message)}</p>` : '';
      watchCatalogImages(catalog);
      if (info && add && !rows.length) add.innerHTML = icon('plus', 16) + ' Créer la fiche préremplie';
    }

    on('scan-add', () => receive({
      barcode:key, title:rows[0]?.title || info?.title || [info?.brand, info?.model].filter(Boolean).join(' '),
      category:referenceRow?.category || rows[0]?.category || (type === 'book' ? 'Livres' : ''),
      catalog:info, reference:referenceRow?.reference, referenceConfirmed:referenceRow?.reference_confirmed,
    }));

    if (info?.retrieved || !type) {
      display(rows.length ? '' : 'Aucune fiche pour ce code.');
      return;
    }

    display('Recherche dans le catalogue…');
    lookupCatalog(key).then(result => {
      if (!target.isConnected || current !== lookup) return;
      info = result || info;
      display(rows.length ? '' : 'Aucune information de catalogue trouvée pour ce code.');
    }).catch(() => {
      if (target.isConnected && current === lookup) display('Catalogue indisponible. La saisie manuelle est disponible.');
    });
  }
  formSubmit('scan-form', data => {
    endScan();
    cameraError.textContent = '';
    return renderResult(data.get('code').trim());
  });
  async function readScanPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    endScan();
    const current = ++lookup;
    target.innerHTML = '';
    cameraError.textContent = '';
    const url = URL.createObjectURL(file);
    let code;
    try {
      await loadScanner();
      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      code = (await reader.decodeFromImageUrl(url)).getText();
    } catch {
      if (target.isConnected && current === lookup) {
        cameraError.textContent = 'Code illisible sur cette photo. Essayez une photo rapprochée ou saisissez le code.';
      }
      return;
    } finally { URL.revokeObjectURL(url); }
    if (!target.isConnected || current !== lookup) return;
    codeInput.value = code;
    await renderResult(code);
  }
  on('scan-photo', readScanPhoto, 'change');
  on('scan-capture', readScanPhoto, 'change');

  async function cameraOptions(track, choice, stillActive) {
    const settings = track.getSettings?.() || {};
    const devices = (await navigator.mediaDevices.enumerateDevices?.().catch(() => []) || [])
      .filter(device => device.kind === 'videoinput' && device.deviceId);
    if (!stillActive()) return;

    const actualDevice = devices.find(device => device.deviceId === settings.deviceId)
      || devices.find(device => 'device:' + device.deviceId === choice);
    const selected = actualDevice ? 'device:' + actualDevice.deviceId : settings.facingMode === 'user' ? 'front' : choice;
    cameraSelect.innerHTML = option('auto', 'Arrière (automatique)', selected)
      + (canFlip || settings.facingMode === 'user' ? option('front', 'Avant (automatique)', selected) : '')
      + devices.map((device, index) => option('device:' + device.deviceId, device.label || 'Caméra ' + (index + 1), selected)).join('');
    cameraSelect.parentElement.hidden = devices.length < 2 && !canFlip;
    cameraSelect.disabled = false;
  }

  async function startCamera(choice = preferredCamera) {
    cameraError.textContent = '';
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      cameraError.textContent = 'Caméra indisponible ici. Ouvrez Seconde Vie dans Chrome ou Safari, ou utilisez une photo du code.';
      return;
    }

    let active = true;
    let stream, stopReading, hintTimer;
    let digitalZoom = 1;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    const release = () => stream?.getTracks().forEach(track => track.stop());
    stopCamera = () => {
      active = false;
      stopReading?.();
      clearTimeout(hintTimer);
      release();
      video.srcObject = null;
      video.remove();
      if (cameraPanel.open && typeof cameraPanel.close === 'function') cameraPanel.close();
      cameraPanel.hidden = true;
      cameraSelect.disabled = true;
      zoomCamera = null;
    };

    hint.textContent = 'Ouverture de la caméra…';
    cameraSelect.parentElement.hidden = true;
    zoomButtons.forEach(item => {
      item.disabled = true;
      item.setAttribute('aria-pressed', String(item.dataset.scanZoom === '1'));
    });
    cameraPanel.hidden = false;
    if (typeof cameraPanel.showModal === 'function') cameraPanel.showModal();
    document.getElementById('scan-close').focus({ preventScroll:true });

    try {
      await loadScanner();
      if (!active) return;
      const lens = choice.startsWith('device:') ? { deviceId:{ exact:choice.slice(7) } }
        : choice === 'front' ? { facingMode:{ exact:'user' } } : { facingMode:{ ideal:'environment' } };
      const videoConstraints = { ...lens, width:{ ideal:1920 }, height:{ ideal:1080 } };
      stream = await media.getUserMedia({ audio:false, video:videoConstraints });
      if (!active) { release(); return; }

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Caméra indisponible.');
      const capabilities = track.getCapabilities?.() || {};
      const focus = capabilities.focusMode?.includes('continuous') ? { focusMode:'continuous' } : null;
      const baseConstraints = track.getConstraints?.() || videoConstraints;
      const focusReady = focus ? track.applyConstraints({ ...baseConstraints, advanced:[focus] }).catch(() => {}) : Promise.resolve();
      track.addEventListener('ended', () => {
        if (!active) return;
        endScan();
        cameraError.textContent = 'La caméra s’est arrêtée. Vous pouvez la rouvrir ou utiliser une photo.';
      }, { once:true });

      frame.prepend(video);
      video.srcObject = stream;
      await video.play();
      if (!active) return;

      const baseline = track.getSettings?.().zoom || 1;
      zoomCamera = async value => {
        zoomButtons.forEach(item => { item.disabled = true; });
        let optical = 1;
        const range = capabilities.zoom;
        if (Number.isFinite(range?.min) && Number.isFinite(range?.max)) {
          await focusReady;
          if (!active) return;
          const zoom = Math.min(range.max, Math.max(range.min, value * baseline));
          await track.applyConstraints({ ...baseConstraints, advanced:[{ ...focus, zoom }] }).catch(() => {});
          optical = (track.getSettings?.().zoom || baseline) / baseline;
        }
        if (!active) return;
        digitalZoom = Math.max(1, value / optical);
        video.style.transform = 'scale(' + digitalZoom + ')';
        zoomButtons.forEach(item => {
          item.disabled = false;
          item.setAttribute('aria-pressed', String(Number(item.dataset.scanZoom) === value));
        });
      };
      zoomButtons.forEach(item => { item.disabled = false; });
      hint.textContent = 'Cadrez le code entier, avec un peu de marge autour.';
      hintTimer = setTimeout(() => {
        hint.textContent = 'Code petit ou flou ? Essayez 1,5×, reculez légèrement ou changez d’objectif.';
      }, 5500);

      const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      stopReading = scanCameraFrames(video, reader, () => digitalZoom, code => {
        if (!active) return;
        endScan();
        codeInput.value = code;
        renderResult(code).catch(error => { cameraError.textContent = error.message; });
      });
      preferredCamera = choice;
      await cameraOptions(track, choice, () => active);
    } catch (error) {
      if (!active) return;
      endScan();
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        cameraError.textContent = 'Accès caméra refusé. Vérifiez l’autorisation du site dans Chrome ou Safari, ou utilisez une photo du code.';
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        preferredCamera = 'auto';
        cameraError.textContent = 'Cette caméra est indisponible. Rouvrez la caméra pour réessayer en mode automatique.';
      } else if (error.name === 'NotReadableError') {
        cameraError.textContent = 'Impossible d’utiliser la caméra. Fermez les autres apps qui l’utilisent, puis réessayez.';
      } else {
        cameraError.textContent = 'Impossible d’ouvrir la caméra. Vous pouvez photographier le code ou le saisir.';
      }
    }
  }

  on('scan-camera', () => stopCamera ? endScan() : startCamera());
  on('scan-close', endScan);
  cameraPanel.addEventListener('cancel', event => { event.preventDefault(); endScan(); });
  cameraPanel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && typeof cameraPanel.showModal !== 'function') endScan();
  });
  zoomButtons.forEach(item => item.addEventListener('click', () => zoomCamera?.(Number(item.dataset.scanZoom))));
  document.getElementById('scan-camera-photo').addEventListener('click', () => {
    endScan();
    document.getElementById(canFlip ? 'scan-capture' : 'scan-photo').click();
  });
  on('scan-camera-manual', () => { endScan(); codeInput.focus(); });
  on('scan-device', event => {
    const choice = event.target.value;
    endScan();
    return startCamera(choice);
  }, 'change');
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
  const photos = itemPhotos(r);
  const description = r.description ?? catalogDescription(r.catalog);
  showDialog(r.title,`<div class="stack">
    <div class="card-line">${categoryTile(r.category)}<strong class="detail-code">${esc(r.code)}</strong>${status(r)}</div>
    ${ownGallery(photos)}
    ${catalogGallery(r.catalog, r.catalog_images || [])}
    <div class="notice">${esc(r.category)} · ${esc(measure(r))}${r.price_cents != null ? ' · '+euro.format(r.price_cents/100) : ''}<br>${r.state==='transit' ? 'En déplacement' : esc([r.site_name,r.zone_name].filter(Boolean).join(' / '))}
    ${r.parent_code ? '<br>Lot d’origine '+esc(r.parent_code) : ''}${r.condition ? '<br>État · '+esc(r.condition) : ''}${r.barcode ? '<br>Code fabricant · '+esc(r.barcode) : ''}</div>
    ${r.note ? '<p class="help">'+esc(r.note)+'</p>' : ''}
    ${catalogCard(r.catalog)}
    ${referenceCard(r.category, effectiveReference(r))}
    ${description ? `<section aria-label="Descriptif"><h3>Descriptif</h3><p class="item-description">${esc(description)}</p></section>` : ''}
    <div class="detail-actions">
      ${active && allowed('tri','atelier') ? button('Marquer prêt','check','detail-ready','primary') : ''}
      ${active && control ? button('Mettre à vérifier','wrench','detail-block') : ''}
      ${active && r.kind === 'lot' && allowed('tri','reception') ? button('Isoler un objet','plus','detail-isolate') : ''}
      ${active && allowed('stock','tri','atelier') ? button('Ranger dans une zone','pin','detail-move') : ''}
      ${active && allowed('stock','tri') && sites.length > 1 ? button('Transférer','truck','detail-transfer') : ''}
      ${active && allowed('stock','vente') ? button('Enregistrer une sortie','arrow','detail-exit','danger') : ''}
      ${button('Imprimer l’étiquette','printer','print-label')}
      ${active && control ? button('Modifier le descriptif','info','detail-reference') : ''}
      ${active && control ? button(photos.length || r.catalog_images?.length ? 'Gérer les photos' : 'Ajouter des photos','camera','detail-photo') : ''}
    </div>
    ${page === 'scanner' ? button('Retour au scanner', 'scan', 'detail-scan', 'ghost') : ''}
    <details><summary>Historique · ${r.history.length} actions</summary><ul class="log">${r.history.map(e=>`<li>${esc(e.detail)}<span>${esc(e.name)} · ${date(e.created_at)}</span></li>`).join('')}</ul></details>
  </div>`);
  on('print-label',()=>printLabel(r));
  on('detail-scan', () => {
    closeDialog();
    document.getElementById('scan-camera')?.focus();
  });
  on('detail-block',()=>actionForm(r,'block','Mettre de côté',field('Motif du contrôle','<textarea name="note" required maxlength="500" placeholder="Ex. câble abîmé"></textarea>'),d=>({note:d.get('note')})));
  on('detail-ready',()=>actionForm(r,'ready','Valider le tri',field('État constaté',input('condition',`maxlength="100" placeholder="Ex. Testé, fonctionne" value="${esc(r.condition)}"`)) + field('Prix (€)',input('price',`type="number" min="0" step="0.01" value="${r.price_cents == null ? '' : r.price_cents/100}"`)),d=>({condition:d.get('condition'),price_cents:d.get('price') !== '' ? Math.round(Number(d.get('price'))*100) : null})));
  on('detail-move',()=>actionForm(r,'move','Changer de zone',field('Zone',`<select name="zone_id" required>${zones(r.site_id,'','Choisir une zone')}</select>`),d=>({zone_id:d.get('zone_id')})));
  on('detail-reference', () => actionForm(r, 'reference', 'Descriptif et caractéristiques',
    referenceInputs(r.category, effectiveReference(r)) + descriptionField(description),
    data => ({ reference:formReference(data, r.category), description:data.get('description') })));
  on('detail-photo', () => actionForm(r, 'photo', 'Photos de la fiche',
    ownGallery(photos, true) + photoInput() + catalogGallery(r.catalog, r.catalog_images || [], true),
    data => photoFormData(data, photos)));

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
function downloadStock() {
  const columns = ['code','title','category','kind','state','site_name','zone_name','quantity','grams','price_cents','barcode','parent_code'];
  const csv = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  const content = [columns.join(';'), ...stock.map(row => columns.map(key => csv(row[key])).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'stock-seconde-vie-demo.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function printLabel(row) {
  const svg = await makeQr(row.code, {type:'svg',margin:4});
  const section = document.createElement('section');
  section.className = 'print-label';
  section.innerHTML = `<h2>${esc(row.title)}</h2><p>${esc(row.code)}${row.price_cents == null ? '' : ' · ' + euro.format(row.price_cents/100)}</p>${svg}`;
  document.body.append(section);
  document.body.classList.add('printing');
  window.addEventListener('afterprint',()=>{
    document.body.classList.remove('printing');
    section.remove();
  },{once:true});
  window.print();
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
    ${member ? '' : field('Nom',input('name','maxlength="100" required')) + field('E-mail fictif',input('email','type="email" maxlength="254" placeholder="exemple@example.test" required'))}
    <fieldset><legend>Fonctions</legend><div class="form-row">${Object.entries(roleNames).map(([id,label])=>`<label class="check"><input type="checkbox" name="roles" value="${id}" ${roles.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset>
    ${member && member.id !== me.id ? `<label class="check"><input type="checkbox" name="active" ${member.active?'checked':''}> Compte actif</label>` : ''}
    ${formEnd('Enregistrer')}</form>`);
  formSubmit('member-form',async d=>{
    const body = { roles:d.getAll('roles') };
    if (member) body.active = member.id === me.id || d.has('active');
    else Object.assign(body,{name:d.get('name'),email:d.get('email')});
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
    <div class="tabs">${s.zones.map(z=>`<span class="pill">${esc(z.name)}</span>`).join('') || '<small>Aucune zone renseignée.</small>'}</div>
    <p>${siteCategories(s).length} catégories acceptées à la réception</p>
    ${admin() ? button('Régler les catégories', 'sort', 'categories-' + s.id) : ''}</article>`).join('') + '</div>';
  sites.forEach(site => on('categories-' + site.id, () => siteCategoryForm(site)));
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

function siteCategoryForm(site) {
  const enabled = siteCategories(site);
  showDialog('Catégories · ' + site.name, `<form id="site-category-form">
    <p class="help">Cochez les catégories que ce site accepte à la réception. Les fiches existantes restent dans le stock.</p>
    <fieldset><legend>Catégories acceptées</legend>
      <div class="category-settings">${allCategories().map(name => `<label class="check category-setting">
        <input type="checkbox" name="categories" value="${esc(name)}" ${enabled.includes(name) ? 'checked' : ''}>
        ${categoryTile(name)} <span>${esc(name)}</span>
      </label>`).join('')}</div>
    </fieldset>
    <details><summary>Créer une catégorie</summary><div class="stack">
      ${field('Nom de la catégorie', input('custom_name', 'maxlength="40" placeholder="Ex. Outillage"'))}
      <div class="form-row">
        ${field('Pictogramme', `<select name="custom_icon">${Object.entries(pictograms).map(([id,label]) => option(id,label,'box')).join('')}</select>`)}
        ${field('Couleur', `<select name="custom_color">${Object.entries(colors).map(([id,label]) => option(id,label,'neutral')).join('')}</select>`)}
      </div>
    </div></details>
    ${formEnd('Enregistrer les catégories')}
  </form>`);
  formSubmit('site-category-form', async data => {
    const name = data.get('custom_name').trim();
    const custom = name ? { name, icon:data.get('custom_icon'), color:data.get('custom_color') } : null;
    await api('/sites/' + site.id, { method:'PATCH', body:{ categories:data.getAll('categories'), custom } });
    config = await api('/config');
    await changed('Catégories mises à jour pour ' + site.name + '.');
  });
}

async function init() {
  try {
    config = await api('/config');
    await api('/login', { method: 'POST' });
    await startWorkspace();
  } catch (error) {
    root.innerHTML = '<main class="content"><div class="surface empty"><h1>Connexion indisponible</h1><p>Rechargez la page pour réessayer.</p></div></main>';
    report(error);
  }
}
init();
