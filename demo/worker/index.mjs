import { core } from './core.mjs';

const markets = new Map([
  ['leboncoin.fr', { name:'Leboncoin', item:/^\/ad\/[^/]+\/\d+\/?$/ }],
  ['vinted.fr', { name:'Vinted', item:/^\/items\/\d+(?:-[^/]+)?\/?$/ }],
  ['ebay.fr', { name:'eBay', item:/^\/itm\/(?:[^/]+\/)?\d+\/?$/ }],
]);
const conditions = { like_new:'Comme neuf', very_good:'Très bon état', good:'Bon état', acceptable:'État acceptable', new:'Neuf' };
const tidy = (value, max = 160) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const digits = value => String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
const words = value => tidy(value, 600).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];
const ignored = new Set(['le','la','les','du','des','de','un','une','en','et','a','the']);
const priceValue = value => Number.isSafeInteger(value) && value > 0 && value <= 100000000 ? value : null;

function bookCode(code) {
  if (/^978\d{10}$/.test(code)) {
    const base = code.slice(3, 12);
    const sum = [...base].reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
    const check = (11 - sum % 11) % 11;
    return base + (check === 10 ? 'X' : check);
  }
  return code;
}

function hasTerms(query, text) {
  const terms = words(query).filter(term => !ignored.has(term));
  const available = new Set(words(text));
  return terms.length > 0 && terms.every(term => available.has(term));
}

async function getJSON(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { headers:{ Accept:'application/json', ...headers }, signal:controller.signal });
    if (!response.ok) throw new Error('Source indisponible');
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function glivres(query, barcode) {
  const url = new URL('https://www.glivres.fr/api/search');
  url.search = new URLSearchParams({ q:barcode || query, per_page:'24' });
  const result = await getJSON(url);
  if (result.hits == null && result.total === 0) return [];
  if (!Array.isArray(result.hits)) throw new Error('Réponse Glivres illisible');
  return result.hits.flatMap(offer => {
    const title = tidy(offer.title);
    const exact = Boolean(barcode && bookCode(digits(offer.isbn)) === bookCode(barcode));
    const price = offer.currency === 'EUR' ? priceValue(offer.price) : null;
    if (offer.status !== 'active' || !title || !price || !/^[a-f0-9-]{36}$/.test(offer.book_id || '')
        || (barcode ? !exact : !hasTerms(query, title + ' ' + tidy(offer.author)))) return [];
    return [{ title, source:'Galaxie Livres', url:'https://www.glivres.fr/livre/' + offer.book_id,
      price, exact, condition:conditions[offer.condition] || '', kind:'live', seller:tidy(offer.vendor_name, 80),
      reference:exact ? { code:barcode, title, source:'glivres', record:offer.book_id, author:tidy(offer.author),
        publisher:tidy(offer.publisher), published:offer.year_published > 0 ? String(offer.year_published) : '' } : undefined }];
  });
}

function indexPrice(text) {
  const amount = '(\\d{1,3}(?: \\d{3})+|\\d+)([,.]\\d{1,2})?\\s*(?:€|EUR\\b)';
  const marked = [...text.matchAll(new RegExp('\\bprix\\s*:\\s*' + amount, 'gi'))];
  const hits = marked.length ? marked : [...text.matchAll(new RegExp('(?<![\\d.,])' + amount, 'gi'))];
  const amounts = new Set(hits.map(match => priceValue(Math.round(Number(match[1].replace(/ /g, '') + (match[2] || '').replace(',', '.')) * 100))));
  if (!marked.length && /\b(?:livraison|frais|port|protection|abonnement|mensualit[eé])\b|\d\s*[x×]\s*\d/i.test(text)) return null;
  return amounts.size === 1 ? [...amounts][0] : null;
}

