import { organisations as defaultOrganisations, demoPhoto, hasRole, roleNames } from './permissions.js';
import { createDemoProfiles } from './demo-profiles.js';
import seed from './seed.js';
import { discountCents } from './checkout.js';
import { activityEvents, flowLabels, workshopTypes } from './activity.js';
import { cleanReference } from './reference.js';
import { catalogImages, normalizeScanCode } from './catalog.js';
import { itemPhotos, maxItemPhotos } from './photos.js';
import { acceptedCategories, colors, pictograms } from './categories.js';
import { operationMethods, runOperation, openRegister } from './operations.js';


export function createBusinessAPI({localStorage,sessionStorage,origin='https://seconde-vie.invalid',shared=false,organisationNames=defaultOrganisations}) {
const organisations = organisationNames;
const {demoPassword,demoMembers,demoAdminEmail}=shared ? {demoPassword:null,demoMembers:{},demoAdminEmail:{}} : createDemoProfiles(localStorage);
const storageKey = 'seconde-vie-demo-v1';
const sessionKey = 'seconde-vie-demo-profile-v2';
const keyFor = org => org === 'passages' ? storageKey : storageKey + '-' + org;
const withoutPin = ({pin, ...member}) => member;
function session() {
  return JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
}
function loadOrg(org) {
  if (shared) {
    const stored = localStorage.getItem(keyFor(org));
    if (!stored) error(404, 'Espace introuvable.');
    return JSON.parse(stored);
  }
  if (!Object.hasOwn(organisations, org)) error(400, 'Choisissez un espace.');
  const stored = localStorage.getItem(keyFor(org));
  if (stored) {
    const state = JSON.parse(stored);
    if (state.teamSeedVersion === 2) return state;
    const fresh = demoMembers[org].filter(member => !state.team.some(existing => existing.id === member.id));
    state.team.push(...fresh.map(member => ({...member,active:true,email:member.id+'@example.test'})));
    state.teamSeedVersion = 2;
    return state;
  }
  const state = JSON.parse(JSON.stringify(seed));
  if (org === 'boucle') {
    const site = {id:'boucle-boutique', name:'Maison du Réemploi', kind:'Réception et vente',
      zones:[{id:'boucle-zone',name:'Réception'}]};
    state.sites = [site];
    state.stock = [{id:'boucle-vase', code:'OBJ-BOUCLE001', kind:'item', title:'Vase bleu',
      category:'Vaisselle', quantity:1, state:'pret', price_cents:450, web_visible:true, site_id:site.id,
      site_name:site.name, zone_id:site.zones[0].id, zone_name:site.zones[0].name,
      created_at:'2026-11-06T12:00:00Z', history:[]}];
    state.shifts = [];
    state.transfers = [];
    state.team = [{id:'boucle-admin',name:'Sarah Lopez',email:demoAdminEmail.boucle,active:true,roles:['admin']}];
  }
  const example = state.stock.find(row => row.state === 'pret' && Number.isSafeInteger(row.price_cents));
  if (example) example.web_visible = true;
  state.team.push(...demoMembers[org].map(member => ({...member,active:true,email:member.id+'@example.test'})));
  state.teamSeedVersion = 2;
  return state;
}
function requireRole(me, ...roles) {
  if (!hasRole(me,...roles)) error(403, 'Votre profil n’a pas accès à cette action.');
}
const now = () => new Date().toISOString();
const id = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('');

function error(status, message) {
  throw Object.assign(new Error(message), { status });
}

function save(state, org) {
  try { localStorage.setItem(keyFor(org), JSON.stringify(state)); }
  catch { error(409, 'Le stockage de cette démo est plein. Essayez avec une photo plus légère.'); }
}

function find(rows, key, message) {
  const row = rows.find(item => item.id === key);
  if (!row) error(404, message);
  return row;
}

function text(value, label, max, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max) error(400, 'Vérifiez ' + label + '.');
  return result;
}

function validPrice(price) {
  if (price != null && (!Number.isSafeInteger(price) || price < 0 || price > 100000000))
    error(400, 'Indiquez un prix valide entre 0 et 1 000 000 €.');
  return price;
}

