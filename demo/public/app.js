import {compressProductPhoto} from './product-photo.js';
import {mountCommerce,catalogueSettings} from './commerce-page.js';
import {bindPhotoOrder} from './photo-order.js';
import {mountIntakePricing} from './intake-pricing.js';
import {shortcutKeys as keyboardKeys,shortcutLabel,keyboardAction} from './keyboard.js';
import {functionalityOptions} from './condition.js';
import {mountProductAssist} from './product-assist.js';
import { canOpen as baseCanOpen, hasRole, roleNames, organisations, demoPhoto } from './access.js';
import { discountCents } from './checkout.js';
import { readBasket, saveBasket } from './basket.js';
import { readIntakeDraft, saveIntakeDraft, clearIntakeDraft } from './intake-draft.js';
import { flowLabels, workshopTypes } from './activity.js';
import { api, demoMode, selectWorkspace, leaveStation, isModuleEnabled, currentRevision } from './client.js';
import { setupWorkspace, corePages } from './foundation.js';
import { moduleForPage as optionalModuleForPage, firstAvailablePage } from './modules.js';
import { operationsPages } from './operations-pages.js';
import { mountPlanning } from './planning-page.js';
import { code128Svg } from './barcode.js';
import { toString as qrSvg } from './vendor/qrcode/index.js';
import { icon } from './icons.js';
import { scanCameraFrames } from './scanner.js';
import { pageCountValue, referenceFields } from './reference.js';
import { catalogDescription, catalogImages, catalogPrefill, catalogSource, catalogType, lookupCatalog, normalizeScanCode } from './catalog.js';
import { itemPhotos, maxItemPhotos } from './photos.js';
import { acceptedCategories, categoryIcons, colors, pictograms } from './categories.js';
import { matchesObjectType } from './object-types.js';
import { priceEstimate } from './pricing.js';
import { bindMarket } from './market.js';

document.addEventListener('error',event=>{if(event.target?.matches?.('img[data-stock-cover]'))event.target.remove();},true);
const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toastArea = document.querySelector('#toast');
const moduleForPage=optionalModuleForPage;
const canOpen=(member,key)=>baseCanOpen(member,key) && (!moduleForPage[key] || isModuleEnabled(config,moduleForPage[key]));
const pageNames = { documents:'Devis et factures', adhesions:'Adhésions', imports:'Importer du stock', indisponible:'Accès aux postes', contacts:'Contacts', reglages:'Réglages', accueil: 'Réception', scanner: 'Scanner', caisse: 'Caisse', stock: 'Stock', controle: 'À vérifier', transferts: 'Transferts', planning: 'Planning', tournees: 'Tournées', rapports: 'Rapports', registre: 'Préparer le registre', boutiques:'Vente en ligne', vitrine: 'Catalogue', equipe: 'Équipe', sites: 'Sites et zones' };
const statusNames = { tri: 'À trier', controle: 'À vérifier', pret: 'Prêt', transit: 'En transit', sorti: 'Sorti' };
const exitNames = { vente: 'Vendu', don: 'Donné', recyclage: 'Recyclage', decheterie:'Déchèterie', reparti: 'Lot réparti' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const searchText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const stockSearchText = row => searchText([row.title, row.category, row.code, row.barcode, row.note].join(' '));
let euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
let dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const cashSite = () => getSite(siteFilter) || sites.find(site => /vente|boutique/i.test(site.kind + ' ' + site.name)) || workingSite();
let config, me, sites = [], stock = [], transfers = [], shifts = [], team = [], contacts = [];
let syncStatus='synced',persistEntry,workspaces=[];
const draftScope=()=>me.org+'-'+me.id;
const inventoryViews = new Map();
const inventoryViewKey = (target = page) => [me?.org, me?.id, target, siteFilter].join(':');
let page = 'accueil', filter = '', search = '', siteFilter = localStorage.getItem('secondevie-site') || '';
let compactNav = localStorage.getItem('secondevie-compact-nav') === 'true';
let detailedIntake = localStorage.getItem('secondevie-detailed-intake') === 'true';
let origins = ['Apport volontaire','Collecte à domicile','Collecte partenaire','Déchèterie','Autre'];
const handheld = window.matchMedia('(max-width: 600px)');
const defaultPage = () => 'accueil';
let stopCamera;
let planningCleanup;
let chooseCashier;
const cameraPreferenceKey = 'secondevie-camera';
let preferredCamera = localStorage.getItem(cameraPreferenceKey) || 'auto';
function rememberCamera(choice) {
  preferredCamera = choice;
  if (choice === 'auto') localStorage.removeItem(cameraPreferenceKey);
  else localStorage.setItem(cameraPreferenceKey, choice);
}
let stopObjectCamera;
const endScan = () => { stopCamera?.(); stopCamera = null; stopObjectCamera?.(); stopObjectCamera = null; };
const admin = () => me?.roles.includes('admin');
const allowed = (...roles) => hasRole(me,...roles);
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

const brand = () => `<div class="brand"><img src="${esc(config?.branding?.logo||'/mark.svg')}" alt=""><div><strong>${esc(config?.branding?.logo ? me?.org_name||'seconde vie' : 'seconde vie')}</strong><span>Votre ressourcerie au quotidien</span></div></div>`;
const macKeys = /Mac|iPad|iPhone/.test(navigator.platform || '');
const shortcutKeys = key => keyboardKeys(key,macKeys);
const keyHint = key => '<kbd class="shortcut-key" aria-hidden="true">'+shortcutLabel(key,macKeys)+'</kbd>';
const keyboardPointer=window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
const showKeyboardHints=()=>document.documentElement.classList.toggle('has-keyboard',keyboardPointer.matches);
showKeyboardHints();keyboardPointer.addEventListener?.('change',showKeyboardHints);
document.addEventListener('keydown',event=>{if(event.key==='Tab'||event.metaKey||event.ctrlKey||event.altKey)document.documentElement.classList.add('has-keyboard');});
function button(label, symbol, id, tone = '', attr = '', shortcut = '') {
  return `<button type="button" class="btn ${tone}" id="${id}" ${attr} ${shortcut ? `aria-keyshortcuts="${shortcutKeys(shortcut)}"` : ''}>${symbol ? icon(symbol, 16) : ''}${esc(label)}${shortcut ? keyHint(shortcut) : ''}</button>`;
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
  if(!demoMode) {
    const value=await api('/snapshot');
    ({sites,stock,transfers,shifts,team,config,me}=value);
    contacts=allowed('reception','stock','administration') && !me.cash_station ? await api('/contacts') : [];
    origins=config.origins || origins;
    euro=new Intl.NumberFormat(config.locale,{style:'currency',currency:config.currency});
    dateFmt=new Intl.DateTimeFormat(config.locale,{dateStyle:'medium',timeStyle:'short',timeZone:config.timeZone});
    if(siteFilter && !getSite(siteFilter))siteFilter='';
    return;
  }
  config=await api('/config');origins=config.origins||origins;euro=new Intl.NumberFormat(config.locale||'fr-FR',{style:'currency',currency:config.currency||'EUR'});
  [sites, stock, transfers, shifts, team] = await Promise.all([
    api('/sites'), allowed('reception','tri','atelier','stock','vente','rapports') ? api('/stock') : [],
    canOpen(me,'transferts') ? api('/transfers') : [], api('/shifts'), admin() ? api('/team') : [],
  ]);
  if (siteFilter && !getSite(siteFilter)) siteFilter = '';
}
async function startWorkspace(fromSignIn = false) {
  me = await api('/me');
  config = await api('/config');
  siteFilter = me.cash_station?.site_id ?? localStorage.getItem('secondevie-site-' + me.org)
    ?? (me.org === 'passages' ? localStorage.getItem('secondevie-site') || '' : '');
  await refresh();
  const roleHome = firstAvailablePage(me,config,{demo:demoMode});
  const requested=location.hash.slice(1);
  go(fromSignIn && !admin() ? canOpen(me,requested) ? requested : roleHome : requested || defaultPage(), true);
}
async function changed(message, draft) {
  if (dialog.hasAttribute('open')) closeDialog();
  me = await api('/me');
  await refresh();
  render(draft);
  notice(message);
}
function go(target, replace = false, nextFilter, draft) {
  if (!canOpen(me,target)) target = firstAvailablePage(me,config,{demo:demoMode}) || 'indisponible';
  if (dialog.hasAttribute('open')) closeDialog();
  page = target;
  const savedView = ['stock','controle'].includes(target) && nextFilter === undefined ? inventoryViews.get(inventoryViewKey(target)) : null;
  filter = nextFilter ?? savedView?.filter ?? '';
  search = savedView?.search ?? '';
  if (nextFilter !== undefined) inventoryViews.delete(inventoryViewKey(target));
  if (location.hash !== '#' + target) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + target);
  render(draft);
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (me) go(location.hash.slice(1), true); });

const nav = (pages) => pages.filter(([key]) => canOpen(me,key)).map(([key, sym]) => `<a href="#${key}" class="navlink ${page === key ? 'active' : ''}" data-page="${key}" aria-label="${pageNames[key]}" title="${pageNames[key]}" ${page === key ? 'aria-current="page"' : ''}>${icon(sym,17)}<span>${pageNames[key]}</span></a>`).join('');
function render(draft) {
  const sidebarScroll = document.getElementById('sidebar')?.scrollTop || 0;
  planningCleanup?.();planningCleanup=null;
  endScan();
  persistEntry=null;
  chooseCashier = null;
  const fieldNav = nav([['accueil','receive'],['scanner','scan'],['caisse','caisse'],['stock','box'],['controle','wrench'],['transferts','truck']]);
  const officeNav = nav([['planning','calendar'],['tournees','truck'],['rapports','dashboard'],['documents','book'],['adhesions','users'],['registre','book'],['vitrine','image'],['boutiques','truck'],['contacts','users'],['imports','upload'],['equipe','users'],['sites','pin'],['reglages','settings']]);
  const quickNav = nav([['accueil','receive'],['scanner','scan'],['caisse','caisse'],['stock','box']])
    || nav([['rapports','dashboard'],['tournees','truck'],['registre','book'],['planning','calendar']]);
  root.innerHTML = `<div class="shell${compactNav ? ' nav-compact' : ''}"><aside class="sidebar" id="sidebar" aria-label="Navigation principale">
    ${brand()}<div class="sidebar-links">
      ${fieldNav ? `<nav class="navgroup"><div class="navtitle">Au quotidien</div>${fieldNav}</nav>` : ''}
      <nav class="navgroup"><div class="navtitle">Organisation</div>${officeNav}</nav>
    </div></aside><button type="button" class="nav-backdrop" id="nav-backdrop" aria-label="Fermer le menu" hidden></button>
    <div class="workspace"><header class="topbar"><div class="topbar-start"><button type="button" id="menu" class="icon-button mobile-menu" aria-label="Menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button><button type="button" id="compact-nav" class="icon-button desktop-menu" aria-controls="sidebar" aria-expanded="${!compactNav}" aria-label="${compactNav ? 'Agrandir' : 'Réduire'} le menu" title="${compactNav ? 'Agrandir' : 'Réduire'} le menu">${icon('sidebar')}</button><div class="breadcrumb"><span class="org">${esc(me.org_name)}</span><span class="org">${icon('chevron',12)}</span><strong>${pageNames[page]}</strong></div></div><div class="topright">${page === 'scanner' ? '' : `<select id="current-site" class="site-switch" ${me.cash_station ? 'disabled' : ''} aria-label="${page === 'accueil' ? 'Site de réception' : 'Filtrer par site'}">${page === 'caisse' ? siteOptions(cashSite()?.id) : page === 'accueil' ? siteOptions(workingSite()?.id) : option('', 'Tous les sites', siteFilter) + siteOptions(siteFilter)}</select>`}
      ${!demoMode ? '<button type="button" class="btn core-sync" id="core-sync" aria-live="polite">Synchronisé</button>' : '<span class="pill">Démonstration</span>'}
      <button type="button" class="btn current-profile" id="switch-profile" aria-label="Changer de profil · ${esc(me.name)}" title="Changer de profil">
        ${profileAvatar(me)}<span><strong>${esc(me.name)}</strong><small>${esc(me.roles.map(role => roleNames[role]).join(' · '))}</small></span>
      </button></div></header>
    <main class="content ${page === 'accueil' ? 'receiving-content' : ''}" id="main"></main>
    <nav class="mobile-nav" aria-label="Actions terrain">${quickNav}</nav></div></div>`;
  const sidebar=document.getElementById('sidebar');
  sidebar.scrollTop = sidebarScroll;
  if(/^#[0-9a-f]{6}$/i.test(config?.branding?.color||'')) {
    sidebar.style.backgroundColor=config.branding.color;
    const rgb=config.branding.color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    sidebar.classList.toggle('brand-light',.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179);
  }
  document.querySelectorAll('[data-page]').forEach(a => a.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(a.dataset.page);
  }));
  if(!demoMode) {
    const badge=document.getElementById('core-sync');
    updateSyncBadge();
    on('core-sync',syncWorkspace);
  }
  on('switch-profile', () => me.cash_station && chooseCashier ? chooseCashier() : switchProfile());
  on('menu', e => {
    const isOpen = document.querySelector('#sidebar').classList.toggle('open');
    document.getElementById('menu').setAttribute('aria-expanded', String(isOpen));
    document.getElementById('nav-backdrop').hidden=!isOpen;
  });
  const closeMenu=()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('nav-backdrop').hidden=true;document.getElementById('menu').setAttribute('aria-expanded','false');document.getElementById('menu').focus();};
  on('nav-backdrop',closeMenu);
  root.onkeydown=e=>{if(e.key==='Escape'&&document.getElementById('sidebar')?.classList.contains('open')){e.preventDefault();closeMenu();}};
  on('compact-nav', e => {
    compactNav = !compactNav;
    root.querySelector('.shell').classList.toggle('nav-compact', compactNav);
    const label = (compactNav ? 'Agrandir' : 'Réduire') + ' le menu';
    const toggle = e.target.closest('button');
    toggle.setAttribute('aria-expanded', String(!compactNav));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    localStorage.setItem('secondevie-compact-nav', String(compactNav));
  });
  on('current-site', e => { siteFilter = e.target.value; localStorage.setItem('secondevie-site-' + me.org,siteFilter); render(); }, 'change');
  const main = document.querySelector('#main');
  if(['documents','adhesions','imports'].includes(page)) {
    const tools=operationTools();
    Promise.resolve(page==='documents'?tools.documentsPage(main):page==='adhesions'?tools.membershipsPage(main):tools.importsPage(main)).catch(report);
  }
  if (page === 'indisponible') main.innerHTML=header('Aucun poste actif pour votre compte','Demandez au responsable de vérifier vos fonctions et les outils activés pour la ressourcerie.');
  if (page === 'accueil') home(main, draft);
  if (page === 'scanner') scanPage(main);
  if (page === 'caisse') cashPage(main);
  if (page === 'stock' || page === 'controle') inventory(main);
  if (page === 'transferts') transferPage(main);
  if (page === 'planning') planningPage(main);
  if (page === 'vitrine') storefrontPage(main);
  if(page==='boutiques')mountCommerce(main,{api,esc,euro,header,button,showDialog,formSubmit,formEnd,field,input,notice,config,me,stock,changed,demo:demoMode}).catch(report);
  if (page === 'tournees') toursPage(main);
  if (page === 'rapports' || page === 'registre') activityPage(main, page === 'registre');
  if (page === 'equipe') teamPage(main);
  if (page === 'sites') sitePage(main);
  if(['contacts','reglages'].includes(page)) {
    const pages=corePages({api,esc,field,input,button,formEnd,formSubmit,showDialog,header,changed,config,me,option,date,notice,demo:demoMode});
    Promise.resolve(page==='contacts' ? pages.contactsPage(main) : pages.settingsPage(main)).catch(report);
  }
}