async function brave(query, barcode, key) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  const phrase = (barcode || query).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!phrase) return [];
  url.search = new URLSearchParams({ q:`${phrase} (site:leboncoin.fr OR site:vinted.fr OR site:ebay.fr)`,
    country:'FR', search_lang:'fr', count:'18', safesearch:'strict', result_filter:'web' });
  const data = await getJSON(url, { 'X-Subscription-Token':key });
  if (data.web && !Array.isArray(data.web.results)) throw new Error('Réponse Brave illisible');
  return (data.web?.results || []).flatMap(hit => {
    let link;
    try { link = new URL(hit.url); } catch { return []; }
    const marketplace = markets.get(link.hostname.replace(/^www\./, ''));
    if (link.protocol !== 'https:' || link.username || link.password || link.port || !marketplace?.item.test(link.pathname)) return [];
    link.hash = '';
    link.search = '';
    const title = tidy(hit.title?.replace?.(/<[^>]*>/g, ''));
    const description = tidy(hit.description?.replace?.(/<[^>]*>/g, ''), 420).replace(/&euro;|&#8364;/g, '€');
    const evidence = title + ' ' + description;
    const exact = Boolean(barcode && evidence.split(/[^\dX-]+/).some(part => digits(part) === barcode));
    if (!title || (barcode ? !exact : !hasTerms(phrase, evidence))) return [];
    const condition = description.match(/\b(?:très bon état|bon état|comme neuf|état satisfaisant|pour pièces)\b/i)?.[0] || '';
    return [{ title, url:link.href, source:marketplace.name, price:indexPrice(evidence), exact, condition, kind:'index' }];
  });
}

async function museum(query) {
  const url = new URL('https://openaccess-api.clevelandart.org/api/artworks/');
  url.search = new URLSearchParams({ q:query, limit:'12' });
  const result = await getJSON(url);
  if (!Array.isArray(result.data)) throw new Error('Réponse du musée illisible');
  return result.data.flatMap(item => {
    if (!Number.isSafeInteger(item.id) || !tidy(item.title) || ['Painting', 'Print', 'Drawing', 'Photograph'].includes(item.type)) return [];
    return [{ title:tidy(item.title), date:tidy(item.creation_date, 100), material:tidy(item.technique),
      author:tidy(item.creators?.[0]?.description, 100), url:'https://www.clevelandart.org/art/' + encodeURIComponent(item.accession_number || '') }];
  }).filter(item => !item.url.endsWith('/')).slice(0, 3);
}

function reply(body, status = 200) {
  return Response.json(body, { status, headers:{ 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' } });
}

async function market(request, url, env) {
  if (request.method !== 'GET') return reply({ error:'Méthode non autorisée.' }, 405);
  if (request.headers.get('X-Seconde-Vie') !== 'market') return reply({ error:'Ouvrez le scanner.' }, 403);
  const query = tidy(url.searchParams.get('q'), 120);
  const raw = digits(url.searchParams.get('barcode'));
  const barcode = /^(?:\d{8}|\d{9}[\dX]|\d{12,14})$/.test(raw) ? raw : '';
  if (!query && !barcode) return reply({ error:'Précisez le nom ou le code de l’objet.' }, 400);
  if (url.pathname === '/api/market/collections') {
    if (!query) return reply({ error:'Ajoutez un nom, une signature ou un matériau.' }, 400);
    try { return reply({ records:await museum(query) }); }
    catch { return reply({ error:'Collections du musée temporairement indisponibles.' }, 502); }
  }
  const key = env.BRAVE_SEARCH_API_KEY?.trim();
  const web = !key ? 'needs_key' : request.headers.get('oai-authenticated-user-id') ? 'enabled' : 'restricted';
  const useMedia = url.searchParams.get('media') !== '0';
  const [mediaResult, webResult] = await Promise.allSettled([
    useMedia ? glivres(query, barcode) : [],
    web === 'enabled' ? brave(query, barcode, key) : [],
  ]);
  const all = [...(mediaResult.value || []), ...(webResult.value || [])];
  const offers = Array.from(new Map(all.map(item => [item.url + '|' + (item.seller || ''), item])).values()).slice(0, 9);
  const reference = offers.find(item => item.reference)?.reference;
  return reply({ offers, reference, media:mediaResult.status === 'rejected' ? 'unavailable' : useMedia ? 'available' : 'skipped',
    web:webResult.status === 'rejected' ? 'unavailable' : web });
}

function publicImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.hostname.includes('.') && !url.hostname.endsWith('.local') && value.length <= 2000 ? url.href : '';
  } catch { return ''; }
}

function benchmarkMatches(items, getUrl) {
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const url = publicImage(getUrl(item));
    return url ? [{ url, title:tidy(item.title) || new URL(url).hostname, price:tidy(item.price?.value, 40), note:tidy(item.note, 180) }] : [];
  }).filter((item, i, all) => all.findIndex(other => other.url === item.url) === i).slice(0, 8);
}