function editSite(site, body, state) {
  const name = text(body.name, 'le nom du site', 100);
  const kind = text(body.kind, 'les activités du site', 120);
  if (state.sites.some(other => other.id !== site.id && other.name.localeCompare(name, 'fr', {sensitivity:'base'}) === 0))
    error(409, 'Ce site existe déjà.');
  if (!Array.isArray(body.zones) || body.zones.length > 30) error(400, 'Utilisez au plus 30 zones.');
  const zones = body.zones.map(zone => {
    if (zone.id && !site.zones.some(existing => existing.id === zone.id)) error(400, 'Zone inconnue pour ce site.');
    return {id:zone.id || id(), name:text(zone.name, 'le nom de la zone', 80)};
  });
  if (new Set(zones.map(zone => zone.id)).size !== zones.length
      || new Set(zones.map(zone => zone.name.toLocaleLowerCase('fr'))).size !== zones.length)
    error(400, 'Chaque zone doit avoir un nom différent.');
  if (state.stock.some(row => row.site_id === site.id && row.zone_id && !zones.some(zone => zone.id === row.zone_id)))
    error(409, 'Déplacez les fiches de la zone avant de la retirer.');
  Object.assign(site, {name,kind,zones});
  for (const row of state.stock.filter(row => row.site_id === site.id)) {
    row.site_name = name;
    if (row.zone_id) row.zone_name = zones.find(zone => zone.id === row.zone_id).name;
  }
  for (const shift of state.shifts.filter(shift => shift.site_id === site.id)) shift.site_name = name;
  for (const transfer of state.transfers) {
    if (transfer.origin_id === site.id) transfer.origin_name = name;
    if (transfer.destination_id === site.id) transfer.destination_name = name;
  }
}

function ensureActive(row) {
  if (['transit','sorti'].includes(row.state)) error(409, 'Cette fiche ne peut plus être modifiée.');
}

function record(row, me, type, detail, extra) {
  const snapshot = Object.hasOwn(flowLabels, type)
    ? {site_id:row.site_id, category:row.category, origin:row.origin, quantity:row.quantity, grams:row.grams}
    : undefined;
  (row.history ??= []).unshift({ type, detail, name: me.name, created_at: now(), snapshot, ...extra });
}

function move(row, site, zoneId) {
  const zone = zoneId ? find(site.zones, zoneId, 'Cette zone ne fait pas partie de ce site.') : null;
  Object.assign(row, { site_id: site.id, site_name: site.name, zone_id: zone?.id, zone_name: zone?.name });
}

function listRow({ photo, photos, history, ...row }) { return row; }

function saveReference(row, body) {
  Object.assign(row, {
    reference:cleanReference(row.category, body.reference),
    reference_confirmed:true,
    reference_updated_at:now(),
    description:typeof body.description === 'string' ? body.description.trim().slice(0, 1200) : '',
  });
}

function savePhotos(row, photos, selected) {
  if (!Array.isArray(photos) || photos.length > maxItemPhotos
    || photos.some(photo => typeof photo !== 'string' || !(shared && /^\/api\/core\/photos\/[a-z0-9-]+\/[a-z0-9-]+$/.test(photo)) && !(photo.length <= 400000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(photo)))) {
    error(400, 'Ajoutez au plus trois photos de l’exemplaire.');
  }
  const choices = Array.isArray(selected) ? selected : [];
  row.photos = photos;
  row.has_photo = photos.length > 0;
  row.catalog_images = catalogImages(row.catalog).filter(image => choices.includes(image.url)).map(image => image.url);
  delete row.photo;
}