function showCashTicket(sale, site) {
  const price = cents => euro.format(cents / 100);
  const ticket = `<h3>${esc(site.name)}</h3>
    <p class="help">${esc(dateFmt.format(new Date(sale.created_at)))} · ${esc(sale.id.slice(0, 8).toUpperCase())}</p>
    <ul class="cash-list">${sale.lines.map(line => `<li><span>${line.quantity > 1 ? line.quantity + ' × ' : ''}${esc(line.title)}</span><strong>${price(line.price_cents)}</strong></li>`).join('')}</ul>
    ${sale.discount_cents ? `<p>Sous-total ${price(sale.subtotal_cents)} · Remise −${price(sale.discount_cents)}</p>` : ''}
    <p class="cash-total"><span>Total</span><strong>${price(sale.total_cents)}</strong></p>
    <p>Paiement reçu · ${esc(sale.payment)}</p>
    ${sale.operator_name ? `<p>En caisse · ${esc(sale.operator_name)}</p>` : ''}
    ${sale.received_cents == null ? '' : `<p>Reçu ${price(sale.received_cents)} · Rendu ${price(sale.change_cents)}</p>`}
    <p class="help">Ticket de démonstration</p>`;
  showDialog('Ticket de vente', `<div class="stack">${ticket}${button('Imprimer le ticket', 'printer', 'cash-print')}</div>`);
  on('cash-print', () => printContent(ticket));
}

function showHardware(testCamera, site) {
  showDialog('Matériel du poste', `<div class="stack">
    <section class="stack">
      <h3>Douchette USB ou Bluetooth</h3>
      <p class="help">Branchez-la ou associez-la dans les réglages de votre appareil. Choisissez le mode clavier (HID) avec Entrée après le code pour lancer la recherche automatiquement.</p>
      ${field('Tester la douchette', input('reader-test', 'id="reader-test" autocomplete="off" maxlength="120" placeholder="Cliquez ici puis scannez une étiquette"'))}
      <p id="reader-result" class="help" aria-live="polite"></p>
    </section>
    <section class="stack">
      <h3>Caméra</h3>
      <p class="help" id="camera-preference">${preferredCamera === 'auto' ? 'Caméra arrière ou webcam automatique.' : 'Votre choix de caméra est mémorisé sur ce navigateur.'}</p>
      <div class="tabs">
        ${testCamera ? button('Tester et choisir une caméra', 'camera', 'hardware-camera')
          : '<a class="btn" href="#scanner" id="hardware-scanner">Ouvrir le Scanner</a>'}
        ${button('Revenir au choix automatique', '', 'hardware-reset-camera', '', preferredCamera === 'auto' ? 'hidden' : '')}
      </div>
    </section>
    <section class="stack">
      <h3>Terminal de paiement</h3>
      <p class="help">Le branchement seul ne configure pas la liaison caisse. Le mode autonome reste disponible pour tout terminal.</p>
      ${site ? button('Configurer le terminal', 'caisse', 'hardware-terminal')
        : '<a class="btn" href="#caisse" id="hardware-cash">Ouvrir la caisse</a>'}
    </section>
  </div>`);
  const test = dialog.querySelector('#reader-test');
  const result = dialog.querySelector('#reader-result');
  test.addEventListener('input', () => {
    result.textContent = test.value.trim() ? 'Caractères reçus · ' + test.value.trim() : '';
  });
  test.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || !test.value.trim()) return;
    event.preventDefault();
    result.textContent = 'Code reçu avec Entrée · ' + test.value.trim();
    test.select();
  });
  on('hardware-reset-camera', () => {
    rememberCamera('auto');
    dialog.querySelector('#camera-preference').textContent = 'Caméra arrière ou webcam automatique.';
    dialog.querySelector('#hardware-reset-camera').hidden = true;
  });
  on('hardware-scanner', closeDialog);
  on('hardware-cash', closeDialog);
  on('hardware-terminal', () => showTerminalSettings(site));
  on('hardware-camera', () => { closeDialog(); testCamera(); });
}

function showTerminalSettings(site) {
  const storageKey = 'secondevie-terminal-' + site.id;
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  showDialog('Terminal de paiement · ' + site.name, `<form id="terminal-settings" class="stack">
    ${field('Type de terminal', `<select name="provider">
      ${option('manual', 'Utiliser mon terminal actuel · mode autonome', saved.provider)}
      ${option('sumup', 'SumUp Solo · recherche par compte', saved.provider)}
      ${option('stripe', 'Stripe Terminal · recherche par compte', saved.provider)}
      ${option('local', 'Décrire une liaison caisse · toutes marques', saved.provider)}
    </select>`)}
    ${field('Modèle ou nom du poste (facultatif)', input('model', `maxlength="100" value="${esc(saved.model)}" placeholder="Ex. Ingenico Desk 5000"`))}
    <div id="terminal-link" class="stack" hidden>
      ${field('Banque ou fournisseur (facultatif)', input('supplier', `maxlength="100" value="${esc(saved.supplier)}" placeholder="Ex. ma banque, Worldline, Nepting ou Yavin"`))}
      ${field('Type de liaison', `<select name="link">${[
        ['unknown','Je ne sais pas encore'], ['ethernet','Ethernet (réseau local)'], ['wifi','Wi-Fi (réseau local)'],
        ['usb','USB'], ['serial','Port série (RS-232)'], ['bluetooth','Bluetooth'],
        ['cloud','API du fournisseur (Internet)'], ['other','Autre liaison']
      ].map(([value,label]) => option(value, label, saved.link)).join('')}</select>`)}
      ${field('Protocole indiqué par le fournisseur (facultatif)', input('protocol', `maxlength="100" value="${esc(saved.protocol)}" placeholder="Ex. Concert V3"`))}
    </div>
    <p class="help" id="terminal-help"></p>
    <div id="terminal-discovery" class="stack" hidden>
      ${button('Rechercher les lecteurs associés', '', 'terminal-find')}
      <div id="terminal-readers"></div>
      <p id="terminal-status" class="help" role="status"></p>
    </div>
    <p class="help">Dans cette démo, même si un lecteur est trouvé, le montant est saisi sur le terminal et le paiement confirmé à la main.</p>
    ${formEnd('Enregistrer pour ce site')}
  </form>`);
  const form = dialog.querySelector('#terminal-settings');
  const provider = form.elements.provider;
  const discovery = form.querySelector('#terminal-discovery');
  const readers = form.querySelector('#terminal-readers');
  const status = form.querySelector('#terminal-status');
  const find = form.querySelector('#terminal-find');
  let selected = saved.reader || '';
  let search = 0;
  const instructions = {
    manual:'Saisissez le montant sur le terminal, puis confirmez après acceptation.',
    local:'Profil matériel seulement. Le branchement et l’encaissement automatique nécessitent un connecteur compatible avec ce modèle.',
    sumup:'Associez d’abord le Solo au compte marchand SumUp. La recherche utilise la clé et le code marchand configurés côté serveur.',
    stripe:'Enregistrez d’abord le lecteur dans Stripe Terminal. La recherche utilise la clé configurée côté serveur.'
  };
  function update() {
    search++;
    find.disabled = false;
    discovery.hidden = !['sumup', 'stripe'].includes(provider.value);
    form.querySelector('#terminal-link').hidden = provider.value !== 'local';
    form.querySelector('#terminal-help').textContent = instructions[provider.value];
    readers.replaceChildren();
    status.textContent = selected ? 'Lecteur mémorisé. Relancez la recherche pour vérifier sa présence.' : '';
  }
  provider.addEventListener('change', () => { selected = ''; update(); });
  update();
  on('terminal-find', async () => {
    const current = ++search;
    find.disabled = true;
    status.textContent = 'Recherche des lecteurs…';
    readers.replaceChildren();
    try {
      const response = await fetch('/api/terminal-readers?provider=' + encodeURIComponent(provider.value),
        {headers:{'X-Seconde-Vie':'terminals'}});
      const data = await response.json();
      if (current !== search || !form.isConnected) return;
      if (!response.ok) throw new Error(data.error);
      const states = {online:'en ligne', offline:'hors ligne', paired:'associé', processing:'association en cours', expired:'association expirée'};
      if (!data.readers.some(reader => reader.id === selected)) selected = '';
      if (!data.readers.length) {
        status.textContent = 'Aucun lecteur associé à ce compte.';
        return;
      }
      readers.innerHTML = field('Lecteur', `<select name="reader">${option('', 'Choisir un lecteur', selected)}
        ${data.readers.map(reader => option(reader.id, reader.label + ' · ' + (states[reader.status] || 'état inconnu'), selected)).join('')}
      </select>`);
      form.elements.reader.addEventListener('change', event => { selected = event.target.value; });
      status.textContent = 'Lecteurs trouvés. Choisissez celui du poste.';
    } catch (error) {
      if (current === search && form.isConnected) status.textContent = error.message || 'Recherche indisponible.';
    } finally {
      if (current === search) find.disabled = false;
    }
  });
  formSubmit('terminal-settings', data => {
    localStorage.setItem(storageKey, JSON.stringify({provider:provider.value, model:data.get('model').trim(), reader:selected,
      supplier:data.get('supplier').trim(), link:data.get('link'), protocol:data.get('protocol').trim()}));
    closeDialog();
    notice('Terminal enregistré pour ' + site.name);
  });
}