async function benchBody(request) {
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (;;) {
    const {done,value} = await reader.read();
    if (done) return JSON.parse(body + decoder.decode());
    size += value.byteLength;
    if (size > 3500000) { await reader.cancel(); throw new Error('Taille excessive'); }
    body += decoder.decode(value, {stream:true});
  }
}

function visionError(error, status) {
  const reasons = new Set(Array.isArray(error?.details) ? error.details.map(detail => detail?.reason) : []);
  if (reasons.has('BILLING_DISABLED') || reasons.has('BILLING_NOT_ENABLED'))
    return 'Google Cloud Vision indique que la facturation doit être activée sur le projet.';
  if (reasons.has('SERVICE_DISABLED'))
    return 'Activez Cloud Vision API dans le projet Google Cloud de cette clé.';
  if (reasons.has('API_KEY_INVALID') || status === 401 || error?.status === 'UNAUTHENTICATED')
    return 'Google Cloud Vision a rejeté la clé API. Vérifiez la clé enregistrée dans le site.';
  if (status === 429 || error?.code === 8 || error?.status === 'RESOURCE_EXHAUSTED')
    return 'Google Cloud Vision a atteint une limite de quota. Vérifiez les quotas du projet.';
  if (status === 403 || error?.code === 7 || error?.status === 'PERMISSION_DENIED')
    return 'Google Cloud Vision refuse l’accès. Vérifiez les restrictions de la clé, l’activation de Cloud Vision et la facturation du projet.';
  if (status === 400 || error?.code === 3)
    return 'Google Cloud Vision a refusé la requête. Essayez un fichier photo JPEG.';
  return 'Google Cloud Vision n’a pas pu analyser la photo. Réessayez.';
}

const edenModels = { edenOcr:'ocr/ocr/google', edenLogo:'image/logo_detection/google', linkup:'web/search/linkup' };

async function providerJSON(url, options) {
  const response = await fetch(url, { ...options, signal:AbortSignal.timeout(20000) });
  if (!response.ok) {
    const hints = {
      401:'Identifiants refusés.', 402:'Crédit insuffisant ou facturation à vérifier.',
      403:'Accès à cette API refusé.', 429:'Quota atteint. Réessayez plus tard.'
    };
    return { error:hints[response.status] || 'Le service a refusé la requête.' };
  }
  return { data:await response.json() };
}

async function edenBenchmark(engine, { key, image, url, query }) {
  const authorization = { Authorization:'Bearer ' + key };
  let input;
  if (engine === 'linkup') {
    if (!query) return reply({error:'Saisissez une référence ou une description à rechercher.'},400);
    input = { query, max_results:8 };
  } else {
    let file = url;
    if (image) {
      const form = new FormData();
      form.set('file', new Blob([Uint8Array.from(atob(image), char => char.charCodeAt(0))], {type:'image/jpeg'}), 'photo.jpg');
      const uploaded = await providerJSON('https://api.edenai.run/v3/upload', {method:'POST',headers:authorization,body:form});
      if (uploaded.error || !uploaded.data?.file_id) return reply({error:uploaded.error || 'Eden AI n’a pas accepté la photo.'},502);
      file = uploaded.data.file_id;
    }
    if (!file) return reply({error:'Ajoutez une photo ou un lien HTTPS public.'},400);
    input = { file };
  }
  const result = await providerJSON('https://api.edenai.run/v3/universal-ai', {
    method:'POST', headers:{...authorization,'Content-Type':'application/json'},
    body:JSON.stringify({model:edenModels[engine],input})
  });
  const output = result.data?.output;
  if (result.error || !output || result.data.status === 'fail' || result.data.status === 'failed')
    return reply({error:result.error || 'Eden AI n’a pas renvoyé de résultat exploitable.'},502);
  if (engine === 'edenOcr') return reply({matches:[],text:tidy(output.text, 700)});
  if (engine === 'edenLogo') return reply({matches:[],labels:(Array.isArray(output.items) ? output.items : [])
    .map(item => tidy(item.description || item.label || item.name)).filter(Boolean).slice(0,8)});
  const links = Array.isArray(output.results) ? output.results : output.sources;
  return reply({matches:benchmarkMatches(Array.isArray(links) ? links.map(item => ({
    ...item, title:item.title || item.name, note:item.snippet || item.content
  })) : [], item => item.url || item.link)});
}