function newStock(body, state, me) {
  const { kind, category, grams, parent_id, barcode, note } = body;
  const site = find(state.sites, body.site_id, 'Site introuvable.');
  if (!['item', 'lot'].includes(kind)) error(400, 'Choisissez le type d’entrée.');
  const permitted = acceptedCategories(site, seed.config.categories);
  const parent = parent_id ? find(state.stock, parent_id, 'Lot introuvable.') : null;
  if (!permitted.includes(category) && !(parent && category === parent.category)) {
    error(400, 'Cette catégorie n’est pas acceptée à la réception de ce site.');
  }
  const quantity = kind === 'item' ? 1 : body.quantity;
  const price = validPrice(body.price_cents ?? null);
  if ((quantity != null && (!Number.isSafeInteger(quantity) || quantity < 1))
    || (grams != null && (!Number.isSafeInteger(grams) || grams < 1))) {
    error(400, 'Indiquez une quantité ou un poids valide.');
  }
  const title = text(body.title, 'le nom de la fiche', 150, false) || (kind === 'lot' ? 'Lot · ' + category : category);
  if (!quantity && !grams) error(400, 'Indiquez le poids ou la quantité du lot.');
  const row = {
    id: id(), code: (kind === 'lot' ? 'LOT-' : 'OBJ-') + id().slice(0,10).toUpperCase(),
    title, kind, category, grams, quantity, state: 'tri', price_cents:price,
    created_at: now(), history: [], barcode:text(barcode,'le code-barres',80,false),
    note:text(note,'la note',1000,false), origin:text(body.origin,'la provenance',100,false),
    contact_id:body.contact_id ? find(state.contacts ?? [],body.contact_id,'Contact introuvable.').id : null,
  };
  if (barcode && body.catalog?.code === normalizeScanCode(barcode)) row.catalog = body.catalog;
  if (body.reference || body.description) saveReference(row, body);
  savePhotos(row, body.photos ?? (body.photo ? [body.photo] : []), body.catalog_images);
  move(row, site, body.zone_id);
  if (parent) {
    ensureActive(parent);
    if (kind !== 'item' || parent.kind !== 'lot' || parent.site_id !== site.id) error(409, 'Sélectionnez un objet à isoler sur ce site.');
    if (parent.grams != null && (!grams || grams > parent.grams)) error(400, 'Le poids dépasse le contenu du lot.');
    const restQty = parent.quantity == null ? null : parent.quantity - 1;
    const restGrams = parent.grams == null ? null : parent.grams - grams;
    if (restQty != null && restQty < 0) error(409, 'Ce lot ne contient plus de pièce disponible.');
    if (restQty != null && restGrams != null && (restQty === 0) !== (restGrams === 0)) {
      error(400, 'Le poids et le comptage ne concordent pas pour le reste du lot.');
    }
    Object.assign(parent, { quantity: restQty, grams: restGrams });
    if (!restQty && !restGrams) Object.assign(parent, { state:'sorti', exit_type:'reparti' });
    record(parent, me, 'isolation', title + ' isolé du lot');
    Object.assign(row, { origin: parent.origin, parent_id, parent_code: parent.code });
  }
  record(row, me, parent_id ? 'isolation' : 'reception', parent_id ? 'Objet isolé d’un lot' : 'Entrée enregistrée');
  state.stock.unshift(row);
  return listRow(row);
}

function act(row, body, state, me) {
  ensureActive(row);
  const { action } = body;
  if (action === 'edit') {
    row.title = text(body.title,'le nom de la fiche',150);
    row.note = text(body.note,'la note',1000,false);
    row.barcode = text(body.barcode,'le code-barres',80,false);
    row.origin = text(body.origin,'la provenance',100,false);
    row.contact_id = body.contact_id ? find(state.contacts ?? [],body.contact_id,'Contact introuvable.').id : null;
    record(row,me,'modification','Informations de la fiche corrigées');
  } else if (action === 'block') {
    const note = text(body.note, 'le motif du contrôle', 500);
    Object.assign(row, { state:'controle', note });
    record(row, me, 'controle', note);
  } else if (action === 'ready') {
    Object.assign(row, { state:'pret', condition:text(body.condition, 'l’état constaté', 100, false),
      price_cents:validPrice(body.price_cents ?? row.price_cents) });
    record(row, me, 'pret', body.condition || 'Tri terminé');
  } else if (action === 'move') {
    move(row, find(state.sites, row.site_id, 'Site introuvable.'), body.zone_id);
    record(row, me, 'rangement', 'Rangé · ' + (row.zone_name || row.site_name));
  } else if (action === 'storefront') {
    if (body.visible && (row.state !== 'pret' || !Number.isSafeInteger(row.price_cents) || row.price_cents < 0))
      error(400, 'La fiche doit être prête à la vente et avoir un prix.');
    row.web_visible = body.visible === true;
    record(row, me, 'vitrine', row.web_visible ? 'Affiché en vitrine' : 'Retiré de la vitrine');
  } else if (action === 'cash-price') {
    if (!me.roles.some(role => ['admin','vente'].includes(role))) error(403, 'Accès réservé à la vente.');
    if (row.site_id !== body.site_id || row.state !== 'pret' || row.price_cents != null)
      error(409, 'Cette fiche a changé. Rechargez la caisse avant de continuer.');
    if (!Number.isSafeInteger(body.price_cents) || body.price_cents < 0 || body.price_cents > 100000000)
      error(400, 'Indiquez un prix valide.');
    row.price_cents = body.price_cents;
    record(row, me, 'prix', 'Prix défini en caisse · ' + (body.price_cents / 100).toFixed(2) + ' €');
    return listRow(row);
  } else if (action === 'workshop') {
    if (!me.roles.some(role => ['admin','atelier'].includes(role))) error(403, 'Accès réservé à l’atelier.');
    if (!workshopTypes.includes(body.operation) || !Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 1440)
      error(400, 'Indiquez une intervention et une durée entre 1 et 1 440 minutes.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    record(row, me, 'atelier', [body.operation, body.minutes + ' min', note].filter(Boolean).join(' · '),
      {minutes:body.minutes});
  } else if (action === 'exit') {
    if (!['vente','don','recyclage','decheterie'].includes(body.exit_type)) error(400, 'Choisissez un motif de sortie.');
    if (body.exit_type === 'vente') requireRole(me,'vente');
    if (body.exit_type === 'vente' && row.state !== 'pret') error(409, 'Validez le tri avant la vente.');
    Object.assign(row, { state:'sorti', exit_type:body.exit_type });
    record(row, me, body.exit_type, 'Sortie · ' + body.exit_type);
  } else if (action === 'reference') {
    saveReference(row, body);
    record(row, me, 'reference', 'Caractéristiques mises à jour');
  } else if (action === 'photo') {
    savePhotos(row, body.photos ?? (body.photo ? [body.photo] : []), body.catalog_images);
    record(row, me, 'photo', 'Photos mises à jour');
  } else {
    error(400, 'Action inconnue.');
  }
}