function operationTools() {
  return operationsPages({api,esc,header,field,input,button,formEnd,formSubmit,showDialog,changed,notice,config,sites,printContent,date});
}
function cashPage(main) {
  const site = cashSite();
  main.innerHTML = header('Caisse', site?.name || '',
    button(me.cash_station ? 'Changer de personne' : 'Ouvrir un poste partagé', 'users', 'cash-operator')
    + (me.cash_station ? button('Verrouiller le poste', '', 'cash-lock') : '')
    + button('Matériel', '', 'cash-hardware'));
  on('cash-hardware', () => showHardware(null, site));
  if (!site) {
    main.insertAdjacentHTML('beforeend', '<p>Ajoutez un site pour enregistrer une vente.</p>');
    return;
  }
  main.insertAdjacentHTML('beforeend','<section class="surface stack" id="register-controls"><p>Chargement de la caisse…</p></section>');
  operationTools().cashControls(main,site).catch(report);
  main.insertAdjacentHTML('beforeend', `<div class="cash-grid">
    <section class="surface cash-panel" aria-labelledby="cash-search-title">
      <div class="cash-catalog-head">
        <h2 id="cash-search-title">Catalogue de vente</h2>
        ${button('Article sans étiquette', '', 'cash-unlabelled', '', '', 'A')}
      </div>
      <form id="cash-search" class="cash-search">
        <label class="field"><span>Scanner un code ou chercher un article ${keyHint('R')}</span>
          ${input('query', `type="search" aria-keyshortcuts="${shortcutKeys('R')}" maxlength="100" autocomplete="off" placeholder="Nom, code de l’étiquette ou code-barres"`)}
        </label>
        <button type="submit" class="btn">${icon('scan',16)} Ajouter</button>
        <div class="form-error" role="alert"></div>
      </form>
      <div class="tabs cash-categories" aria-label="Catégories" id="cash-categories"></div>
      <div id="cash-results"></div>
    </section>
    <section class="surface cash-panel cash-basket" aria-labelledby="cash-cart-title">
      <h2 id="cash-cart-title">Panier <span id="cash-count"></span></h2><div id="cash-cart"></div>
      <div class="cash-register">
        <p id="cash-discount-summary" hidden></p>
        <p>Total à payer</p><strong id="cash-total" aria-live="polite"></strong>
        ${button('Remise', '', 'cash-discount', 'ghost')}
        ${button('Encaisser', 'caisse', 'cash-payment', 'primary', '', 'P')}
      </div>
      <p class="help">${demoMode ? 'Caisse de démo · Les ventes sont enregistrées dans ce navigateur.' : 'Caisse interne · Les ventes sont enregistrées dans votre espace partagé.'}</p>
    </section>
    <section class="surface cash-panel cash-history" aria-labelledby="cash-history-title">
      <h2 id="cash-history-title">Dernières ventes</h2><div id="cash-sales"></div>
    </section>
  </div>`);
  const draft = readBasket(me.org,site.id,stock);
  const cart = new Map(draft.lines.map(row => [row.id,row]));
  const operatorButton = main.querySelector('#cash-operator');
  let changingOperator = false;
  chooseCashier = async () => {
    if (locked || changingOperator) return;
    const people = await api('/cashiers');
    if (!main.isConnected) return;
    showDialog('Qui prend la caisse ?', `<div class="stack">
      <p class="help">Choisissez votre prénom au moment du relais. Le panier reste ouvert. Le poste donne accès aux fonctions de caisse.</p>
      <div class="cards">${people.map(person => `<button type="button" class="btn profile-choice"
        data-cashier="${esc(person.id)}">${profileAvatar(person)}<span><strong>${esc(person.name)}</strong>
        ${person.id === me.id ? '<small>Au poste</small>' : ''}</span></button>`).join('')}</div>
      <p class="form-error" role="alert"></p>
    </div>`);
    const picker = dialog.querySelector('.dialog-body');
    picker.querySelectorAll('[data-cashier]').forEach(control => control.addEventListener('click', async () => {
      if (changingOperator) return;
      changingOperator = true;
      const buttons = picker.querySelectorAll('[data-cashier]');
      buttons.forEach(button => { button.disabled = true; });
      try {
        const next = await api('/cash-station',{method:'POST',body:{site_id:site.id,member:control.dataset.cashier}});
        me = next;
        siteFilter = site.id;
        sites = sites.filter(row => row.id === site.id);
        team = []; transfers = []; shifts = [];
        root.querySelectorAll('[data-page]').forEach(link => {
          if (!canOpen(me,link.dataset.page)) link.remove();
        });
        root.querySelectorAll('.navgroup').forEach(group => {
          if (!group.querySelector('[data-page]')) group.remove();
        });
        const currentSite = root.querySelector('#current-site');
        if (currentSite) currentSite.disabled = true;
        const profile = root.querySelector('#switch-profile');
        profile.innerHTML = profileAvatar(me) + '<span><strong>' + esc(me.name) + '</strong><small>Caisse · changer de personne</small></span>';
        profile.setAttribute('aria-label','Changer de personne · ' + me.name);
        profile.title = 'Changer de personne';
        operatorButton.textContent = 'Changer de personne';
        if (!main.querySelector('#cash-lock')) {
          operatorButton.insertAdjacentHTML('afterend',button('Verrouiller le poste','','cash-lock'));
          on('cash-lock',switchProfile);
        }
        closeDialog();
        query.focus();
        notice(me.name + ' prend la caisse.');
      } catch (error) {
        picker.querySelector('.form-error').textContent = error.message;
        buttons.forEach(button => { button.disabled = false; });
      } finally { changingOperator = false; }
    }));
  };
  on('cash-operator',chooseCashier);
  on('cash-lock',switchProfile);
  const sellable = stock.filter(row => row.site_id === site.id && row.state === 'pret');
  const query = main.querySelector('#cash-search input');
  const results = main.querySelector('#cash-results');
  const basket = main.querySelector('#cash-cart');
  const saleButton = main.querySelector('#cash-payment');
  const discountButton = main.querySelector('#cash-discount');
  const discountSummary = main.querySelector('#cash-discount-summary');
  const categoryTabs = main.querySelector('#cash-categories');
  const categories = [...new Set(sellable.map(row => row.category))].sort((a,b) => a.localeCompare(b,'fr'));
  let category = '';
  let locked = false;
  let discount = draft.discount;
  categoryTabs.innerHTML = ['', ...categories].map((name, i) => `<button type="button" data-cash-category="${i}" class="${i ? '' : 'active'}" aria-pressed="${!i}">${esc(name || 'Tout')}</button>`).join('');
  categoryTabs.addEventListener('click', event => {
    const selected = event.target.closest('[data-cash-category]');
    if (!selected) return;
    category = ['', ...categories][Number(selected.dataset.cashCategory)];
    for (const control of categoryTabs.querySelectorAll('button')) {
      control.classList.toggle('active', control === selected);
      control.setAttribute('aria-pressed', String(control === selected));
    }
    draw();
  });
  const formatPrice = cents => euro.format(cents / 100);
  const priced = row => Number.isSafeInteger(row.price_cents) && row.price_cents >= 0;
  const subtotal = () => [...cart.values()].reduce((sum, row) => sum + row.price_cents, 0);
  const total = () => subtotal() - discountCents(subtotal(), discount);

  function matches() {
    const text = searchText(query.value);
    const code = normalizeScanCode(query.value).toUpperCase();
    const exact = code && sellable.filter(row => row.code?.toUpperCase() === code || (row.barcode && normalizeScanCode(row.barcode).toUpperCase() === code));
    return exact?.length ? exact : sellable.filter(row => (!category || row.category === category) && stockSearchText(row).includes(text));
  }
  function draw() {
    saveBasket(me.org,site.id,[...cart.values()],discount);
    const found = matches();
    results.innerHTML = found.length ? `<div class="cash-catalog">${found.slice(0, 24).map(row => `
      <button type="button" class="cash-product" data-cash-add="${esc(row.id)}" ${cart.has(row.id) ? 'disabled' : ''}>
        ${stockVisual(row)}<span class="cash-product-name">${esc(row.title)}</span>
        <small>${esc(row.code)} · ${esc(row.zone_name || row.category)}</small>
        <strong>${cart.has(row.id) ? 'Au panier' : priced(row) ? formatPrice(row.price_cents) : 'Définir le prix'}</strong>
      </button>`).join('')}</div>${found.length > 24 ? '<p class="help">24 articles affichés. Précisez la recherche pour voir les autres.</p>' : ''}`
      : '<p class="help">Aucun article prêt à la vente ne correspond.</p>';
    basket.innerHTML = cart.size ? `<ul class="cash-list">${[...cart.values()].map(row => `<li>
      <div><strong>${esc(row.title)}</strong><small>${row.kind === 'libre' ? esc(row.category) + ' · ' + row.quantity + ' × ' + formatPrice(row.unit_price_cents) : row.kind === 'lot' ? 'Lot entier' : 'Article'}</small></div>
      <div><strong>${formatPrice(row.price_cents)}</strong><button type="button" class="btn" data-cash-remove="${esc(row.id)}" aria-label="Retirer ${esc(row.title)}">Retirer</button></div>
      </li>`).join('')}</ul>` : '<p class="help">Scannez un article ou sélectionnez-le dans le catalogue.</p>';
    main.querySelector('#cash-count').textContent = cart.size;
    const reduction = discountCents(subtotal(), discount);
    discountSummary.hidden = !reduction;
    discountSummary.textContent = reduction ? 'Sous-total ' + formatPrice(subtotal()) + ' · Remise −' + formatPrice(reduction) : '';
    main.querySelector('#cash-total').textContent = formatPrice(total());
    saleButton.disabled = discountButton.disabled = !cart.size || locked;
  }
  function add(row) {
    if (!row || !priced(row) || locked || cart.has(row.id) || cart.size >= 100) return;
    cart.set(row.id, row);
    query.value = '';
    draw();
    query.focus();
  }
  function selectArticle(row) {
    if (!row || locked || cart.has(row.id)) return;
    if (cart.size >= 100) throw new Error('Le panier contient déjà 100 lignes.');
    if (priced(row)) return add(row);
    showDialog('Définir le prix · ' + row.title, `<form id="cash-price-form" class="stack">
      ${field('Prix de vente (€)', input('price','type="number" min="0" max="1000000" step="0.01" inputmode="decimal" required'))}
      <p class="help">Le prix sera aussi enregistré sur la fiche de stock.</p>
      ${formEnd('Enregistrer et ajouter au panier')}</form>`);
    const form = dialog.querySelector('#cash-price-form');
    form.elements.price.dispatchEvent(new Event('input',{bubbles:true}));form.elements.price.focus();
    formSubmit('cash-price-form', async data => {
      const updated = await api('/stock/'+row.id+'/action',{method:'POST',body:{action:'cash-price',
        site_id:site.id,price_cents:Math.round(Number(data.get('price')) * 100)}});
      Object.assign(row,updated);
      closeDialog();
      add(row);
    });
  }
  query.addEventListener('input', draw);
  formSubmit('cash-search', () => {
    const found = matches().filter(row => !cart.has(row.id));
    if (query.value.trim() && found.length === 1) selectArticle(found[0]);
    else if (query.value.trim()) throw new Error(found.length ? 'Sélectionnez un article dans les résultats.' : 'Aucun article disponible à ajouter pour cette recherche.');
  });
  results.addEventListener('click', event => {
    const id = event.target.closest('[data-cash-add]')?.dataset.cashAdd;
    if (id) {
      try { selectArticle(sellable.find(row => row.id === id)); } catch (error) { report(error); }
    }
  });
  basket.addEventListener('click', event => {
    const id = event.target.closest('[data-cash-remove]')?.dataset.cashRemove;
    if (id && !locked) {
      cart.delete(id);
      if (!cart.size || (discount?.type === 'amount' && discount.value > subtotal())) {
        if (cart.size) notice('Remise retirée · elle dépassait le nouveau sous-total.');
        discount = null;
      }
      draw();
      query.focus();
    }
  });
  on('cash-unlabelled', () => {
    if (locked) return;
    if (cart.size >= 100) throw new Error('Le panier contient déjà 100 lignes.');
    const available = siteCategories(site);
    showDialog('Article sans étiquette', `<form id="cash-unlabelled-form" class="stack">
      <p class="help">Pour un article sans fiche. Si sa fiche existe déjà, retrouvez-la par son nom dans le catalogue pour mettre à jour le stock.</p>
      ${field('Catégorie', `<select name="category" required>${option('', 'Choisir une catégorie')}
        ${available.map(name => option(name, name)).join('')}</select>`)}
      ${field('Nom (facultatif)', input('title', 'maxlength="100" placeholder="Ex. Tasse en grès"'))}
      ${field('Prix unitaire (€)', input('price', 'type="number" required min="0" max="1000000" step="0.01" inputmode="decimal"'))}
      ${field('Quantité', input('quantity', 'type="number" required min="1" max="999" step="1" inputmode="numeric" value="1"'))}
      ${formEnd('Ajouter au panier')}
    </form>`);
    formSubmit('cash-unlabelled-form', data => {
      const quantity = Number(data.get('quantity'));
      const unit_price_cents = Math.round(Number(data.get('price')) * 100);
      const category = data.get('category');
      const title = data.get('title').trim() || category;
      const lineId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      add({id:'libre-' + lineId, kind:'libre', title, category, quantity, unit_price_cents,
        price_cents:unit_price_cents * quantity});
      closeDialog();
      query.focus();
    });
  });
  on('cash-discount', () => {
    if (!cart.size || locked) return;
    showDialog('Remise sur le panier', `<form id="cash-discount-form" class="stack">
      <p class="help">Sous-total · ${formatPrice(subtotal())}. Saisissez zéro pour retirer la remise.</p>
      <div class="form-row">${field('Type', `<select name="type">${option('amount','En euros',discount?.type)}
        ${option('percent','En pourcentage',discount?.type)}</select>`)}
      ${field('Valeur', input('value', `type="number" required min="0" step="0.01" inputmode="decimal"
        value="${discount ? (discount.type === 'amount' ? discount.value / 100 : discount.value) : ''}"`))}</div>
      ${formEnd('Appliquer la remise')}</form>`);
    const form = dialog.querySelector('#cash-discount-form');
    function updateLimits() {
      const percent = form.elements.type.value === 'percent';
      form.elements.value.step = percent ? '1' : '0.01';
      form.elements.value.max = percent ? 100 : subtotal() / 100;
    }
    form.elements.type.addEventListener('change', updateLimits);
    updateLimits();
    formSubmit('cash-discount-form', data => {
      const type = data.get('type');
      const value = Number(data.get('value'));
      const next = {type, value:type === 'amount' ? Math.round(value * 100) : value};
      discountCents(subtotal(),next);
      discount = next.value ? next : null;
      closeDialog();
      draw();
    });
  });
  on('cash-payment', () => {
    if(main.querySelector('#register-controls')?.dataset.open!=='1') {
      document.getElementById('register-open')?.click();
      return notice('Ouvrez la caisse du site avant l’encaissement.');
    }
    if (!cart.size || locked) return;
    const amount = total();
    showDialog('Encaisser la vente', `<form id="cash-sale" class="stack">
      <p class="cash-total"><span>Total à payer</span><strong>${formatPrice(amount)}</strong></p>
      <fieldset class="cash-methods"><legend>Mode de paiement reçu</legend>
        ${(amount === 0 ? [['gratuit','Gratuit']] : [['carte','Carte'],['especes','Espèces'],['autre','Autre']]).map(([key,label],i) =>
          `<label><input type="radio" name="payment" value="${key}" ${i ? '' : 'checked'}>${label}</label>`).join('')}
      </fieldset>
      <div id="cash-tender" class="stack" hidden>
        ${field('Montant reçu (€)', input('received', 'type="number" min="0" step="0.01" inputmode="decimal"'))}
        <div class="tabs">${[0,10,20,50].filter(n => n === 0 || n * 100 > amount).map(n => `<button type="button" class="btn" data-tender="${n ? n * 100 : amount}">${n ? formatPrice(n * 100) : 'Montant exact'}</button>`).join('')}</div>
        <p id="cash-change" class="cash-total" aria-live="polite"></p>
      </div>
      <p id="cash-card-instructions" class="help">Saisissez <strong>${formatPrice(amount)}</strong> sur votre terminal autonome. Attendez que le paiement soit accepté avant de confirmer. ${demoMode ? 'La démonstration enregistre la vente dans ce navigateur.' : 'La vente sera enregistrée dans votre espace partagé.'}</p>
      ${formEnd('Valider et afficher le ticket')}
    </form>`);
    const form = dialog.querySelector('#cash-sale');
    const received = form.elements.received;
    const tender = form.querySelector('#cash-tender');
    const change = form.querySelector('#cash-change');
    const cardInstructions = form.querySelector('#cash-card-instructions');
    const submitSale = form.querySelector('button[type=submit]');
    const receivedCents = () => received.value ? Math.round(received.valueAsNumber * 100) : null;
    const updateTender = () => {
      const method = form.elements.payment.value;
      const cash = method === 'especes';
      cardInstructions.hidden = method !== 'carte';
      submitSale.textContent = method === 'carte' ? 'Confirmer le paiement accepté' : 'Valider et afficher le ticket';
      tender.hidden = !cash;
      received.required = cash;
      received.disabled = !cash;
      const value = receivedCents();
      change.textContent = value === null ? '' : value >= amount
        ? 'Monnaie à rendre · ' + formatPrice(value - amount)
        : 'Reste à recevoir · ' + formatPrice(amount - value);
    };
    form.addEventListener('input', updateTender);
    tender.querySelectorAll('[data-tender]').forEach(control => control.addEventListener('click', () => {
      received.value = Number(control.dataset.tender) / 100;
      updateTender();
    }));
    updateTender();
    formSubmit('cash-sale', async data => {
      locked = true;
      try {
        const sale = await api('/sales', {method:'POST',body:{site_id:site.id,payment:data.get('payment'),operator_id:me.id,
          received_cents:receivedCents(), discount,
          lines:[...cart.values()].map(row => row.kind === 'libre'
            ? {id:row.id,kind:row.kind,title:row.title,category:row.category,quantity:row.quantity,unit_price_cents:row.unit_price_cents}
            : {id:row.id,price_cents:row.price_cents})}});
        saveBasket(me.org,site.id,[],null);
        await changed('Vente enregistrée · ' + formatPrice(sale.total_cents));
        if (page === 'caisse') showCashTicket(sale, site);
      } finally { locked = false; }
    });
  });
  draw();
  const historyList = main.querySelector('#cash-sales');
  api('/sales').then(sales => {
    if (!historyList.isConnected) return;
    const recent = sales.filter(sale => sale.site_id === site.id).slice(0, 8);
    historyList.innerHTML = recent.length ? `<ul class="cash-list">${recent.map(sale => `<li>
      <div><strong>${esc(sale.lines.map(line => line.title).join(', '))}</strong><small>${esc(dateFmt.format(new Date(sale.created_at)))} · ${esc(sale.payment)}${sale.operator_name ? ' · ' + esc(sale.operator_name) : ''}</small></div>
      <div><strong>${formatPrice(sale.total_cents)}</strong><button class="btn" type="button" data-ticket="${esc(sale.id)}">Ticket</button></div></li>`).join('')}</ul>` : '<p class="help">Aucune vente enregistrée sur ce site.</p>';
    historyList.addEventListener('click', event => {
      const id = event.target.closest('[data-ticket]')?.dataset.ticket;
      const sale = recent.find(row => row.id === id);
      if (sale) showCashTicket(sale, site);
    });
  }).catch(() => { historyList.textContent = 'Historique indisponible.'; });
}

function home(main, draft) {
  main.classList.add('mobile-intake');
  const site = workingSite();
  if (!site) {
    main.innerHTML = header('Réception des dons') + '<p class="surface empty">Ajoutez un site avant de réceptionner un don.</p>';
    return;
  }
  const rows = stock.filter(row => row.site_id === site.id);
  main.innerHTML = header('Réception des dons', site.name,
    button('Retrouver une fiche','scan','receive-scan') + button('Voir le stock','box','receive-stock'))
    + `<div class="receiving-layout">
      <section class="surface receiving-panel" aria-labelledby="receive-title">
        <div class="panel-head"><h2 id="receive-title">Nouvelle entrée</h2></div>
        <div class="panel-body" id="receiving-flow"></div>
      </section>
      <details class="intake-activity" ${window.matchMedia('(max-width: 1100px)').matches?'':'open'}><summary>Activité du site · ${rows.length} entrées</summary>
        <div class="work-counts">
          <button type="button" id="intake-tri">${icon('sort', 17)} À trier <strong>${rows.filter(row => row.state === 'tri').length}</strong></button>
          <button type="button" id="intake-check">${icon('wrench', 17)} À vérifier <strong>${rows.filter(row => row.state === 'controle').length}</strong></button>
        </div>
        <div class="section-head"><h2 id="recent-title">Dernières entrées</h2>${rows.length ? button('Imprimer la dernière étiquette','printer','intake-label','ghost') : ''}</div>
        ${recentEntries(rows.slice(0, 8))}
      </details>
    </div>`;
  scanPage(document.getElementById('receiving-flow'),{intake:true,draft,resume:draft?null:readIntakeDraft(draftScope(),site.id)});
  on('receive-scan', () => go('scanner'));
  on('receive-stock', () => openSiteStock(site));
  on('intake-tri', () => openSiteStock(site, 'tri'));
  on('intake-check', () => openSiteStock(site, 'controle'));
  on('intake-label', () => printLabel(rows[0]));
  bindStock(main);
}

function openSiteStock(site, state = '') {
  siteFilter = site.id;
  localStorage.setItem('secondevie-site-' + me.org, site.id);
  go(state === 'controle' ? 'controle' : 'stock', false, state);
}

function stockVisual(row){const src=row.cover_photo||itemPhotos(row)[0];return src?`<span class="stock-visual">${categoryTile(row.category)}<img src="${esc(src)}" alt="" data-stock-cover loading="lazy" decoding="async"></span>`:categoryTile(row.category);}
function recentEntries(rows) {
  if (!rows.length) return '<div class="surface empty">Aucune entrée sur ce site.</div>';
  return `<ul class="recent-list">${rows.map(row => `<li><button type="button" data-stock="${esc(row.id)}">
    ${stockVisual(row)}<span class="recent-title"><strong>${esc(row.title)}</strong><small>${esc([measure(row), row.zone_name].filter(Boolean).join(' · '))}</small></span>
    ${status(row)}${icon('chevron', 14)}
  </button></li>`).join('')}</ul>`;
}