let ebayToken;
async function ebayBenchmark(photo, env) {
  if (!photo) return reply({error:'Ajoutez la photo de l’objet pour eBay.'},400);
  const client = env.EBAY_CLIENT_ID;
  const secret = env.EBAY_CLIENT_SECRET;
  if (!ebayToken || ebayToken.client !== client || ebayToken.secret !== secret || Date.now() >= ebayToken.expires) {
    const auth = await providerJSON('https://api.ebay.com/identity/v1/oauth2/token', {
      method:'POST',
      headers:{Authorization:'Basic ' + btoa(client + ':' + secret),'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'})
    });
    if (auth.error || !auth.data?.access_token) return reply({error:auth.error || 'eBay n’a pas renvoyé de jeton.'},502);
    ebayToken = {client,secret,token:auth.data.access_token,expires:Date.now() + Math.max(0,Number(auth.data.expires_in) - 60) * 1000};
  }
  const result = await providerJSON('https://api.ebay.com/buy/browse/v1/item_summary/search_by_image?limit=8', {
    method:'POST',headers:{Authorization:'Bearer ' + ebayToken.token,'X-EBAY-C-MARKETPLACE-ID':'EBAY_FR','Content-Type':'application/json'},
    body:JSON.stringify({image:photo})
  });
  if (result.error) return reply({error:result.error},502);
  const items = result.data?.itemSummaries;
  return reply({matches:benchmarkMatches(Array.isArray(items) ? items.map(item => ({
    title:item.title, url:item.itemWebUrl, note:item.condition,
    price:{value:item.price?.value && item.price?.currency ? item.price.value + ' ' + item.price.currency : ''}
  })) : [], item => item.url)});
}