function selected(keys, rows) {
  if (!keys?.length) error(400, 'Sélectionnez au moins une fiche.');
  return [...new Set(keys)].map(key => find(rows, key, 'Fiche introuvable.'));
}

function sendTransfer(body, state, me) {
  const rows = selected(body.stock_ids, state.stock);
  const destination = find(state.sites, body.destination_id, 'Site introuvable.');
  const origin = find(state.sites, rows[0].site_id, 'Site introuvable.');
  if (origin.id === destination.id || rows.some(row => row.site_id !== origin.id)) {
    error(400, 'Les fiches doivent partir du même site vers un autre site.');
  }
  const lines = rows.map(row => {
    ensureActive(row);
    return { id:row.id, code:row.code, title:row.title, prior_state:row.state, received_at:null };
  });
  for (const row of rows) {
    row.state = 'transit';
    record(row, me, 'transit', 'Départ vers ' + destination.name);
  }
  const transfer = {
    id:id(), created_at:now(), origin_id:origin.id, origin_name:origin.name,
    destination_id:destination.id, destination_name:destination.name, lines,
  };
  state.transfers.unshift(transfer);
  return { id:transfer.id };
}

function arrive(transfer, body, state, me) {
  const destination = find(state.sites, transfer.destination_id, 'Site introuvable.');
  for (const line of selected(body.stock_ids, transfer.lines)) {
    if (line.received_at) continue;
    const row = find(state.stock, line.id, 'Fiche introuvable.');
    move(row, destination, body.zone_id);
    row.state = line.prior_state;
    line.received_at = now();
    record(row, me, 'arrivee', 'Réception à ' + destination.name);
  }
}

function configureCategories(site, { categories, custom }, state) {
  const customCategories = state.customCategories ?? [];
  const names = [...seed.config.categories, ...customCategories.map(category => category.name)];
  if (!Array.isArray(categories) || categories.some(category => !names.includes(category))) {
    error(400, 'Une catégorie sélectionnée est indisponible.');
  }
  if (custom) {
    const name = custom.name.trim().normalize('NFC');
    if (!name || name.length > 40 || !Object.prototype.hasOwnProperty.call(pictograms, custom.icon) || !Object.prototype.hasOwnProperty.call(colors, custom.color)) {
      error(400, 'Vérifiez le nom, le pictogramme et la couleur.');
    }
    if (names.some(existing => existing.localeCompare(name, 'fr', { sensitivity: 'base' }) === 0)) {
      error(409, 'Cette catégorie existe déjà. Cochez-la dans la liste.');
    }
    state.customCategories = [...customCategories, { name, icon: custom.icon, color: custom.color }];
    categories = [...categories, name];
  }
  site.categories = [...new Set(categories)];
}