function header(title, sub = '', actions = '') {
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="page-actions">${actions}</div></header>`;
}
function table(rows) {
  if (!rows.length) return '<div class="surface empty">Aucun objet ou lot ici pour le moment.</div>';
  return `<div class="surface table-scroll stock-list"><table><thead><tr><th>Objet ou lot</th><th>Site / zone</th><th>État</th><th>Quantité</th><th>Prix</th></tr></thead><tbody>${rows.map(row => {
    return `<tr><td><div class="item-title">${stockVisual(row)}<div><button type="button" data-stock="${row.id}">${esc(row.title)}</button><small>${esc(row.code)} · ${esc(row.category)}</small><small class="stock-compact-data">${esc(measure(row))}${row.price_cents == null ? '' : ' · ' + euro.format(row.price_cents / 100)}</small></div></div></td>
      <td>${row.state === 'transit' ? 'En déplacement' : esc(row.site_name)}${row.zone_name && row.state !== 'transit' ? `<span class="minor">${esc(row.zone_name)}</span>` : ''}</td><td>${status(row)}</td><td>${esc(measure(row))}</td><td>${row.price_cents == null ? '—' : euro.format(row.price_cents/100)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function bindStock(container) {
  container.querySelectorAll('[data-stock-cover]').forEach(image=>image.addEventListener('error',()=>image.remove(),{once:true}));
  container.querySelectorAll('[data-stock]').forEach(el => el.addEventListener('click', () => detail(el.dataset.stock).catch(report)));
}
function inventory(main) {
  const inCheck = page === 'controle';
  const buttons = button('Scanner','scan','stock-scan') + (allowed('reception','tri') ? button('Nouveau don','plus','stock-add','primary') : '') + (admin() && !inCheck ? button('Export CSV','download','stock-export') : '');
  main.innerHTML = header(inCheck ? 'À vérifier' : 'Stock', inCheck ? 'Les objets mis de côté et le motif du contrôle.' : 'Retrouvez vos objets et lots, du tri jusqu’à leur sortie.', buttons)
    + `<div class="toolbar"><label class="searchbox">${icon('search',16)}<input id="stock-search" type="search" value="${esc(search)}" placeholder="Nom, catégorie ou référence…" aria-label="Rechercher dans le stock" aria-keyshortcuts="${shortcutKeys('R')}">${keyHint('R')}</label>
    ${inCheck ? '' : `<div class="tabs">${[['','Tout'], ...Object.entries(statusNames)].map(([state,label]) => `<button type="button" class="${filter === state ? 'active' : ''}" data-filter="${state}" aria-pressed="${filter === state}">${label}</button>`).join('')}</div>`}</div><div class="stock-summary"><span id="stock-count" role="status" aria-live="polite"></span><button type="button" class="btn" id="stock-reset" hidden>Effacer les filtres</button></div><div id="stock-table"></div>`;
  const pageSize = 50;
  const entries = siteRows().map(row => ({ row, text:stockSearchText(row) }));
  let offset = inventoryViews.get(inventoryViewKey())?.offset || 0;
  function draw() {
    const terms = searchText(search).split(/\s+/).filter(Boolean);
    const rows = entries.filter(({row,text}) => (inCheck ? row.state === 'controle' : !filter || filter === row.state)
      && terms.every(term => text.includes(term))).map(entry => entry.row);
    offset = Math.min(offset, Math.max(0, Math.ceil(rows.length / pageSize) - 1) * pageSize);
    inventoryViews.set(inventoryViewKey(), {search, filter, offset});
    document.getElementById('stock-count').textContent = rows.length + (rows.length === 1 ? ' fiche' : ' fiches');
    document.getElementById('stock-reset').hidden = !search && (!filter || inCheck);
    const node = document.getElementById('stock-table');
    node.innerHTML = (rows.length > pageSize
      ? `<nav class="stock-pages" aria-label="Pages du stock"><span aria-live="polite">${offset + 1}–${Math.min(rows.length,offset + pageSize)} sur ${rows.length}</span>
        ${button('Précédent','left','stock-prev','',offset ? '' : 'disabled')}${button('Suivant','arrow','stock-next','',offset + pageSize < rows.length ? '' : 'disabled')}</nav>` : '') + table(rows.slice(offset,offset + pageSize));
    bindStock(node);
    for (const [id,step] of [['stock-prev',-1],['stock-next',1]]) on(id, () => {
      offset += step * pageSize;
      draw();
      const moved = document.getElementById(id);
      (moved.disabled ? node.querySelector('.stock-pages button:not(:disabled)') : moved).focus();
    });
  }
  draw();
  on('stock-reset', () => {search='';filter='';offset=0;document.getElementById('stock-search').value='';main.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='');b.setAttribute('aria-pressed',String(b.dataset.filter===''));});draw();});
  on('stock-add', () => go('accueil'));
  on('stock-scan', () => go('scanner'));
  on('stock-export', downloadStock);
  on('stock-search', e => { search = e.target.value; offset = 0; draw(); }, 'input');
  main.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    offset = 0;
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

function receive({ parent, barcode = '', title = '', category = '', catalog, reference, referenceConfirmed = false, description, photo, photos:initialPhotos, fromScan = false, market, kind = 'item', mode = 'quantite', zoneId, origin = origins[0], inline = false, resume, priceCents, condition='', note='',visual_condition,functionality='untested' } = {}) {
  const site = parent ? getSite(parent.site_id) : workingSite();
  if (!site) return report(new Error('Ajoutez un site avant de réceptionner un don.'));
  const saved = inline ? resume?.fields || {} : {};
  category = saved.category ?? category;
  kind = saved.kind ?? kind;
  mode = saved.mode ?? mode;
  title = saved.title ?? title;
  origin = saved.origin ?? origin;
  zoneId = saved.zone_id ?? zoneId;
  barcode = saved.barcode ?? barcode;
  description = saved.description ?? description;
  reference = {...reference,...Object.fromEntries(Object.entries(saved).filter(([name]) => name.startsWith('ref_'))
    .map(([name,value]) => [name.slice(4),value]))};
  const id = inline ? 'intake-form' : 'receive-form';
  const entryZone = current => parent?.zone_id || current.zones.find(zone => zone.name === 'Réception')?.id;
  const formHtml = `<form id="${id}" class="intake-form">
    ${inline ? `<p class="help">Une catégorie suffit pour un objet. Pour un lot, ajoutez sa quantité ou son poids. Les autres informations sont facultatives.</p>
      <div class="notice" data-intake-draft ${resume ? '' : 'hidden'}><span data-intake-draft-status>${resume ? 'Saisie reprise sur ce poste.' : ''}</span>
      ${button('Recommencer l’entrée','','intake-reset','ghost')}</div>` : ''}
    ${parent ? `<p class="notice">Lot d’origine <strong>${esc(parent.title)}</strong> · ${esc(measure(parent))}</p>` : ''}
    ${!inline && !parent ? field('Site de réception', `<select name="site_id">${siteOptions(site.id)}</select>`) : ''}
    <fieldset><legend>Catégorie</legend><p class="help" data-entry-category-notice hidden></p><div class="category-grid" data-entry-categories></div></fieldset>
    ${parent ? input('kind', 'type="hidden" value="item"') : `<fieldset><legend>Suivre comme</legend><div class="choice-row">
      ${choice('kind', 'item', 'Un objet', { checked:kind === 'item', graphic:tile('item'), hint:'Une fiche pour une pièce' })}
      ${choice('kind', 'lot', 'Un lot', { checked:kind === 'lot', graphic:tile('box'), hint:'Plusieurs pièces ensemble' })}
    </div></fieldset>`}
    ${parent ? '' : `<div data-lot-measure>
      <fieldset><legend>Mode de suivi du lot</legend><div class="choice-row">
        ${choice('mode', 'quantite', 'En pièces', { checked:mode === 'quantite', graphic:icon('count', 18) })}
        ${choice('mode', 'poids', 'Au poids', { checked:mode === 'poids', graphic:icon('scale', 18) })}
      </div></fieldset>
      <fieldset data-quantity><legend>Quantité</legend>
        <div class="quantity-choices" aria-label="Quantités courantes">
          ${[1, 2, 5, 10, 20].map(value => `<button type="button" class="btn quantity-choice" data-quantity-value="${value}" aria-pressed="${value === 1}">${value}</button>`).join('')}
          ${input('quantity', 'type="number" inputmode="numeric" min="1" step="1" value="1" aria-label="Nombre de pièces"')}
        </div>
      </fieldset>
    </div>`}
    ${!parent || parent.grams != null ? `<div data-weight>${field('Poids (kg)', input('weight', 'type="number" inputmode="decimal" min="0.001" step="0.001" placeholder="0,000"'))}</div>` : ''}
    <div class="form-row intake-name-price">
      ${field('Nom de l’entrée (facultatif)', input('title', `maxlength="150" placeholder="Ex. Carton de livres" value="${esc(title)}"`))}
      ${field('Prix de vente (€, facultatif)', input('price', 'type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="À définir" value="'+(priceCents==null?'':priceCents/100)+'"'))}
    </div>
    <div class="intake-barcode-field">${field('Code-barres d’origine (EAN ou ISBN)', input('barcode', `maxlength="80" inputmode="numeric" value="${esc(barcode)}"`) + '<small>Le code imprimé sur l’objet ou son emballage. Facultatif.</small>')}</div>
    <section class="entry-extras" data-intake-pricing></section>
    <div class="price-suggestion" data-price-suggestion aria-live="polite" hidden></div>
    ${market ? '<details class="entry-extras"><summary>Prix vus en ligne</summary><div data-intake-market aria-live="polite"></div></details>' : ''}
    ${catalogCard(catalog)}
    <details class="entry-photos" ${photo || resume?.photos?.length ? 'open' : ''}><summary>Photos (facultatif)</summary>
      ${photoEditor()}${catalogGallery(catalog, [], true)}</details>
    ${!demoMode && contacts.length ? field('Contact associé (facultatif)', `<select name="contact_id">${option('','Aucun contact')}${contacts.map(row=>option(row.id,row.name,saved.contact_id)).join('')}</select>`) : ''}
    <div class="form-row">
      ${field('Zone de rangement', `<select name="zone_id">${zones(site.id, zoneId ?? entryZone(site))}</select>`)}
      ${field('Provenance', `<select name="origin" ${parent ? 'disabled' : ''}>${origins.map(x => option(x,x,parent?.origin || origin)).join('')}</select>`)}
    </div>
    <details class="entry-extras" ${catalog || (reference && Object.keys(reference).length) || description || (inline && detailedIntake) ? 'open' : ''}><summary>Descriptif, caractéristiques et note</summary><div class="stack">
      ${descriptionField(description ?? catalogDescription(catalog))}${field('État visuel (facultatif)',input('condition',`maxlength="100" placeholder="À vérifier au tri" value="${esc(condition)}"`))}<div data-intake-functionality>${field('Fonctionnement',`<select name="functionality">${functionalityOptions.map(([key,label])=>option(key,label,functionality)).join('')}</select>`)}</div><div data-reference-fields></div>
      ${field('Note', `<textarea name="note" maxlength="1000">${esc(note)}</textarea>`)}
      ${parent ? '' : `<div data-optional-weight>${field('Poids mesuré (kg, facultatif)', input('weight_optional', 'type="number" inputmode="decimal" min="0.001" step="0.001"'))}</div>`}

    </div></details>
    <div class="intake-footer"><div class="form-error" role="alert"></div><div class="intake-actions">
      <button class="btn primary" type="submit">${icon('check', 17)} ${parent ? 'Isoler l’objet' : 'Enregistrer'}</button>
      ${inline ? `<button class="btn" type="submit" name="next" value="true" aria-describedby="continue-hint" aria-keyshortcuts="${shortcutKeys('Enter')}">Enregistrer et continuer${keyHint('Enter')}</button><span id="continue-hint" class="help">Garde les choix de réception pour la prochaine fiche.</span>` : ''}
    </div></div>
  </form>`;
  if (inline) {
    const panel = document.getElementById('receiving-form');
    panel.innerHTML = formHtml;
    watchCatalogImages(panel);
  } else showDialog(parent ? 'Isoler un objet du lot' : 'Nouvelle entrée', formHtml);
  const form = document.getElementById(id);
  if(!demoMode) {
    const fields=config.intake || {};
    const toggle=(name,visible)=>{const control=form.elements.namedItem(name);if(control)control.closest('label').hidden=!visible;};
    toggle('price',inline || fromScan || fields.price);
    const photoArea=form.querySelector('.entry-photos');if(photoArea)photoArea.hidden=fields.photos===false;
    const extras=form.querySelector('.entry-extras');if(extras && !catalog && !fromScan)extras.open=fields.reference===true;
    toggle('note',fields.note===true);
  }
  if (market) market.showInIntake(form.querySelector('[data-intake-market]'));
  const readPricing=mountIntakePricing(form,{esc,euro,currency:config.currency||'EUR',referenceConfirmed,getStock:()=>stock,siteId:site.id});
  const photos = bindPhotoEditor(form, resume?.photos?.length ? resume.photos : initialPhotos?.length ? initialPhotos : photo ? [photo] : []);
  if (inline) {
    const extras = form.querySelector('.entry-extras');
    let wasOpen = extras.open;
    extras.addEventListener('toggle', () => {
      if (extras.open === wasOpen) return;
      detailedIntake = wasOpen = extras.open;
      localStorage.setItem('secondevie-detailed-intake', String(detailedIntake));
    });
  }
  const categoryGroup = form.querySelector('[data-entry-categories]');
  const categoryNotice = form.querySelector('[data-entry-category-notice]');
  function drawCategories(currentSite, selected) {
    const choices = [...siteCategories(currentSite)];
    if (parent && !choices.includes(parent.category)) choices.push(parent.category);
    const rejected = selected && !choices.includes(selected);
    categoryNotice.hidden = !rejected;
    categoryNotice.textContent = rejected ? `Ce site n’accepte pas la catégorie « ${selected} ». Choisissez un autre site ou une catégorie acceptée.` : '';
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
    const functionalityArea=form.querySelector('[data-intake-functionality]');if(functionalityArea){functionalityArea.hidden=selected!=='Électrique';if(selected!=='Électrique')form.elements.functionality.value='not_applicable';else if(form.elements.functionality.value==='not_applicable')form.elements.functionality.value='untested';}
  }
  drawReference();
  for (const [name,value] of Object.entries(saved)) {
    const control = form.elements.namedItem(name);
    if (control && 'value' in control && control.type !== 'file') control.value = value;
  }

  function drawMeasure() {
    const lot = form.elements.kind.value === 'lot';
    const byWeight = form.elements.mode?.value === 'poids';
    if (!parent) {
      form.querySelector('[data-lot-measure]').hidden = !lot;
      form.querySelector('[data-quantity]').hidden = byWeight;
      form.elements.quantity.disabled = !lot || byWeight;
      form.elements.quantity.required = lot && !byWeight;
    }
    if (!parent) {
      const requiredWeight = lot && byWeight;
      form.querySelector('[data-optional-weight]').hidden = requiredWeight;
      form.elements.weight_optional.disabled = requiredWeight;
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
    if (event.target.name === 'category') {
      categoryNotice.hidden = true;
      drawReference();
    }
    if (event.target.name === 'site_id') {
      const selected = new FormData(form).get('category');
      const currentSite = getSite(event.target.value);
      form.elements.zone_id.innerHTML = zones(currentSite.id, entryZone(currentSite));
      drawCategories(currentSite, selected || category);
      drawReference();
    }
  });
  if (inline) {
    const org = draftScope();
    let draftSequence=0;
    async function rememberEntry() {
      if (form.dataset.saving) return;
      const sequence=++draftSequence;
      const fields = Object.fromEntries(new FormData(form));
      const savedPhotos = await photos();
      if(sequence!==draftSequence)return;
      if (!form.isConnected || form.dataset.saving) return;
      const complete = saveIntakeDraft(org,site.id,{fields,photos:savedPhotos});
      form.querySelector('[data-intake-draft]').hidden = false;
      form.querySelector('[data-intake-draft-status]').textContent = complete
        ? 'Brouillon conservé sur ce poste.' : 'Stockage limité : vérifiez vos photos avant de quitter la page.';
    }
    persistEntry=rememberEntry;
    form.addEventListener('input',()=>{form.dataset.dirty='true';});
    for (const event of ['input','change','photoschange']) form.addEventListener(event,() => rememberEntry().catch(report));
    on('intake-reset',() => {
      showDialog('Recommencer l’entrée ?',`<form id="intake-reset-confirm"><p>Le brouillon en cours sera effacé. Les entrées déjà enregistrées sont conservées.</p>${formEnd('Recommencer')}</form>`);
      formSubmit('intake-reset-confirm',async () => {
        clearIntakeDraft(org,site.id);
        closeDialog();
        render();
      });
    });
  }
  bindPriceSuggestion(form, () => {
    const fields = form.elements;
    return {
      site_id:fields.site_id?.value || site.id, kind:fields.kind.value, category:fields.category?.value,
      barcode:fields.barcode.value, title:fields.title.value,
      reference:{ brand:fields.ref_brand?.value || '', model:fields.ref_model?.value || '' },
    };
  }, fromScan);
  const quantity = form.elements.quantity;
  if (quantity) {
    const presets = form.querySelectorAll('[data-quantity-value]');
    const highlightQuantity = () => presets.forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.quantityValue === quantity.value)));
    quantity.addEventListener('input', highlightQuantity);
    presets.forEach(button => button.addEventListener('click', () => {
      quantity.value = button.dataset.quantityValue;
      quantity.dispatchEvent(new Event('input',{bubbles:true}));
      highlightQuantity();
    }));
  }
  formSubmit(id, async data => {
    const photoData = await photoFormData(data, photos);
    const weight = data.get('weight') || data.get('weight_optional');
    const row = await api('/stock', { method:'POST', body:{
      kind:data.get('kind'), category:data.get('category'), title:data.get('title'), site_id:data.get('site_id') || site.id,
      zone_id:data.get('zone_id'), quantity:data.get('quantity') ? Number(data.get('quantity')) : null,
      pricing_evidence:readPricing?.(),price_cents:data.get('price') ? Math.round(Number(data.get('price')) * 100) : null,
      grams:weight ? Math.round(Number(weight) * 1000) : null,
      visual_condition, functionality:data.get('functionality') || functionality,reference_confirmed:true, condition:data.get('condition'), note:data.get('note'), barcode:data.get('barcode'), origin:data.get('origin'), contact_id:data.get('contact_id'), parent_id:parent?.id, catalog,
      reference:formReference(data, data.get('category')), description:data.get('description'), ...photoData,
    } });
    if (inline) clearIntakeDraft(draftScope(),site.id);
    const next = data.has('next') ? { category:row.category, kind:row.kind, mode:data.get('mode'), origin:data.get('origin'), zoneId:data.get('zone_id') } : undefined;
    await changed('Entrée enregistrée · ' + row.code, next);
    if (parent) await detail(row.id);
    else if (inline) {
      const nextControl = next && row.kind === 'lot' && next.mode === 'quantite'
        ? document.querySelector('#intake-form [data-quantity-value]') : null;
      const nextField = next ? '#intake-form [name=title]' : '#intake-form [name=category]';
      (nextControl || document.querySelector(nextField))?.focus({ preventScroll:!next });
    }
  });
}

function priceMessage(estimate) {
  if (!estimate) return '';
  if (estimate.rate) {
    return `<p><strong>Prix indicatif ${euro.format(estimate.cents / 100)}</strong></p>
      <p class="help">Barème de démonstration · ${estimate.rate} % du prix éditeur neuf.</p>`;
  }
  const { cents, count, low, high, basis } = estimate;
  return `<p><strong>Repère interne ${euro.format(cents / 100)}</strong></p>
    <p class="help">${basis} · ${count} fiche${count > 1 ? 's' : ''} marquée${count > 1 ? 's' : ''} vendue${count > 1 ? 's' : ''} sur ce site · prix enregistrés avant éventuelle remise${low !== high ? ` · ${euro.format(low / 100)} à ${euro.format(high / 100)}` : ''}.</p>`;
}

function bindPriceSuggestion(form, item, showMissing = false) {
  const target = form.querySelector('[data-price-suggestion]');
  let estimate;
  function update() {
    const value = item();
    estimate = priceEstimate(stock, value);
    target.hidden = !estimate;
    const markup = target.hidden ? '' : '<details><summary>Repère de votre ressourcerie · historique local</summary>'+priceMessage(estimate) + (estimate
      ? '<button type="button" class="btn" data-use-price>Utiliser ce prix local</button>' : '')+'</details>';
    if (target.innerHTML !== markup) target.innerHTML = markup;
  }
  const affectsPrice = event => ['site_id', 'kind', 'category', 'barcode', 'title', 'ref_brand', 'ref_model'].includes(event.target.name);
  form.addEventListener('input', event => { if (affectsPrice(event)) update(); });
  form.addEventListener('change', event => { if (affectsPrice(event)) update(); });
  target.addEventListener('click', event => {
    if (!estimate || !event.target.closest('[data-use-price]')) return;
    form.elements.price.value = estimate.cents / 100;
    form.elements.price.focus();
  });
  update();
}

const encodePhoto=compressProductPhoto;

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

function ownGallery(photos) {
  if (!photos.length) return '';
  return `<section class="photo-section" aria-label="Photos de l’exemplaire">
    <p class="photo-caption">Photos de l’exemplaire</p><div class="photo-grid">
    ${photos.map((photo, index) => `<div class="photo-tile">
      <img src="${esc(photo)}" alt="Photo de l’exemplaire ${index + 1}" loading="lazy">
    </div>`).join('')}</div>
  </section>`;
}

function photoEditor() {
  return `<section class="photo-editor" aria-label="Photos de l’exemplaire" data-photo-editor>
    <div class="photo-editor-head"><div><strong>Photos de l’exemplaire</strong><small data-photo-hint>Facultatives · Jusqu’à ${maxItemPhotos} photos</small></div>
      <button type="button" class="btn" data-photo-add>${icon('image', 16)} Ajouter des photos</button>
      <input type="file" data-photo-input aria-label="Fichiers photo" accept="image/*" multiple hidden></div>
    <p class="help photo-drop-hint">Déposez des fichiers ici ou utilisez le bouton.</p>
    <ol class="photo-grid" data-photo-list hidden></ol>
    <p class="help" role="status" data-photo-status></p>
  </section>`;
}

function bindPhotoEditor(form, existing = []) {
  const editor = form.querySelector('[data-photo-editor]');
  const list = editor.querySelector('[data-photo-list]');
  const fileInput = editor.querySelector('[data-photo-input]');
  const addButton = editor.querySelector('[data-photo-add]');
  const hint = editor.querySelector('[data-photo-hint]');
  const status = editor.querySelector('[data-photo-status]');
  const photos = [...existing];
  let pending = Promise.resolve();
  const action = (index, key, label, symbol, disabled = false) =>
    `<button type="button" class="icon-button" data-photo-action="${key}" aria-label="${label} la photo ${index + 1}" title="${label} la photo ${index + 1}" ${disabled ? 'disabled' : ''}>${icon(symbol, 15)}</button>`;
  function render() {
    list.hidden = !photos.length;
    hint.textContent = photos.length ? `${photos.length} / ${maxItemPhotos} · La première photo est la principale` : `Facultatives · Jusqu’à ${maxItemPhotos} photos`;
    addButton.disabled = photos.length >= maxItemPhotos;
    list.innerHTML = photos.map((src, index) => `<li class="photo-tile photo-preview" data-photo-index="${index}" draggable="true">
      <img src="${esc(src)}" alt="Photo ${index + 1}${index === 0 ? ', principale' : ''}" draggable="false"><button type="button" data-photo-drag class="photo-drag-handle" aria-label="Déplacer la photo ${index+1}">⠿</button><span class="photo-main-badge">${index===0?'Principale':index+1}</span>
      <div class="photo-preview-actions">
        ${action(index,'earlier','Avancer','left',index === 0)}${action(index,'later','Reculer','arrow',index === photos.length - 1)}${action(index,'remove','Retirer','close')}
      </div></li>`).join('');
    form.dispatchEvent(new Event('photoschange'));
  }
  function addFiles(files) {
    if (!files.length || form.dataset.saving) return;
    pending = pending.then(async () => {
      status.textContent = '';
      const limit = maxItemPhotos - photos.length;
      if (files.length > limit) status.textContent = 'Seules les six premières photos sont gardées.';
      for (const file of files.slice(0,limit)) {
        try { photos.push(await encodePhoto(file)); }
        catch (error) { status.textContent = error.message; }
      }
      render();
    });
  }
  function movePhoto(from, to) {
    if (to < 0 || to >= photos.length || from === to) return;
    photos.splice(to, 0, photos.splice(from, 1)[0]);
    render();
  }
  addButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-photo-action]');
    if (!button || form.dataset.saving) return;
    const from = Number(button.closest('[data-photo-index]').dataset.photoIndex);
    const command = button.dataset.photoAction;
    if (command === 'remove') {
      photos.splice(from, 1);
      render();
      (list.children[Math.min(from,photos.length - 1)]?.querySelector('[data-photo-action="remove"]') || addButton).focus();
    } else {
      const to = from + (command === 'earlier' ? -1 : 1);
      movePhoto(from,to);
      const controls = list.children[to].querySelectorAll('button:not(:disabled)');
      (Array.from(controls).find(control => control.dataset.photoAction === command) || controls[0]).focus();
      status.textContent = `Photo déplacée en position ${to + 1}.`;
    }
  });
  const hasFiles = event => Array.from(event.dataTransfer.types || []).includes('Files');
  bindPhotoOrder(list,{photos,busy:()=>Boolean(form.dataset.saving),changed:render,announce:text=>{status.textContent=text;}});
  editor.addEventListener('dragover',event=>{if(!hasFiles(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';editor.classList.add('photo-over');});
  editor.addEventListener('dragleave',event=>{if(!editor.contains(event.relatedTarget))editor.classList.remove('photo-over');});
  editor.addEventListener('drop',event=>{if(!hasFiles(event))return;event.preventDefault();editor.classList.remove('photo-over');addFiles(Array.from(event.dataTransfer.files));});
  render();
  return async () => { await pending; return [...photos]; };
}

async function photoFormData(data, photos) {
  return { photos:await photos(), catalog_images:data.getAll('catalog_images') };
}

function descriptionField(value) {
  return field('Descriptif', `<textarea name="description" maxlength="1200" rows="3">${esc(value)}</textarea>`);
}

function effectiveReference(row) {
  return row.reference_confirmed ? row.reference : { ...catalogPrefill(row.catalog), ...row.reference };
}

function referenceInputs(category, values) {
  return `<div class="form-row">${referenceFields(category).map(([name, label]) => {
    const value = name === 'pagination' ? pageCountValue(values?.[name]) : values?.[name];
    const numeric = name === 'pagination' && /^\d*$/.test(value);
    return field(label, input('ref_' + name, `maxlength="120" ${numeric ? 'inputmode="numeric" pattern="[0-9]+"' : ''} value="${esc(value)}"`));
  }).join('')}</div>`;
}

function formReference(data, category) {
  return Object.fromEntries(referenceFields(category).map(([key]) => [key, data.get('ref_' + key)]));
}

function referenceCard(category, values, statuses) {
  if (!values) return '';
  const facts = referenceFields(category).filter(([name]) => values[name]);
  if (!facts.length) return '';
  return `<section class="catalog-card" aria-label="Caractéristiques de la fiche">
    <h2>Caractéristiques de la fiche</h2>
    <dl>${facts.map(([name, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(name === 'pagination' ? pageCountValue(values[name]) : values[name])}${statuses?.[name]==='inferred'?'<small class="assist-field-status">Proposition visuelle à confirmer</small>':''}</dd></div>`).join('')}</dl>
  </section>`;
}

function catalogCard(info, showTitle = false) {
  if (!info) return '';
  const source = catalogSource(info);
  if (!source) return '';
  const primary = [
    ['Auteur', info.author], ['Éditeur', info.publisher],
    ['Pagination', info.pages ? info.pages + ' pages' : info.pagination],
    ['Traduction', info.translator],
    ['Marque', info.brand], ['Modèle', info.model],
  ];
  const additional = [
    ['Parution', info.published], ['Édition', info.edition], ['Collection', info.collection],
    ['Format', info.format], ['Conditionnement', info.packaging],
    ['Prix éditeur neuf', info.retailPriceCents ? euro.format(info.retailPriceCents / 100) : ''],
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

function scanPage(main,{intake=false,draft,resume}={}) {
  const canFlip = handheld.matches || window.matchMedia('(pointer: coarse)').matches;
  main.innerHTML = (intake?'':header('Scanner', 'Retrouvez un produit par son code, sa référence ou son nom.',allowed('reception','tri')?button('Réceptionner un produit','receive','scan-new-entry') :''))
    + (intake?`<div class="scan-modes" role="tablist" aria-label="Commencer une réception"><button id="scan-code-tab" class="btn" role="tab" aria-selected="false" aria-controls="scan-code-panel" tabindex="-1">${icon('scan',18)} Code-barres</button><button id="scan-photo-tab" class="btn" role="tab" aria-selected="true" aria-controls="scan-product-assist">${icon('camera',18)} Photos + IA</button><button id="scan-manual-tab" class="btn" role="tab" aria-selected="false" aria-controls="scan-manual-panel" tabindex="-1">Saisie manuelle</button></div><div id="scan-product-assist" role="tabpanel" aria-labelledby="scan-photo-tab"></div><div id="scan-manual-panel" role="tabpanel" aria-labelledby="scan-manual-tab" hidden><div id="receiving-form"></div></div>`:'')
    + `<section id="scan-code-panel" class="scan-panel" ${intake?'role="tabpanel" aria-labelledby="scan-code-tab" hidden':'aria-label="Retrouver une fiche"'}>
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
        <label class="btn scan-photo">${icon('image', 16)} Importer un code
          <input type="file" id="scan-photo" accept="image/*">
        </label>
        <label class="btn scan-photo scan-capture" hidden><input type="file" id="scan-capture" accept="image/*" capture="environment"></label>
      </div>
      <form id="scan-form">
        <label class="field"><span>Code-barres, référence ou nom ${keyHint('R')}</span>
          ${input('code', `id="scan-input" aria-keyshortcuts="${shortcutKeys('R')}" required maxlength="120" autocomplete="off" placeholder="Ex. 9782010212758 ou vase en grès"`)}
        </label>
        <button type="submit" class="btn">${icon('search', 16)} Rechercher</button>
        <div class="form-error" role="alert"></div>
      </form>
      <div id="scan-error" class="form-error" role="alert"></div><details><summary>Réglages du lecteur</summary>${button('Matériel', '', 'scan-hardware')}</details>
    </section>
<section id="scan-results" class="scan-results" aria-live="polite"></section>
    <section id="market-panel" class="scan-panel scan-object market-panel" aria-labelledby="market-title" hidden>
      <h2 id="market-title">Prix vus en ligne</h2>
      <form>
        ${field('Préciser la recherche', input('query', 'required maxlength="120" placeholder="Ex. marque, modèle ou inscription"'))}
        <button type="submit" class="btn">${icon('search', 16)} Rechercher</button>
      </form>
      <div data-market-results aria-live="polite"></div>
      <div><button type="button" class="btn" data-find-collections>Rechercher dans les collections d’objets anciens</button></div>
      <div data-market-collections aria-live="polite"></div>
    </section>`;
  on('scan-hardware', () => showHardware(() => startCamera(preferredCamera, true)));
  const codeInput = document.getElementById('scan-input');
  const target = document.getElementById('scan-results');
  const market = bindMarket(document.getElementById('market-panel'), { esc, euro });
  const cameraError = document.getElementById('scan-error');
  const cameraPanel = document.getElementById('scan-camera-panel');
  const cameraSelect = document.getElementById('scan-device');
  const frame = document.getElementById('scan-frame');
  const hint = document.getElementById('scan-hint');
  const zoomButtons = [...cameraPanel.querySelectorAll('[data-scan-zoom]')];
  let zoomCamera;
  let lookup = 0;
  function showScanMode(mode){if(!intake)return;endScan();for(const name of ['photo','code','manual']){const selected=name===mode,tab=document.getElementById('scan-'+name+'-tab');tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}document.getElementById('scan-product-assist').hidden=mode!=='photo';document.getElementById('scan-manual-panel').hidden=mode!=='manual';document.getElementById('scan-code-panel').hidden=mode!=='code';target.hidden=mode!=='code';document.getElementById('market-panel').hidden=mode!=='code'||!document.getElementById('market-panel').querySelector('[data-market-results]').hasChildNodes();if(mode==='code'&&keyboardPointer.matches)codeInput.focus({preventScroll:true});}
  function openIntake(value){if(!intake)return go('accueil',false,'',value);showScanMode('manual');receive({inline:true,...value});}
  on('scan-new-entry',()=>go('accueil'));
  if(intake){const modes=['code','photo','manual'];for(const mode of modes){const tab=document.getElementById('scan-'+mode+'-tab');tab.addEventListener('click',()=>showScanMode(mode));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'code':event.key==='End'?'manual':modes[(modes.indexOf(mode)+(event.key==='ArrowLeft'?2:1))%3];showScanMode(next);document.getElementById('scan-'+next+'-tab').focus();}});}receive({inline:true,resume,...draft});showScanMode(draft||resume?'manual':'photo');}else if(!handheld.matches)codeInput.focus({preventScroll:true});

  async function renderResult(rawCode,prefill={}) {
    const current = ++lookup;
    const key = normalizeScanCode(rawCode);
    target.innerHTML = '';
    market.reset();
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
    if (!rows.length && !type && !/^(?:OBJ|LOT)-/i.test(key) && /[\p{L}]/u.test(key)) {
      target.innerHTML='<p class="notice">Aucune fiche trouvée pour ce nom.</p>';
      if (allowed('reception', 'tri')) {
        target.innerHTML = button('Créer une fiche', 'plus', 'scan-name-add', 'primary');
        on('scan-name-add', () => openIntake({ title:key, fromScan:true }));
      }
      return;
    }
    const marketResult = false;
    let info = rows.find(row => row.catalog?.code === key)?.catalog;
    const referenceRow = rows.filter(row => row.reference)
      .sort((a, b) => (b.reference_updated_at || '').localeCompare(a.reference_updated_at || ''))[0];
    target.innerHTML = (rows.length ? recentEntries(rows) : '')
      + referenceCard(referenceRow?.category, referenceRow?.reference)
      + '<div id="scan-catalog"></div>'
      + (type ? '<div class="price-suggestion" id="scan-price"></div>' : '')
      + (allowed('reception', 'tri')
        ? button(rows.length ? 'Ajouter un autre exemplaire' : 'Créer une fiche', 'plus', 'scan-add', 'primary')
        : '');
    bindStock(target);
    const catalog = target.querySelector('#scan-catalog');
    const add = target.querySelector('#scan-add');
    const price = target.querySelector('#scan-price');
    let entered = false;

    function scanDraft() {
      const item = rows[0];
      const title = item && item.title !== item.category ? item.title : '';
      return {
        photo:prefill.photo,photos:prefill.photos,priceCents:prefill.priceCents,condition:prefill.condition,barcode:key, title:title || info?.title || [info?.brand, info?.model].filter(Boolean).join(' '),
        category:referenceRow?.category || item?.category || (type === 'book' ? 'Livres' : ''),
        catalog:info, reference:referenceRow?.reference, referenceConfirmed:referenceRow?.reference_confirmed,
        fromScan:true,
      };
    }

    function display(message) {
      catalog.innerHTML = info ? catalogCard(info, true) : message ? `<p class="notice">${esc(message)}</p>` : '';
      watchCatalogImages(catalog);
      if (info && add && !rows.length) add.innerHTML = icon('plus', 16) + ' Créer la fiche préremplie';
      if (price) {
        const draft = scanDraft();
        price.innerHTML = priceMessage(priceEstimate(stock, { ...draft, site_id:workingSite()?.id, kind:'item',
          reference:{ ...catalogPrefill(info), ...draft.reference } }));
      }
    }

    function openEntry() {
      entered = true;
      openIntake(scanDraft());
    }
    on('scan-add', openEntry);

    if (info?.retrieved || !type) {
      display(rows.length ? '' : 'Aucune fiche pour ce code.');
      if(intake&&info&&!entered)openEntry();
      return;
    }

    display('Recherche dans le catalogue…');
    const active = () => target.isConnected && current === lookup;
    async function finish(result, message) {
      if (!active()) return;
      const found = result || info || await marketResult;
      if (!active()) return;
      info = found;
      display(rows.length ? '' : message);
      if (!rows.length && add && !entered) openEntry();
    }
    lookupCatalog(key).then(
      result => finish(result, 'Aucune information de catalogue trouvée pour ce code.'),
      () => finish(null, 'Catalogue indisponible. La saisie manuelle est disponible.')
    ).catch(report);
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
    market.reset();
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

    const site=workingSite();
    if(!site)return notice('Choisissez un site de réception.');
    if(intake)mountProductAssist(document.getElementById('scan-product-assist'),{keyHint,onCameraClose:()=>{stopObjectCamera=null;},onCameraOpen:stop=>{endScan();stopObjectCamera=stop;},site,categories:siteCategories(site),esc,euro,referenceInputs,encodePhoto,notice,
      origins,getStock:()=>stock,canCreate:allowed('reception','tri'),currency:config.currency || 'EUR',allowPrice:true,onSave:async draft=>{const row=await api('/stock',{method:'POST',body:{kind:'item',category:draft.category,title:draft.title,site_id:site.id,zone_id:draft.zoneId,origin:draft.origin,barcode:draft.barcode,reference:draft.reference,reference_confirmed:draft.referenceConfirmed,reference_status:draft.referenceStatus,description:draft.description,condition:draft.condition,visual_condition:draft.visual_condition,functionality:draft.functionality,price_cents:draft.priceCents??null,note:draft.note,pricing_evidence:draft.pricing_evidence,photos:draft.photos||[]}});await changed('Entrée enregistrée · '+row.code+' · Prêt pour la photo suivante.');},onCreate:draft=>openIntake(draft),onCode:(code,draft)=>{showScanMode('code');renderResult(code,draft);}});
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

  let cameraSetup = false;
  async function startCamera(choice = preferredCamera, setup = false) {
    cameraSetup = setup;
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
        if (setup) {
          clearTimeout(hintTimer);
          hint.textContent = 'Code lu · ' + code;
          return;
        }
        endScan();
        codeInput.value = code;
        renderResult(code).catch(error => { cameraError.textContent = error.message; });
      });
      rememberCamera(choice);
      await cameraOptions(track, choice, () => active);
    } catch (error) {
      if (!active) return;
      endScan();
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        cameraError.textContent = 'Accès caméra refusé. Vérifiez l’autorisation du site dans Chrome ou Safari, ou utilisez une photo du code.';
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        rememberCamera('auto');
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
    return startCamera(choice, cameraSetup);
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
    <div class="card-line">${stockVisual(r)}<strong class="detail-code">${esc(r.code)}</strong>${status(r)}</div>
    ${ownGallery(photos)}
    ${catalogGallery(r.catalog, r.catalog_images || [])}
    <div class="notice">${esc(r.category)} · ${esc(measure(r))}${r.price_cents != null ? ' · '+euro.format(r.price_cents/100) : ''}<br>${r.state==='transit' ? 'En déplacement' : esc([r.site_name,r.zone_name].filter(Boolean).join(' / '))}
    ${r.parent_code ? '<br>Lot d’origine '+esc(r.parent_code) : ''}${r.condition ? '<br>État · '+esc(r.condition) : ''}${r.barcode ? '<br>Code fabricant · '+esc(r.barcode) : ''}</div>
    ${r.functionality&&r.functionality!=='not_applicable'?'<p class="help">Fonctionnement · '+esc(functionalityOptions.find(([key])=>key===r.functionality)?.[1]||'Non testé')+'</p>':''}${r.visual_condition?.summary?'<section class="catalog-card"><h3>État visuel proposé depuis la photo</h3><p>'+esc(r.visual_condition.summary)+'</p><p class="help">'+esc(r.visual_condition.limits)+'</p></section>':''}
    ${r.note ? '<p class="help">'+esc(r.note)+'</p>' : ''}
    ${catalogCard(r.catalog)}
    ${referenceCard(r.category, effectiveReference(r),r.reference_confirmed?null:r.reference_status)}
    ${description ? `<section aria-label="Descriptif"><h3>Descriptif</h3><p class="item-description">${esc(description)}</p></section>` : ''}
    <div class="detail-actions">
      ${active && allowed('tri','atelier') ? button('Marquer prêt','check','detail-ready','primary') : ''}
      ${active && allowed('atelier') && isModuleEnabled(config,'atelier') ? button('Noter une intervention','wrench','detail-workshop') : ''}
      ${active && control ? button('Mettre à vérifier','wrench','detail-block') : ''}
      ${active && r.kind === 'lot' && allowed('tri','reception') ? button('Isoler un objet','plus','detail-isolate') : ''}
      ${active && allowed('stock','tri','atelier') ? button('Ranger dans une zone','pin','detail-move') : ''}
      ${active && allowed('stock','tri') && sites.length > 1 ? button('Transférer','truck','detail-transfer') : ''}
      ${active && allowed('stock','vente') ? button('Enregistrer une sortie','arrow','detail-exit','danger') : ''}
      ${button('Imprimer l’étiquette','printer','print-label')}
      ${button('Étiquette QR','printer','print-label-qr')}
      ${active && allowed('stock') && isModuleEnabled(config,'vitrine') && (r.web_visible || (r.state === 'pret' && r.price_cents != null))
        ? button(r.web_visible ? 'Retirer du catalogue' : 'Afficher au catalogue','image','detail-storefront') : ''}
      ${active && control ? button('Corriger les informations','info','detail-edit') : ''}
      ${active && control ? button('Modifier le descriptif','info','detail-reference') : ''}
      ${active && control ? button(photos.length || r.catalog_images?.length ? 'Gérer les photos' : 'Ajouter des photos','camera','detail-photo') : ''}
    </div>
    ${page === 'scanner' ? button('Retour au scanner', 'scan', 'detail-scan', 'ghost') : ''}
    <details><summary>Historique · ${r.history.length} actions</summary><ul class="log">${r.history.map(e=>`<li>${esc(e.detail)}<span>${esc(e.name)} · ${date(e.created_at)}</span></li>`).join('')}</ul></details>
  </div>`);
  on('print-label',()=>printLabel(r));
  on('print-label-qr',()=>printLabel(r, true));
  on('detail-storefront', async () => {
    await api('/stock/'+r.id+'/action',{method:'POST',body:{action:'storefront',visible:!r.web_visible}});
    await changed(r.web_visible ? 'Article retiré de la vitrine.' : 'Article visible dans la vitrine.');
    await detail(r.id);
  });
  on('detail-scan', () => {
    closeDialog();
    document.getElementById('scan-camera')?.focus();
  });
  on('detail-edit',()=>actionForm(r,'edit','Corriger la fiche',
    field('Nom',input('title',`required maxlength="150" value="${esc(r.title)}"`))
    +field('Code-barres',input('barcode',`maxlength="80" value="${esc(r.barcode)}"`))
    +field('Provenance',input('origin',`maxlength="100" value="${esc(r.origin)}"`))
    +field('Note',`<textarea name="note" maxlength="1000">${esc(r.note)}</textarea>`)
    +(!demoMode && contacts.length ? field('Contact associé',`<select name="contact_id">${option('','Aucun',r.contact_id)}${contacts.map(row=>option(row.id,row.name,r.contact_id)).join('')}</select>`) : ''),
    data=>({...Object.fromEntries(data),contact_id:data.has('contact_id') ? data.get('contact_id') || null : r.contact_id || null})));
  on('detail-block',()=>actionForm(r,'block','Mettre de côté',field('Motif du contrôle','<textarea name="note" required maxlength="500" placeholder="Ex. câble abîmé"></textarea>'),d=>({note:d.get('note')})));
  on('detail-ready',()=>actionForm(r,'ready','Valider le tri',field('État visuel',input('condition',`maxlength="100" placeholder="Ex. Testé, fonctionne" value="${esc(r.condition)}"`)) +field('Fonctionnement',`<select name="functionality">${functionalityOptions.map(([key,label])=>option(key,label,r.functionality || 'untested')).join('')}</select>`)+ field('Prix ('+(config.currency || 'EUR')+')',input('price',`type="number" min="0" step="0.01" value="${r.price_cents == null ? '' : r.price_cents/100}"`)),d=>({functionality:d.get('functionality'),condition:d.get('condition'),price_cents:d.get('price') !== '' ? Math.round(Number(d.get('price'))*100) : null})));
  on('detail-workshop', () => actionForm(r, 'workshop', 'Intervention atelier',
    field('Type', `<select name="operation" required>${option('','Choisir une intervention')}${workshopTypes.map(type => option(type,type)).join('')}</select>`)
    + field('Temps passé (minutes)', input('minutes','type="number" required min="1" max="1440" step="1" inputmode="numeric"'))
    + field('Note facultative', '<textarea name="note" maxlength="500"></textarea>'),
    data => ({operation:data.get('operation'), minutes:Number(data.get('minutes')), note:data.get('note')})));
  on('detail-move',()=>actionForm(r,'move','Changer de zone',field('Zone',`<select name="zone_id" required>${zones(r.site_id,'','Choisir une zone')}</select>`),d=>({zone_id:d.get('zone_id')})));
  on('detail-reference', () => actionForm(r, 'reference', 'Descriptif et caractéristiques',
    referenceInputs(r.category, effectiveReference(r)) + descriptionField(description),
    data => ({ reference:formReference(data, r.category), description:data.get('description') })));
  on('detail-photo', () => {
    const form = actionForm(r, 'photo', 'Photos de la fiche',
      photoEditor() + catalogGallery(r.catalog, r.catalog_images || [], true),
      data => photoFormData(data, readPhotos));
    const readPhotos = bindPhotoEditor(form, photos);
  });

  on('detail-isolate',()=>receive({parent:r}));
  on('detail-transfer',()=>newTransfer(r.site_id,r.id));
  on('detail-exit',()=>actionForm(r,'exit','Confirmer la sortie',field('Motif',`<select name="exit_type" required><option value="">Choisir un motif</option>${allowed('vente')&&r.state==='pret'?option('vente','Vente'):''}${option('don','Don')}${option('recyclage','Recyclage')}${option('decheterie','Déchèterie')}</select>`)+'<p class="help">Cette fiche sera retirée du stock disponible.</p>',d=>({exit_type:d.get('exit_type')})));
}
function actionForm(row,action,title,fields,body) {
  const continueReview = action === 'ready' && page === 'controle';
  showDialog(title,`<form id="action-form">${fields}${continueReview ? '<label class="check"><input type="checkbox" name="review_next" checked>Ouvrir le prochain objet à vérifier après enregistrement</label>' : ''}${formEnd('Enregistrer')}</form>`);
  formSubmit('action-form',async d=>{
    await api('/stock/'+row.id+'/action',{method:'POST',body:{action,...await body(d)}});
    await changed('Fiche mise à jour.');
    if (continueReview && d.has('review_next')) {
      const terms = searchText(search).split(/\s+/).filter(Boolean);
      const next = siteRows().find(item => item.id !== row.id && item.state === 'controle' && terms.every(term => stockSearchText(item).includes(term)));
      if (next) await detail(next.id);
      else notice('Vérification terminée pour cette sélection.');
    } else await detail(row.id);
  });
  return document.getElementById('action-form');
}
function downloadStock() {
  const columns = ['code','title','category','kind','state','site_name','zone_name','quantity','grams','price_cents','barcode','parent_code'];
  downloadCsv(demoMode ? 'stock-seconde-vie-demo.csv' : 'stock-seconde-vie.csv', columns, stock.map(row => columns.map(key => row[key])));
}
function downloadCsv(filename, columns, rows) {
  const csv = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  };
  const content = [columns.map(csv).join(';'), ...rows.map(row => row.map(csv).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function printLabel(row, qr = false) {
  const symbol = qr ? '<div class="label-qr">' + await qrSvg(row.code, {margin:4, errorCorrectionLevel:'M'}) + '</div>'
    : code128Svg(row.code);
  printContent(`<p class="label-category">${esc(row.category)}</p><h2>${esc(row.title)}</h2><p class="label-price">${row.price_cents == null ? 'Prix à définir' : euro.format(row.price_cents/100)}</p>${symbol}<p class="label-code">${esc(row.code)}</p>`);
}

function printContent(markup, wide = false) {
  const section = document.createElement('section');
  section.className = 'print-label' + (wide ? ' print-document' : '');
  section.innerHTML = markup;
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
    </div>
    <div class="transfer-scan">
      ${field('Scanner ou rechercher une fiche',input('lookup','id="transfer-scan" type="search" maxlength="160" autocomplete="off" placeholder="Nom, catégorie ou code de l’étiquette…" aria-describedby="transfer-scan-help"'))}
      ${button('Ajouter','plus','transfer-scan-add')}
    </div>
    <p class="help" id="transfer-scan-help">Scannez les étiquettes Seconde Vie à la suite, ou ajoutez les fiches trouvées.</p>
    <p class="transfer-feedback" id="transfer-feedback" role="status"></p>
    <div id="transfer-results"></div>
    <fieldset><legend id="transfer-count">À expédier</legend><div id="transfer-stock"></div></fieldset>
    ${formEnd('Marquer comme parti')}</form>`);
  const form = document.getElementById('transfer-form');
  const originInput = document.getElementById('transfer-origin');
  const destinationInput = document.getElementById('transfer-destination');
  const lookup = document.getElementById('transfer-scan');
  const results = document.getElementById('transfer-results');
  const selectedList = document.getElementById('transfer-stock');
  const feedback = document.getElementById('transfer-feedback');
  const selected = new Map();
  const byCode = new Map(stock.map(row => [row.code.toUpperCase(),row]));
  let entries, eligible;

  function drawResults() {
    const terms = searchText(lookup.value).split(/\s+/).filter(Boolean);
    if (!terms.length) { results.innerHTML = ''; return; }
    const matches = entries.filter(({row,text}) => !selected.has(row.id) && terms.every(term => text.includes(term)));
    results.innerHTML = matches.length ? `<ul class="transfer-list checklist" aria-label="Résultats de recherche">
      ${matches.slice(0,12).map(({row}) => `<li><button type="button" data-transfer-add="${esc(row.id)}">
        <span>${esc(row.title)} <small>${esc(row.category)} · ${esc(row.code)}</small></span>${icon('plus',16)}</button></li>`).join('')}
      </ul>${matches.length > 12 ? `<p class="help">12 résultats sur ${matches.length}. Affinez la recherche.</p>` : ''}`
      : '<p class="help">Aucune fiche disponible pour cette recherche.</p>';
  }

  function drawSelection() {
    document.getElementById('transfer-count').textContent = `À expédier · ${selected.size} fiche${selected.size > 1 ? 's' : ''}`;
    selectedList.innerHTML = selected.size ? `<ul class="transfer-list checklist">
      ${[...selected.values()].map(row => `<li><input type="hidden" name="stock_ids" value="${esc(row.id)}">
        <span>${esc(row.title)} <small>${esc(row.code)} · ${esc(measure(row))}</small></span>
        <button type="button" class="icon-button" aria-label="Retirer ${esc(row.title)}" data-transfer-remove="${esc(row.id)}">${icon('close',16)}</button></li>`).join('')}</ul>`
      : '<p class="help">Les fiches ajoutées apparaîtront ici.</p>';
  }

  function resetOrigin() {
    const site = originInput.value;
    destinationInput.innerHTML = option('','Choisir un site') + siteOptions('',site);
    const rows = stock.filter(row => row.site_id === site && !['sorti','transit'].includes(row.state));
    eligible = new Map(rows.map(row => [row.id,row]));
    entries = rows.map(row => ({ row, text:stockSearchText(row) }));
    selected.clear();
    lookup.value = '';
    drawResults();
    drawSelection();
  }

  function add(row) {
    if (!row) return;
    if (selected.has(row.id)) {
      feedback.textContent = row.title + ' est déjà dans ce transfert.';
    } else {
      selected.set(row.id,row);
      feedback.textContent = row.title + ' ajouté.';
      drawSelection();
    }
    lookup.value = '';
    drawResults();
    lookup.focus({preventScroll:true});
  }

  function addCode() {
    const value = lookup.value.trim();
    if (!value) { lookup.focus(); return; }
    const row = byCode.get(value.toUpperCase());
    if (row && eligible.has(row.id)) add(row);
    else {
      feedback.textContent = row ? 'Cette fiche est indisponible pour ce départ.' :
        'Aucune étiquette Seconde Vie ne correspond. Vous pouvez choisir une fiche dans les résultats.';
      lookup.select();
    }
  }

  resetOrigin();
  const first = eligible.get(preselected);
  if (first) add(first);
  lookup.focus({preventScroll:true});
  originInput.addEventListener('change', () => {
    feedback.textContent = selected.size ? 'Site de départ changé. La sélection a été vidée.' : '';
    resetOrigin();
  });
  lookup.addEventListener('input', () => { feedback.textContent = ''; drawResults(); });
  lookup.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addCode(); }
  });
  on('transfer-scan-add',addCode);
  results.addEventListener('click', event => {
    const target = event.target.closest('[data-transfer-add]');
    if (target) add(eligible.get(target.dataset.transferAdd));
  });
  selectedList.addEventListener('click', event => {
    const target = event.target.closest('[data-transfer-remove]');
    if (!target) return;
    const id = target.dataset.transferRemove;
    feedback.textContent = selected.get(id).title + ' retiré.';
    selected.delete(id);
    drawSelection();
    drawResults();
    lookup.focus({preventScroll:true});
  });
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
  main.innerHTML = header('Équipe', 'Cumulez les fonctions selon le poste. Caisse et rapports sont deux droits distincts.', button('Ajouter une personne','plus','team-add','primary'))
    + '<div class="cards">' + team.map(m=>`<article class="card"><div class="card-line">${profileAvatar(m)}<h2>${esc(m.name)}</h2><span class="pill ${m.active?'pret':'sorti'}">${m.active?'Actif':'Désactivé'}</span></div>
    <p>${esc(m.email)}</p><p>${esc(m.roles.map(r=>roleNames[r]).join(' · '))}</p>${button('Modifier les fonctions','users','member-'+m.id)}</article>`).join('') + '</div>';
  on('team-add',()=>memberForm());
  team.forEach(m=>on('member-'+m.id,()=>memberForm(m)));
}
function memberForm(member) {
  const roles = member?.roles || ['reception'];
  showDialog(member ? member.name : 'Ajouter une personne',`<form id="member-form">
    ${field('Nom',input('name',`maxlength="100" required value="${esc(member?.name)}"`))}
    ${field(demoMode ? 'E-mail fictif' : 'E-mail du compte de connexion',input('email',`type="email" maxlength="254" placeholder="exemple@example.test" required value="${esc(member?.email)}"`))}
    <fieldset><legend>Fonctions</legend><div class="form-row">${Object.entries(roleNames).map(([id,label])=>`<label class="check"><input type="checkbox" name="roles" value="${id}" ${roles.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset>
    ${demoMode ? field('Code terrain (4 à 6 chiffres)',input('pin','type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off"')) : ''}
    <p class="help">${demoMode ? (member ? 'Laissez vide pour conserver le code.' : 'Choisissez un code pour ce profil de démonstration.') : 'La personne utilisera son propre compte avec cette adresse. Son accès au site doit aussi être autorisé dans les réglages de partage du site.'}</p>
    ${field(demoMode ? 'Photo fictive (facultative)' : 'Photo (facultative)', input('photo','type="file" accept="image/jpeg,image/png,image/webp"'))}
    ${member && member.id !== me.id ? `<label class="check"><input type="checkbox" name="active" ${member.active?'checked':''}> Compte actif</label>` : ''}
    ${formEnd('Enregistrer')}</form>`);
  formSubmit('member-form',async d=>{
    const body = { roles:d.getAll('roles'), pin:d.get('pin'),name:d.get('name'),email:d.get('email') };
    const photo = d.get('photo');
    if (photo?.size) {
      if (photo.size > 250000 || !['image/jpeg','image/png','image/webp'].includes(photo.type))
        throw new Error('Choisissez une image JPEG, PNG ou WebP de 250 Ko maximum.');
      body.photo = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Photo illisible.'));
        reader.readAsDataURL(photo);
      });
    }
    if (member) body.active = member.id === me.id || d.has('active');
    else Object.assign(body,{name:d.get('name'),email:d.get('email')});
    await api('/team'+(member?'/'+member.id:''),{method:member?'PATCH':'POST',body});
    await changed('Équipe mise à jour.');
  });
}
function storefrontPage(main) {
  main.innerHTML = header('Catalogue',me.org_name,admin()?button('Configurer mon site','settings','catalogue-configure')+button('Publier les photos','upload','catalogue-publish','primary'):'')
    + `<p class="help">Sélectionnez vos objets prêts et tarifés depuis leur fiche de stock. Les objets sortis quittent le catalogue lors de la prochaine mise à jour.</p>
      <div data-catalogue-status role="status"></div><div class="toolbar storefront-toolbar">${field('Chercher dans la vitrine',input('query','id="storefront-search" type="search" autocomplete="off"'))}
      <div id="storefront-categories"></div></div><div id="storefront-results" aria-live="polite"><p>Chargement…</p></div>`;
  main.querySelector('#catalogue-configure')?.addEventListener('click',()=>catalogueSettings({api,esc,showDialog,formSubmit,formEnd,field,input,config,me,changed,demo:demoMode}));
  const catalogueStatus=main.querySelector('[data-catalogue-status]');
  const drawStatus=data=>{if(!catalogueStatus.isConnected)return;catalogueStatus.innerHTML=demoMode?'<p class="notice">Aperçu de démonstration : les exemples ne sont pas publiés.</p>':data.error?`<p class="form-error">Mise à jour à reprendre : ${esc(data.error)}</p>`:config.catalogue?.enabled&&data.url?`<p class="notice"><a href="${esc(data.url)}" target="_blank" rel="noopener">Ouvrir le site de ma ressourcerie ↗</a> · ${data.count} objet(s) · ${data.last_sync?esc(new Date(data.last_sync).toLocaleString('fr-FR')):''}</p>`:'<p class="help">Votre catalogue internet est désactivé. Configurez-le pour partager vos produits.</p>';};
  api('/catalogue-status').then(drawStatus).catch(error=>{catalogueStatus.textContent=error.message;});
  main.querySelector('#catalogue-publish')?.addEventListener('click',async event=>{event.target.disabled=true;main.dataset.planningBusy='1';try{let data,attempt=0;do{catalogueStatus.textContent='Publication des photos et des produits…';data=await api('/catalogue-publish',{method:'POST',body:{}});attempt++;}while(data.pending>0&&attempt<50&&main.isConnected);drawStatus(data);if(data.pending)notice(data.pending+' fiche(s) restent à publier. Relancez la publication.');else notice('Catalogue mis à jour.');}catch(error){catalogueStatus.textContent=error.message;}finally{main.dataset.planningBusy='0';event.target.disabled=false;}});
  const result = main.querySelector('#storefront-results');
  const query = main.querySelector('#storefront-search');
  api('/storefront').then(rows => {
    if (!result.isConnected) return;
    const items = rows.filter(row => !siteFilter || row.site_id === siteFilter);
    const categories = [...new Set(items.map(row => row.category))].sort((a,b) => a.localeCompare(b,'fr'));
    main.querySelector('#storefront-categories').innerHTML = field('Catégorie', `<select id="storefront-category">
      ${option('', 'Toutes les catégories')}${categories.map(name => option(name,name)).join('')}</select>`);
    const category = main.querySelector('#storefront-category');
    function draw() {
      const text = searchText(query.value);
      const found = items.filter(row => (!category.value || row.category === category.value)
        && searchText(row.title + ' ' + row.category).includes(text));
      result.innerHTML = found.length ? `<div class="cards storefront-grid">${found.map(row => `<article class="card">
        <div class="storefront-picture">${row.photo ? `<img src="${esc(row.photo)}" alt="" loading="lazy">` : categoryTile(row.category)}</div>
        <p class="help">${esc(row.category)}</p><h2>${esc(row.title)}</h2>
        <p><strong>${row.price_cents ? euro.format(row.price_cents / 100) : 'Gratuit'}</strong></p>
        ${row.description ? `<p>${esc(row.description)}</p>` : ''}<p class="help">${esc(row.site_name)}</p>
      </article>`).join('')}</div>` : '<p class="surface empty">Aucun article disponible pour cette sélection.</p>';
    }
    query.addEventListener('input',draw);
    category.addEventListener('change',draw);
    draw();
  }).catch(() => { result.textContent = 'Vitrine indisponible.'; });
}

function activityPage(main, register = false) {
  main.innerHTML = header(register ? 'Préparer le registre' : 'Rapports et flux',
    register ? 'Retrouvez les entrées et leurs références internes.' : 'Suivez les mouvements, les ventes et le temps passé en atelier.')
    + (register ? `<section class="notice stack"><strong>Journal préparatoire · données de démonstration</strong>
      <p>Vérifiez si votre structure doit tenir un registre des objets mobiliers. Utilisez le registre prévu par votre structure pour les inscriptions légales.</p>
      <p>Utilisez uniquement des données fictives ici. Les références de pièces d’identité sont à saisir dans le registre dédié.</p>
      <a href="https://entreprendre.service-public.gouv.fr/vosdroits/F39552" target="_blank" rel="noopener noreferrer">Consulter les obligations sur Service Public</a></section>` : '')
    + `<section class="surface activity-panel stack">
      <div class="form-row">
        ${field('Du', input('from', 'type="date" id="activity-from"'))}
        ${field('Au', input('to', 'type="date" id="activity-to"'))}
        ${register ? '' : field('Mouvement dans le journal', `<select id="activity-type">${option('', 'Tous les mouvements')}
          ${Object.entries(flowLabels).map(([value,label]) => option(value, label)).join('')}</select>`)}
      </div>
      <div id="activity-result" aria-live="polite"><p>Chargement…</p></div>
      <div>${button(register ? 'Exporter les entrées (CSV)' : 'Exporter les mouvements (CSV)', 'download', 'activity-export', '', 'disabled')}
        ${register ? '' : button('Exporter les ventes (CSV)', 'download', 'activity-sales-export', '', 'disabled')}</div>
      <p class="help">${demoMode ? 'Exports de travail issus de ce navigateur.' : 'Exports issus de l’espace partagé.'} Les poids absents restent vides dans le CSV.</p>
    </section>`;
  const result = main.querySelector('#activity-result');
  const from = main.querySelector('#activity-from');
  const to = main.querySelector('#activity-to');
  const type = main.querySelector('#activity-type');
  const movementExport = main.querySelector('#activity-export');
  const salesExport = main.querySelector('#activity-sales-export');
  const siteName = id => getSite(id)?.name || 'Site non établi';
  api(register ? '/activity?register=1' : '/activity').then(({events,sales,refunds=[]}) => {
    if (!result.isConnected) return;
    let movements = [], receipts = [], corrections = [];
    const day = timestamp => {
      return new Intl.DateTimeFormat('en-CA',{timeZone:config.timeZone || 'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
    };
    const within = row => {
      if (siteFilter && row.site_id !== siteFilter) return false;
      const value = day(row.created_at);
      return (!from.value || value >= from.value) && (!to.value || value <= to.value);
    };
    const formatKg = grams => decimal.format(grams / 1000) + ' kg';
    function draw() {
      const valid = !from.value || !to.value || from.value <= to.value;
      const period = valid ? events.filter(within) : [];
      movements = period.filter(row => register ? row.type === 'reception' : !type.value || row.type === type.value);
      receipts = valid ? sales.filter(within) : [];
      corrections = valid ? refunds.filter(within) : [];
      movementExport.disabled = !movements.length;
      if (salesExport) salesExport.disabled = !receipts.length && !corrections.length;
      if (!valid) {
        result.innerHTML = '<p>La date de fin doit être égale ou postérieure au début.</p>';
        return;
      }
      const entries = period.filter(row => row.type === 'reception');
      const exits = period.filter(row => ['vente','don','recyclage','decheterie'].includes(row.type));
      const inStock = siteRows().filter(row => !['sorti','transit'].includes(row.state));
      const weighed = entries.filter(row => row.grams != null);
      const minutes = period.reduce((sum,row) => sum + (row.minutes ?? 0), 0);
      result.innerHTML = (register ? '' : `<div class="activity-metrics">
        <div><strong>${entries.length}</strong> Entrées <small>${weighed.length ? formatKg(weighed.reduce((sum,row) => sum + row.grams, 0)) + ' · ' + weighed.length + '/' + entries.length + ' pesées' : 'Poids non renseignés'}</small></div>
        <div><strong>${exits.length}</strong> Sorties de stock</div>
        <div><strong>${inStock.length}</strong> Fiches en stock <small>Stock actuel</small></div>
        <div><strong>${euro.format((receipts.reduce((sum,row) => sum + row.total_cents, 0)-corrections.reduce((sum,row)=>sum+row.amount_cents,0)) / 100)}</strong> Recettes nettes <small>${receipts.length} tickets · ${corrections.length} corrections</small></div>
        <div><strong>${decimal.format(minutes / 60)} h</strong> En atelier</div>
      </div>`)
      + (movements.length ? `<div class="table-scroll"><table><thead><tr><th>Date</th><th>${register ? 'Provenance' : 'Mouvement'}</th><th>Fiche</th><th>Site</th><th>Quantité</th><th>Poids</th></tr></thead>
        <tbody>${movements.slice(0,100).map(row => `<tr><td>${date(row.created_at)}</td><td>${esc(register ? row.origin || '—' : flowLabels[row.type])}
        ${row.type === 'atelier' ? `<small class="minor">${esc(row.detail)}</small>` : ''}</td>
        <td><strong>${esc(row.title)}</strong><small class="minor">${esc(row.code)} · ${esc(row.category)}</small></td>
        <td>${esc(siteName(row.site_id))}</td><td>${row.quantity ?? '—'}</td><td>${row.grams == null ? '—' : formatKg(row.grams)}</td></tr>`).join('')}</tbody></table></div>
        ${movements.length > 100 ? '<p class="help">100 mouvements affichés. Le CSV contient toute la sélection.</p>' : ''}`
        : '<p class="empty">Aucun mouvement pour cette sélection.</p>');
    }
    [from,to,type].filter(Boolean).forEach(control => control.addEventListener('change',draw));
    on('activity-export', () => downloadCsv(register ? 'journal-preparatoire-entrees.csv' : 'mouvements-seconde-vie.csv',
      ['Date','Mouvement','Référence','Objet','Catégorie','Provenance','Site','Quantité','Poids (g)','Temps atelier (min)','Détail'],
      movements.map(row => [row.created_at,flowLabels[row.type],row.code,row.title,row.category,row.origin,siteName(row.site_id),row.quantity,row.grams,row.minutes,row.detail])));
    if (salesExport) on('activity-sales-export', () => downloadCsv('ventes-seconde-vie.csv',
      ['Date','Type','Référence','Ticket lié','Site','Personne en caisse','Règlement','Sous-total (centimes)','Remise (centimes)','Montant net (centimes)'],
      [...receipts.map(row => [row.created_at,'Vente',row.id,row.id,siteName(row.site_id),row.operator_name,row.payment,row.subtotal_cents ?? row.total_cents,row.discount_cents ?? 0,row.total_cents]),...corrections.map(row=>[row.created_at,row.kind==='cancel'?'Annulation':'Remboursement',row.id,row.sale_id,siteName(row.site_id),row.operator_name,row.payment,'','',-row.amount_cents])].sort((a,b)=>a[0].localeCompare(b[0]))));
    draw();
  }).catch(() => { result.textContent = 'Rapports indisponibles.'; });
}

function toursPage(main) {
  main.innerHTML = header('Tournées', 'Planifiez vos collectes et livraisons, puis imprimez la feuille de route.',
    allowed('collecte') ? button('Planifier une tournée','plus','tour-add','primary') : '') + '<div id="tour-list"><p>Chargement…</p></div>';
  const result = main.querySelector('#tour-list');
  const statuses = {planned:'Prévue', done:'Terminée', cancelled:'Annulée'};
  on('tour-add', () => {
    showDialog('Planifier une tournée', `<form id="tour-form" class="stack">
      ${field('Nom', input('label','required maxlength="100" placeholder="Ex. Collecte quartier nord"'))}
      <div class="form-row">${field('Type', '<select name="kind"><option>Collecte</option><option>Livraison</option></select>')}
      ${field('Site', `<select name="site_id" required>${siteOptions(workingSite()?.id)}</select>`)}
      ${field('Départ', input('starts_at', 'type="datetime-local" required'))}</div>
      ${field('Étapes dans l’ordre', '<textarea name="stops" required maxlength="2000" rows="5" placeholder="Une étape fictive par ligne"></textarea>')}
      <p class="help">Utilisez des étapes fictives dans cette démo.</p>
      ${formEnd('Ajouter la tournée')}</form>`);
    formSubmit('tour-form', async data => {
      const body = Object.fromEntries(data);
      body.starts_at = new Date(body.starts_at).toISOString();
      await api('/tours',{method:'POST',body});
      await changed('Tournée planifiée.');
    });
  });
  api('/tours').then(rows => {
    if (!result.isConnected) return;
    const list = rows.filter(row => !siteFilter || row.site_id === siteFilter)
      .sort((a,b) => Number(b.status === 'planned') - Number(a.status === 'planned') || a.starts_at.localeCompare(b.starts_at));
    const stops = row => `<ol>${row.stops.split(/\r?\n/).filter(line => line.trim()).map(line => `<li>${esc(line)}</li>`).join('')}</ol>`;
    result.innerHTML = list.length ? `<div class="cards">${list.map(row => `<article class="card">
      <div class="card-line"><h2>${esc(row.label)}</h2><span class="pill">${statuses[row.status]}</span></div>
      <p>${esc(row.kind)} · ${esc(getSite(row.site_id)?.name)} · ${date(row.starts_at)}</p>${stops(row)}
      <div class="page-actions">${button('Feuille de route','printer','tour-print-'+row.id)}
      ${allowed('collecte') && row.status === 'planned' ? button('Terminer','check','tour-done-'+row.id) + button('Annuler','','tour-cancelled-'+row.id) : ''}</div>
    </article>`).join('')}</div>` : '<p class="surface empty">Aucune tournée pour ce site.</p>';
    list.forEach(row => {
      on('tour-print-'+row.id, () => printContent(`<h2>${esc(row.label)}</h2><p>${date(row.starts_at)}</p>${stops(row)}`));
      for (const status of ['done','cancelled']) on('tour-'+status+'-'+row.id, () => {
        showDialog(status === 'done' ? 'Terminer la tournée' : 'Annuler la tournée', `<form id="tour-status"><p>${esc(row.label)}</p>${formEnd('Confirmer')}</form>`);
        formSubmit('tour-status', async () => {
          await api('/tours/'+row.id,{method:'PATCH',body:{status}});
          await changed('Tournée mise à jour.');
        });
      });
    });
  }).catch(() => { result.textContent = 'Tournées indisponibles.'; });
}

function planningPage(main) {
  mountPlanning(main,{api,esc,header,field,input,button,formEnd,formSubmit,showDialog,changed,notice,me,config,sites,siteFilter,printContent,roleNames}).then(cleanup=>{if(main.isConnected)planningCleanup=cleanup;else cleanup?.();}).catch(report);
}
function sitePage(main) {
  main.innerHTML = header('Sites et zones', 'Organisez les lieux et nommez leurs emplacements.', admin() ? button('Ajouter un site','plus','new-site','primary') : '')
    + '<div class="cards">' + sites.map(s=>`<article class="card"><div class="card-line"><h2>${esc(s.name)}</h2>${tile('building')}</div><p>${esc(s.kind)}</p>
    <div class="tabs">${s.zones.map(z=>`<span class="pill">${esc(z.name)}</span>`).join('') || '<small>Aucune zone renseignée.</small>'}</div>
    <p>${siteCategories(s).length} catégories acceptées à la réception</p>
    ${admin() ? button('Modifier le site et les zones', 'pin', 'site-edit-' + s.id)
      + button('Régler les catégories', 'sort', 'categories-' + s.id) : ''}</article>`).join('') + '</div>';
  sites.forEach(site => on('categories-' + site.id, () => siteCategoryForm(site)));
  sites.forEach(site => on('site-edit-' + site.id, () => {
    showDialog('Modifier le site et les zones', `<form id="edit-site-form" class="stack">
      ${field('Nom du site',input('name',`required maxlength="100" value="${esc(site.name)}"`))}
      ${field('Activités',input('kind',`required maxlength="120" value="${esc(site.kind)}"`))}
      <fieldset><legend>Zones existantes</legend>${site.zones.map(zone => field('Zone',
        input('zone-'+zone.id,`maxlength="80" value="${esc(zone.name)}"`))).join('')}
      <p class="help">Videz le nom pour retirer une zone vide. Une zone contenant des fiches doit être conservée.</p></fieldset>
      ${field('Nouvelles zones, séparées par des virgules',input('new_zones','maxlength="2500"'))}
      ${formEnd('Enregistrer le site')}</form>`);
    formSubmit('edit-site-form',async data => {
      const zones = site.zones.map(zone => ({id:zone.id,name:data.get('zone-'+zone.id).trim()})).filter(zone => zone.name);
      zones.push(...data.get('new_zones').split(',').map(name => ({name:name.trim()})).filter(zone => zone.name));
      await api('/sites/'+site.id,{method:'PATCH',body:{name:data.get('name'),kind:data.get('kind'),zones}});
      await changed('Site et zones mis à jour.');
    });
  }));
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

document.addEventListener('keydown', event => {
  if(dialog.hasAttribute('open')||stopCamera||stopObjectCamera)return;
  const action=keyboardAction(event,{mac:macKeys,page});let target;
  if(action==='search'){if(page==='accueil')document.getElementById('scan-code-tab')?.click();target={accueil:'#scan-input',scanner:'#scan-input',caisse:'#cash-search input',stock:'#stock-search',controle:'#stock-search'}[page];}
  else if(action==='continue')target='[data-assist-form] button[type=submit],#intake-form button[name=next]';
  else if(action==='add')target='#cash-unlabelled';else if(action==='payment')target='#cash-payment';
  const control=target&&[...document.querySelectorAll(target)].find(node=>!node.disabled&&node.getClientRects().length);if(!control)return;
  event.preventDefault();if(action==='search')control.focus();else control.click();
});

function profileAvatar(member) {
  const photo = demoPhoto(member.photo);
  const initials = member.name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
  return photo ? `<img class="avatar" src="${photo}" alt="">` : `<span class="avatar" aria-hidden="true">${esc(initials)}</span>`;
}

function showSignIn(initialOrg = 'passages') {
  planningCleanup?.();planningCleanup=null;
  let org = initialOrg;
  root.innerHTML = `<main class="content sign-in">
    <img src="/mark.svg" alt="" width="48" height="48"><h1>Tester Seconde Vie</h1>
    <p class="help">Accès direct aux profils de test, sans mot de passe ni code. Les données de cette démonstration restent sur ce navigateur.</p>
    ${field('Ressourcerie', `<select id="login-org">${Object.entries(organisations).map(([id,name]) => option(id,name,org)).join('')}</select>`)}
    <section aria-labelledby="login-team-title"><h2 id="login-team-title">Choisir un profil</h2><div id="login-team" class="cards"></div></section>
    <p class="help">Utilisez uniquement des données fictives. Le bouton de profil permet de passer du responsable à un membre de l’équipe pendant les tests.</p>
  </main>`;
  const profiles = root.querySelector('#login-team');
  async function drawProfiles() {
    const selected=org,people=await api('/profiles?org='+encodeURIComponent(org)+'&test_access=1');
    if(selected!==org || !profiles.isConnected)return;
    profiles.innerHTML=people.map(member=>`<button type="button" class="btn profile-choice" id="profile-${esc(member.id)}">
      ${profileAvatar(member)}<span><strong>${esc(member.name)}</strong><small>${esc(member.roles.map(role=>roleNames[role]).join(' · '))}</small></span>
    </button>`).join('') || '<p class="help">Aucun profil actif.</p>';
    for(const member of people)on('profile-'+member.id,async event=>{
      const control=event.currentTarget;control.disabled=true;
      try {await api('/login',{method:'POST',body:{org,test_access:true,test_member:member.id}});await startWorkspace(true);}
      catch(error){control.disabled=false;report(error);}
    });
  }
  on('login-org',event=>{org=event.target.value;profiles.replaceChildren();drawProfiles().catch(report);},'change');
  drawProfiles().catch(report);
}

async function switchProfile() {
  if(!demoMode) {
    showDialog('Compte et espace',`<div class="stack"><p>${esc(me.name)} · ${esc(me.email)}</p>
      ${me.cash_station ? button('Revenir à mon profil','users','core-leave-station') : ''}
      ${workspaces.length>1 ? field('Changer d’espace',`<select id="core-workspace">${workspaces.map(row=>option(row.id,row.name,me.org)).join('')}</select>`) : ''}
      <p class="help">Le relais en caisse attribue les ventes à la personne choisie. Les droits restent liés au compte connecté.</p>
      <a href="/?demo=1">Explorer la démonstration séparée</a></div>`);
    on('core-leave-station',async()=>{leaveStation();closeDialog();await startWorkspace(true);});
    on('core-workspace',async event=>{selectWorkspace(event.target.value);closeDialog();await startWorkspace(true);},'change');
    return;
  }
  const org = me.org;
  await api('/logout',{method:'POST'});
  endScan();
  if (dialog.hasAttribute('open')) closeDialog();
  me = null;
  sites = []; stock = []; transfers = []; shifts = []; team = [];
  siteFilter = '';
  showSignIn(org);
}

async function init() {
  try {
    if(!demoMode) {
      const initial=await api('/bootstrap');workspaces=initial.workspaces;
      if(!workspaces.length) {setupWorkspace({root,api,onReady:async id=>{selectWorkspace(id);await function updateSyncBadge() {
  const node=document.getElementById('core-sync');if(!node)return;
  const labels={loading:'Synchronisation…',synced:'Synchronisé',offline:'Hors connexion',conflict:'Actualiser',error:'Réessayer',updates:'Mises à jour disponibles'};
  node.textContent=labels[syncStatus] || labels.synced;node.dataset.status=syncStatus;
}
window.addEventListener('core-sync',event=>{syncStatus=event.detail.status;updateSyncBadge();});
async function syncWorkspace() {
  if(!me || demoMode)return;
  if(document.querySelector('[data-assist-form][data-dirty]'))throw new Error('Enregistrez ou quittez l’identification avant d’actualiser cet écran.');
  if(page!=='accueil' && document.querySelector('form[data-dirty]'))throw new Error('Enregistrez vos modifications avant d’actualiser cet écran.');
  await persistEntry?.();await refresh();render();notice('Espace actualisé.');
}
for(const event of ['input','change'])document.addEventListener(event,event=>{
  const form=event.target.closest?.('form');if(form)form.dataset.dirty='true';
});
if(!demoMode)setInterval(async()=>{
  if(!me || document.hidden)return;
  try {
    const value=await api('/revision');
    if(value.revision<=currentRevision())return;
    const editing=Boolean(stopCamera||stopObjectCamera) || document.querySelector('[data-planning-busy="1"]') || dialog.hasAttribute('open') || document.querySelector('form[data-saving]') || document.querySelector('form[data-dirty]');
    if(editing) {syncStatus='updates';updateSyncBadge();}
    else {await refresh();render();}
  } catch { /* The sync badge already explains a network or access failure. */ }
},10000);
init();}});return;}
      const selected=sessionStorage.getItem('seconde-vie-workspace');
      if(!workspaces.some(row=>row.id===selected))selectWorkspace(workspaces[0].id);
    }
    await startWorkspace();
  } catch (error) {
    if (error.status === 401) {
      if(demoMode) {await api('/logout',{method:'POST'});showSignIn();}
      else root.innerHTML='<main class="content sign-in"><h1>Connectez-vous à votre espace</h1><p>Utilisez votre compte personnel pour retrouver les données partagées.</p><a class="btn primary" href="/signin-with-chatgpt?returnTo=%2F" target="_top">Se connecter</a><a href="/?demo=1">Explorer la démonstration</a></main>';
      return;
    }
    root.innerHTML = '<main class="content"><div class="surface empty"><h1>Connexion indisponible</h1><p>Rechargez la page pour réessayer.</p></div></main>';
    report(error);
  }
}
function updateSyncBadge() {
  const node=document.getElementById('core-sync');if(!node)return;
  const labels={loading:'Synchronisation…',synced:'Synchronisé',offline:'Hors connexion',conflict:'Actualiser',error:'Réessayer',updates:'Mises à jour disponibles'};
  node.textContent=labels[syncStatus] || labels.synced;node.dataset.status=syncStatus;
}
window.addEventListener('core-sync',event=>{syncStatus=event.detail.status;updateSyncBadge();});
async function syncWorkspace() {
  if(!me || demoMode)return;
  if(document.querySelector('[data-assist-form][data-dirty]'))throw new Error('Enregistrez ou quittez l’identification avant d’actualiser cet écran.');
  await persistEntry?.();await refresh();render();notice('Espace actualisé.');
}
if(!demoMode)setInterval(async()=>{
  if(!me || document.hidden)return;
  try {
    const value=await api('/revision');
    if(value.revision<=currentRevision())return;
    const editing=Boolean(stopCamera||stopObjectCamera) || document.querySelector('[data-planning-busy="1"]') || dialog.hasAttribute('open') || document.querySelector('form[data-saving]') || document.querySelector('#intake-form[data-dirty]') || document.querySelector('[data-assist-form][data-dirty]');
    if(editing) {syncStatus='updates';updateSyncBadge();}
    else {await refresh();render();}
  } catch { /* The sync badge already explains a network or access failure. */ }
},10000);
init();