async function photoBench(request, env) {
  if (request.headers.get('X-Seconde-Vie') !== 'photo-bench') return reply({error:'Ouvrez le comparateur.'},403);
  const authenticated = Boolean(request.headers.get('oai-authenticated-user-id'));
  const edenKey = env.EDENAI_API_KEY || env['Eden AI'];
  const keys = { google:env.GOOGLE_CLOUD_VISION_API_KEY, serp:env.SERPAPI_API_KEY,
    edenOcr:edenKey, edenLogo:edenKey, linkup:edenKey,
    ebay:env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET };
  if (request.method === 'GET') return reply(Object.fromEntries(Object.entries(keys).map(([engine,key]) => [engine,authenticated && Boolean(key)])));
  if (request.method !== 'POST') return reply({error:'Méthode non autorisée.'},405);
  if (!authenticated || request.headers.get('Origin') !== new URL(request.url).origin) return reply({error:'Session requise.'},403);
  let data;
  try { data = await benchBody(request); } catch { return reply({error:'Requête photo invalide ou trop volumineuse.'},400); }
  if (!data || !Object.hasOwn(keys, data.engine)) return reply({error:'Moteur inconnu.'},400);
  const key = keys[data.engine];
  if (!key) return reply({error:'Clé serveur à configurer.'},503);
  const url = publicImage(data.url);
  const jpeg = value => typeof value === 'string' && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value)
    ? value.slice('data:image/jpeg;base64,'.length) : '';
  try {
    if (Object.hasOwn(edenModels, data.engine)) return await edenBenchmark(data.engine, {
      key, url, query:tidy(data.query, 180),
      image:jpeg(data.engine === 'edenOcr' ? data.label || data.photo : data.photo)
    });
    if (data.engine === 'ebay') return await ebayBenchmark(jpeg(data.photo), env);
    if (data.engine === 'serp') {
      if (!url) return reply({error:'Lien HTTPS public requis.'},400);
      const endpoint = new URL('https://serpapi.com/search.json');
      endpoint.search = new URLSearchParams({ engine:'google_lens', url, hl:'fr', country:'fr', api_key:key });
      const result = await getJSON(endpoint);
      if (result.error) throw new Error();
      return reply({matches:benchmarkMatches(result.visual_matches, item => item.link)});
    }
    const photo = jpeg(data.photo);
    const label = jpeg(data.label);
    if (!photo && !url) return reply({error:'Photo JPEG ou lien HTTPS public requis.'},400);
    const requests = [{image:photo ? {content:photo} : {source:{imageUri:url}},
      features:[{type:'WEB_DETECTION'},{type:'TEXT_DETECTION'}]}];
    if (label) requests.push({image:{content:label},features:[{type:'TEXT_DETECTION'}]});
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':key},
      body:JSON.stringify({requests}),signal:AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) return reply({error:visionError(result?.error, response.status)},502);
    const [object,tag] = result?.responses || [];
    if (!object || object.error) return reply({error:visionError(object?.error, response.status)},502);
    return reply({ matches:benchmarkMatches(object.webDetection?.pagesWithMatchingImages, item => item.url),
      labels:(object.webDetection?.bestGuessLabels || []).map(item => tidy(item.label)).filter(Boolean),
      text:tidy(tag?.fullTextAnnotation?.text || object.fullTextAnnotation?.text, 550) });
  } catch {
    return reply({error:'Le fournisseur n’a pas répondu. Vérifiez son accès et son quota.'},502);
  }
}

async function terminalReaders(request, env, provider) {
  if (request.method !== 'GET') return reply({error:'Méthode non autorisée.'},405);
  if (!request.headers.get('oai-authenticated-user-id') || request.headers.get('X-Seconde-Vie') !== 'terminals')
    return reply({error:'Session requise.'},403);
  const sumup = provider === 'sumup';
  if (!sumup && provider !== 'stripe') return reply({error:'Fournisseur inconnu.'},400);
  const key = sumup ? env.SUMUP_API_KEY : env.STRIPE_TERMINAL_API_KEY;
  if (!key || (sumup && !env.SUMUP_MERCHANT_CODE))
    return reply({error:'Accès fournisseur à configurer côté serveur.'},503);
  const endpoint = sumup
    ? 'https://api.sumup.com/v0.1/merchants/' + encodeURIComponent(env.SUMUP_MERCHANT_CODE) + '/readers'
    : 'https://api.stripe.com/v1/terminal/readers?limit=100';
  try {
    const result = await getJSON(endpoint, {Authorization:'Bearer ' + key});
    const readers = sumup ? result.items : result.data;
    if (!Array.isArray(readers)) throw new Error();
    return reply({readers:readers.flatMap(reader => typeof reader.id === 'string' ? [{
      id:reader.id, label:tidy(sumup ? reader.name : reader.label, 100) || reader.id,
      status:tidy(reader.status, 24)
    }] : [])});
  } catch {
    return reply({error:'Impossible de lister les lecteurs. Vérifiez la clé, ses droits et le compte marchand.'},502);
  }
}

export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/core/')) return core(request,env);
  if (url.pathname === '/api/terminal-readers') return terminalReaders(request, env, url.searchParams.get('provider'));
  if (url.pathname === '/api/photo-bench') return photoBench(request, env);
  if (url.pathname === '/api/market' || url.pathname === '/api/market/collections') return market(request, url, env);
  return env.ASSETS.fetch(request);
} };