function getOrEditResource(resource, key, method, body, state, me) {
  const rows = state[resource];
  if (method === 'GET') return rows;
  if (resource === 'sites') {
    if (method === 'PATCH' && key) {
      if (!me.roles.includes('admin')) error(403, 'Seul un responsable peut régler les catégories.');
      const site = find(rows, key, 'Site introuvable.');
      if (Object.hasOwn(body, 'categories')) configureCategories(site, body, state);
      else editSite(site, body, state);
      return;
    }
    const names = text(body.zones, 'les zones', 2500, false).split(',').map(name => name.trim()).filter(Boolean);
    const site = {id:id(), zones:[]};
    editSite(site, {...body,zones:names.map(name => ({name}))}, state);
    rows.push(site);
  } else if (resource === 'team') {
    if (!Array.isArray(body.roles) || !body.roles.length || body.roles.some(role => !Object.hasOwn(roleNames,role)))
      error(400, 'Sélectionnez au moins une fonction valide.');
    const roles = [...new Set(body.roles)];
    const pin = shared ? '' : body.pin || '';
    if (pin && !/^\d{4,6}$/.test(pin)) error(400, 'Utilisez un code de 4 à 6 chiffres.');
    const existing = key ? find(rows,key,'Personne introuvable.') : null;
    if (key === me.id && !roles.includes('admin')) error(400, 'Conservez votre fonction Responsable.');
    if (!shared && !roles.includes('admin') && !pin && !existing?.pin) error(400, 'Définissez un code pour ce profil terrain.');
    const changes = {roles, active:!existing || key === me.id || body.active === true,
      ...(pin ? {pin} : {}), ...(body.photo ? {photo:demoPhoto(body.photo)} : {})};
    if (!existing || Object.hasOwn(body, 'name')) changes.name = text(body.name, 'le nom de la personne', 100);
    if (!existing || Object.hasOwn(body, 'email')) {
      changes.email = text(body.email, 'l’e-mail', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) error(400, 'Indiquez un e-mail valide.');
      if (rows.some(member => member.id !== key && member.email.toLowerCase() === changes.email))
        error(409, 'Cette adresse est déjà utilisée.');
    }
    if (existing) {
      Object.assign(existing, changes);
      for (const shift of state.shifts.filter(shift => shift.member_id === existing.id)) shift.member_name = existing.name;
    }
    else rows.push({id:id(),...changes});
  } else if (method === 'DELETE') {
    find(rows, key, 'Créneau introuvable.');
    state.shifts = rows.filter(row => row.id !== key);
  } else {
    const start = new Date(body.starts_at), end = new Date(body.ends_at);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) error(400, 'Choisissez un créneau valide.');
    if (!seed.config.activities.includes(body.activity)) error(400, 'Choisissez une activité valide.');
    const starts_at = start.toISOString(), ends_at = end.toISOString();
    if (rows.some(s => s.member_id === body.member_id && s.starts_at < ends_at && s.ends_at > starts_at)) {
      error(409, 'Cette personne est déjà prévue sur ce créneau.');
    }
    const member = find(state.team, body.member_id, 'Personne introuvable.');
    if (!member.active) error(400, 'Cette personne est désactivée.');
    const site = find(state.sites, body.site_id, 'Site introuvable.');
    rows.push({ id:id(), member_id:member.id,site_id:site.id,activity:body.activity,starts_at,ends_at,
      member_name:member.name, site_name:site.name });
    rows.sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  }
}

const paymentNames = { carte:'Carte', especes:'Espèces', autre:'Autre', gratuit:'Gratuit' };

