import seed from './seed.js';
import { cleanReference } from './reference.js';
import { catalogImages, normalizeScanCode } from './catalog.js';
import { maxItemPhotos } from './photos.js';
import { acceptedCategories, colors, pictograms } from './categories.js';

const storageKey = 'seconde-vie-demo-v1';
const sessionKey = 'seconde-vie-demo-active';
const now = () => new Date().toISOString();
const id = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('');

function error(status, message) {
  throw Object.assign(new Error(message), { status });
}

function save(state) {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { error(409, 'Le stockage de cette démo est plein. Essayez avec une photo plus légère.'); }
}

function find(rows, key, message) {
  const row = rows.find(item => item.id === key);
  if (!row) error(404, message);
  return row;
}

function ensureActive(row) {
  if (['transit','sorti'].includes(row.state)) error(409, 'Cette fiche ne peut plus être modifiée.');
}

function record(row, me, type, detail) {
  row.history.unshift({ type, detail, name: me.name, created_at: now() });
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
    || photos.some(photo => typeof photo !== 'string' || !/^data:image\/jpeg;base64,/.test(photo))) {
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
  if ((quantity != null && (!Number.isSafeInteger(quantity) || quantity < 1))
    || (grams != null && (!Number.isSafeInteger(grams) || grams < 1))) {
    error(400, 'Indiquez une quantité ou un poids valide.');
  }
  const title = body.title?.trim() || (kind === 'lot' ? 'Lot · ' + category : category);
  if (!quantity && !grams) error(400, 'Indiquez le poids ou la quantité du lot.');
  const row = {
    id: id(), code: (kind === 'lot' ? 'LOT-' : 'OBJ-') + id().slice(0,10).toUpperCase(),
    title, kind, category, grams, quantity, state: 'tri', origin: body.origin,
    created_at: now(), history: [], barcode, note,
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
  if (action === 'block') {
    Object.assign(row, { state:'controle', note:body.note });
    record(row, me, 'controle', body.note);
  } else if (action === 'ready') {
    Object.assign(row, { state:'pret', condition:body.condition, price_cents:body.price_cents ?? row.price_cents });
    record(row, me, 'pret', body.condition || 'Tri terminé');
  } else if (action === 'move') {
    move(row, find(state.sites, row.site_id, 'Site introuvable.'), body.zone_id);
    record(row, me, 'rangement', 'Rangé · ' + row.zone_name);
  } else if (action === 'exit') {
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
      configureCategories(find(rows, key, 'Site introuvable.'), body, state);
      return;
    }
    if (rows.some(site => site.name === body.name.trim())) error(409, 'Ce site existe déjà.');
    const names = [...new Set(body.zones.split(',').map(name => name.trim()).filter(Boolean))];
    rows.push({ id:id(), name:body.name.trim(), kind:body.kind.trim(), zones:names.map(name => ({ id:id(), name })) });
  } else if (resource === 'team') {
    if (!body.roles.length) error(400, 'Sélectionnez au moins une fonction.');
    if (key) {
      if (key === me.id && !body.roles.includes('admin')) error(400, 'Conservez la fonction Responsable du compte de démo.');
      Object.assign(find(rows,key,'Personne introuvable.'), { roles:body.roles, active:body.active });
    } else {
      if (rows.some(member => member.email === body.email)) error(409, 'Cette adresse est déjà utilisée.');
      rows.push({ id:id(), name:body.name, email:body.email, roles:body.roles, active:true });
    }
  } else if (method === 'DELETE') {
    state.shifts = rows.filter(row => row.id !== key);
  } else {
    if (body.ends_at <= body.starts_at) error(400, 'Choisissez un créneau valide.');
    if (rows.some(s => s.member_id === body.member_id && s.starts_at < body.ends_at && s.ends_at > body.starts_at)) {
      error(409, 'Cette personne est déjà prévue sur ce créneau.');
    }
    const member = find(state.team, body.member_id, 'Personne introuvable.');
    const site = find(state.sites, body.site_id, 'Site introuvable.');
    rows.push({ id:id(), ...body, member_name:member.name, site_name:site.name });
    rows.sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  }
}

export async function demoRequest(path, { method = 'GET', body } = {}) {
  const { pathname, searchParams } = new URL(path, location.origin);
  const [resource, key, action] = pathname.slice(1).split('/');
  if (resource === 'config') {
    const stored = localStorage.getItem(storageKey);
    const customCategories = stored ? JSON.parse(stored).customCategories ?? [] : [];
    return { ...seed.config, customCategories };
  }
  if (resource === 'login') { sessionStorage.setItem(sessionKey, 'true'); return { ok:true }; }
  if (!sessionStorage.getItem(sessionKey)) error(401, 'Ouvrez la démo pour continuer.');
  if (resource === 'logout') { sessionStorage.removeItem(sessionKey); return { ok:true }; }

  const stored = localStorage.getItem(storageKey);
  const state = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(seed));
  const me = { ...state.team[0], org_name:'Ressourcerie des Passages' };
  let result;
  if (resource === 'me') return me;
  if (resource === 'stock') {
    if (method === 'GET') {
      if (key === 'scan') {
        const code = normalizeScanCode(searchParams.get('code') || '');
        return state.stock.filter(row => row.code === code.toUpperCase()
          || (row.barcode && normalizeScanCode(row.barcode) === code)).map(listRow);
      }
      return key ? find(state.stock,key,'Fiche introuvable.') : state.stock.map(listRow);
    }
    if (key) act(find(state.stock,key,'Fiche introuvable.'),body,state,me);
    else result = newStock(body,state,me);
  } else if (resource === 'transfers') {
    if (method === 'GET') return state.transfers;
    if (action === 'receive') arrive(find(state.transfers,key,'Transfert introuvable.'),body,state,me);
    else result = sendTransfer(body,state,me);
  } else if (['sites','team','shifts'].includes(resource)) {
    result = getOrEditResource(resource,key,method,body,state,me);
    if (method === 'GET') return result;
  } else {
    error(404, 'Action indisponible dans la démo.');
  }
  save(state);
  return result || { ok:true };
}