function checkout(body, state, me) {
  const site = find(state.sites, body?.site_id, 'Site introuvable.');
  const register=openRegister(state,site.id,{required:shared || Boolean(state.cashSessions?.length)});
  if (body.operator_id && body.operator_id !== me.id) error(409, 'La personne en caisse a changé. Rouvrez l’encaissement.');
  if (!Object.hasOwn(paymentNames, body.payment)) error(400, 'Choisissez le mode de paiement.');
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100
      || new Set(body.lines.map(line => line?.id)).size !== body.lines.length) error(400, 'Vérifiez le panier.');
  const categories = acceptedCategories(site, seed.config.categories);
  const lines = body.lines.map(line => {
    if (line?.kind === 'libre') {
      const {id:lineId, title, category, quantity, unit_price_cents} = line;
      if (typeof lineId !== 'string' || !/^libre-[0-9a-f]{32}$/.test(lineId) || !categories.includes(category)
          || typeof title !== 'string' || title.trim().length > 100
          || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999
          || !Number.isSafeInteger(unit_price_cents) || unit_price_cents < 0 || unit_price_cents > 100000000)
        error(400, 'Vérifiez la catégorie, le prix et la quantité de l’article sans étiquette.');
      return {id:lineId, kind:'libre', title:title.trim() || category, category, quantity, unit_price_cents,
        price_cents:unit_price_cents * quantity};
    }
    const row = find(state.stock, line?.id, 'Une fiche du panier est introuvable.');
    if (row.site_id !== site.id || row.state !== 'pret') error(409, row.title + ' n’est plus disponible à la vente sur ce site.');
    if (!Number.isSafeInteger(row.price_cents) || row.price_cents < 0 || row.price_cents !== line.price_cents)
      error(409, 'Le prix a changé ou manque pour « ' + row.title + ' ». Vérifiez le panier.');
    return { row, id:row.id, title:row.title, price_cents:row.price_cents };
  });
  const subtotal_cents = lines.reduce((total, line) => total + line.price_cents, 0);
  const discount_cents = discountCents(subtotal_cents, body.discount);
  const total_cents = subtotal_cents - discount_cents;
  if (body.payment === 'gratuit' && total_cents !== 0) error(400, 'Le panier gratuit doit avoir un total de zéro.');
  const cash = body.payment === 'especes';
  const received = body.received_cents;
  if (cash && (!Number.isSafeInteger(received) || received < total_cents))
    error(400, 'Le montant reçu doit couvrir le total de la vente.');
  const sale = { id:id(), site_id:site.id, register_id:register?.id, payment:paymentNames[body.payment], total_cents, created_at:now(),
    operator_id:me.id, operator_name:me.name,
    ...(cash ? {received_cents:received,change_cents:received-total_cents} : {}),
    ...(discount_cents ? {subtotal_cents,discount_cents} : {}),
    lines:lines.map(({row,...line}) => line) };
  for (const {row} of lines) {
    if (!row) continue;
    act(row, {action:'exit',exit_type:'vente'}, state, me);
    row.last_sale_id=sale.id;
    row.history[0].detail = 'Vente en caisse · ' + sale.payment;
  }
  (state.sales ??= []).unshift(sale);
  return sale;
}

async function demoRequest(path, options = {}) {
  if (!shared && options.method && options.method !== 'GET' && globalThis.navigator?.locks) {
    return navigator.locks.request(keyFor(session()?.org || 'passages'), async () => requestDemo(path, options));
  }
  return requestDemo(path, options);
}

function requestDemo(path, { method = 'GET', body } = {}) {
  const { pathname, searchParams } = new URL(path, origin);
  const [resource, key, action] = pathname.slice(1).split('/');
  const methods = {
    ...operationMethods,
    profiles:['GET'],login:['POST'],logout:['POST'],me:['GET'],config:['GET'],cashiers:['GET'],
    'cash-station':['POST'],storefront:['GET'],activity:['GET'],tours:['GET','POST','PATCH'],
    sales:['GET','POST'],stock:['GET','POST'],transfers:['GET','POST'],sites:['GET','POST','PATCH'],
    team:['GET','POST','PATCH'],shifts:['GET','POST','DELETE'], contacts:['GET','POST','PATCH'],
  };
  if (!methods[resource]) error(404, 'Action indisponible dans la démo.');
  if (!methods[resource].includes(method)) error(405, 'Action indisponible.');
  if ((['team','sites'].includes(resource) && ((method === 'PATCH') !== Boolean(key) && method !== 'GET'))
      || (resource === 'shifts' && method === 'DELETE' && !key)
      || (resource === 'transfers' && method === 'POST' && (key ? action !== 'receive' : Boolean(action)))
      || (resource === 'stock' && method === 'POST' && key && action !== 'action'))
    error(405, 'Action indisponible.');
  if (resource === 'profiles' && method === 'GET') {
    const state = loadOrg(searchParams.get('org'));
    return state.team.filter(member => member.active && !member.roles.includes('admin'))
      .map(({id,name,roles,photo,pin}) => ({id,name,roles,photo,
        demo_hint:demoMembers[searchParams.get('org')].some(member => member.id === id && member.pin === pin)}));
  }
  if (resource === 'login' && method === 'POST') {
    const org = body?.org;
    const state = loadOrg(org);
    const member = state.team.find(member => member.active && (body.member
      ? !member.roles.includes('admin') && member.id === body.member && member.pin === body.pin
      : member.roles.includes('admin') && member.email.toLowerCase() === body.email?.trim().toLowerCase()
        && body.password === demoPassword));
    if (!member) error(401, 'Les identifiants ou le code sont incorrects.');
    sessionStorage.setItem(sessionKey, JSON.stringify({org,member:member.id}));
    return {ok:true};
  }
  if (resource === 'logout') { sessionStorage.removeItem(sessionKey); return { ok:true }; }
  const identity = session();
  if (!identity) error(401, 'Choisissez un profil pour continuer.');
  const state = loadOrg(identity.org);
  const member = state.team.find(member => member.id === identity.member && member.active);
  if (!member) error(401, 'Ce profil est désactivé.');
  const station = identity.cash_station;
  if (station && !hasRole(member,'vente')) error(401, 'Ce profil n’a plus accès à la caisse.');
  const me = {...withoutPin(member), org:identity.org, org_name:organisations[identity.org],
    ...(station ? {roles:['vente'],cash_station:station} : {})};
  if (resource === 'cashiers') {
    requireRole(me,'vente');
    if (method !== 'GET') error(405, 'Action indisponible.');
    return state.team.filter(person => person.active && hasRole(person,'vente'))
      .map(({id,name,photo}) => ({id,name,photo}));
  }
  if (resource === 'cash-station') {
    requireRole(me,'vente');
    if (method !== 'POST') error(405, 'Action indisponible.');
    const siteId = station?.site_id || body?.site_id;
    find(state.sites,siteId,'Site introuvable.');
    const cashier = state.team.find(person => person.id === body?.member && person.active && hasRole(person,'vente'));
    if (!cashier) error(403, 'Choisissez une personne autorisée à tenir la caisse.');
    sessionStorage.setItem(sessionKey,JSON.stringify({org:identity.org,member:cashier.id,cash_station:{site_id:siteId}}));
    return {...withoutPin(cashier),org:identity.org,org_name:organisations[identity.org],roles:['vente'],cash_station:{site_id:siteId}};
  }
  if (station) {
    const allowedRequest = ['me','config','sales','sites','shifts','registers','refunds'].includes(resource)
      || (resource === 'stock' && (method === 'GET' || body?.action === 'cash-price'));
    if (!allowedRequest) error(403, 'Ce poste est ouvert en mode caisse.');
    if (method !== 'GET' && !['sales','registers','refunds'].includes(resource) && !(resource === 'stock' && body?.action === 'cash-price'))
      error(403, 'Ce poste est ouvert en mode caisse.');
    if (['sales','stock'].includes(resource) && method !== 'GET' && body?.site_id !== station.site_id)
      error(403, 'Utilisez le site associé à cette caisse.');
    if (resource === 'sites' && method === 'GET') return state.sites.filter(site => site.id === station.site_id);
    if (resource === 'shifts' && method === 'GET') return [];
    if (resource === 'sales' && method === 'GET') return (state.sales ?? []).filter(sale => sale.site_id === station.site_id);
    if (resource === 'stock' && method === 'GET') {
      const rows = state.stock.filter(row => row.site_id === station.site_id);
      if (key === 'scan') {
        const code = normalizeScanCode(searchParams.get('code') || '');
        return rows.filter(row => row.code === code.toUpperCase() || (row.barcode && normalizeScanCode(row.barcode) === code)).map(listRow);
      }
      return key ? find(rows,key,'Fiche introuvable.') : rows.map(listRow);
    }
  }
  if(Object.hasOwn(operationMethods,resource)) {
    const value=runOperation({path:pathname,method,body,state,me,createStock:newStock,record});
    if(method!=='GET' && !(resource==='stock-import' && body.mode==='preview'))save(state,identity.org);
    return value;
  }
  let result;
  if (resource === 'me') return me;
  if (resource === 'config') return {...seed.config,...state.settings,demo:!shared,customCategories:state.customCategories ?? []};
  if (resource === 'contacts') {
    requireRole(me,'reception','stock','administration');
    state.contacts ??= [];
    if (method === 'GET') return state.contacts;
    const name = text(body.name,'le nom',120);
    const email = text(body.email,'l’e-mail',254,false).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400,'Indiquez un e-mail valide.');
    const types = ['Donateur','Client','Fournisseur','Déposant','Partenaire'];
    if (!Array.isArray(body.types) || body.types.some(type => !types.includes(type))) error(400,'Vérifiez les catégories du contact.');
    if (email && state.contacts.some(row => row.id !== key && row.email === email)) error(409,'Cette adresse est déjà utilisée.');
    const change = {name,email,phone:text(body.phone,'le téléphone',50,false),address:text(body.address,'l’adresse',500,false),
      note:text(body.note,'la note',1000,false),types:[...new Set(body.types)],updated_at:now()};
    const row = key ? find(state.contacts,key,'Contact introuvable.') : {id:id(),created_at:now()};
    Object.assign(row,change);
    if (!key) state.contacts.push(row);
    save(state,identity.org);
    return row;
  }
  if (resource === 'storefront') {
    requireRole(me,'stock');
    if (method !== 'GET') error(405, 'Action indisponible.');
    return state.stock.filter(row => row.web_visible && row.state === 'pret' && Number.isSafeInteger(row.price_cents))
      .map(row => ({id:row.id,title:row.title,category:row.category,price_cents:row.price_cents,
        site_id:row.site_id,site_name:row.site_name,description:row.description,photo:itemPhotos(row)[0]}));
  }
  if (resource === 'activity') {
    const register = searchParams.get('register') === '1';
    requireRole(me, register ? 'registre' : 'rapports');
    if (method !== 'GET') error(405, 'Action indisponible.');
    const events = activityEvents(state.stock);
    return register ? {events:events.filter(event => event.type === 'reception'),sales:[],refunds:[]}
      : {events,sales:state.sales ?? [],refunds:state.refunds ?? []};
  }
  if (resource === 'tours') {
    requireRole(me,'collecte');
    const tours = state.tours ??= [];
    if (method === 'GET') return tours;
    if (method === 'POST' && !key) {
      const site = find(state.sites, body?.site_id, 'Site introuvable.');
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      const stops = typeof body.stops === 'string' ? body.stops.trim() : '';
      const starts = new Date(body.starts_at);
      if (!label || label.length > 100 || !stops || stops.length > 2000 || !Number.isFinite(+starts)
          || !['Collecte','Livraison'].includes(body.kind)) error(400, 'Vérifiez le nom, le créneau et les étapes.');
      result = {id:id(), site_id:site.id, label, stops, starts_at:starts.toISOString(), kind:body.kind, status:'planned'};
      tours.push(result);
    } else if (method === 'PATCH' && key && ['planned','done','cancelled'].includes(body?.status)) {
      result = find(tours, key, 'Tournée introuvable.');
      result.status = body.status;
    } else error(405, 'Action indisponible.');
  } else if (resource === 'sales') {
    if (!me.roles.some(role => ['admin','vente'].includes(role))) error(403, 'Accès à la caisse réservé à la vente.');
    if (method === 'GET') return state.sales ?? [];
    if (method !== 'POST') error(405, 'Action indisponible.');
    result = checkout(body, state, me);
  } else if (resource === 'stock') {
    const operations = {
      block:['reception','tri','atelier','stock'],ready:['tri','atelier'],move:['stock','tri','atelier'],
      exit:['stock','vente'], reference:['reception','tri','atelier','stock'],
      edit:['reception','tri','atelier','stock'], photo:['reception','tri','atelier','stock'], storefront:['stock'], workshop:['atelier'], 'cash-price':['vente']
    };
    if (method === 'GET') requireRole(me,'reception','tri','atelier','stock','vente','rapports');
    else if (!key) requireRole(me,'reception','tri');
    else requireRole(me,...(operations[body?.action] ?? ['admin']));
    if (method === 'GET') {
      if (key === 'scan') {
        const code = normalizeScanCode(searchParams.get('code') || '');
        return state.stock.filter(row => row.code === code.toUpperCase()
          || (row.barcode && normalizeScanCode(row.barcode) === code)).map(listRow);
      }
      return key ? find(state.stock,key,'Fiche introuvable.') : state.stock.map(listRow);
    }
    if (key) result = act(find(state.stock,key,'Fiche introuvable.'),body,state,me);
    else result = newStock(body,state,me);
  } else if (resource === 'transfers') {
    if (method === 'GET' || action === 'receive') requireRole(me,'reception','tri','stock');
    else requireRole(me,'tri','stock');
    if (method === 'GET') return state.transfers;
    if (action === 'receive') arrive(find(state.transfers,key,'Transfert introuvable.'),body,state,me);
    else result = sendTransfer(body,state,me);
  } else if (['sites','team','shifts'].includes(resource)) {
    if (resource === 'team' || method !== 'GET') requireRole(me,'admin');
    result = getOrEditResource(resource,key,method,body,state,me);
    if (method === 'GET') return resource === 'team' ? result.map(withoutPin) : result;
  } else {
    error(404, 'Action indisponible dans la démo.');
  }
  save(state, identity.org);
  return result || { ok:true };
}

return demoRequest;
}
