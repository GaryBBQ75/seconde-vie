import { publisherBook } from './publisher-books.js';
import { pageCountValue } from './reference.js';

const results = new Map();

export function normalizeScanCode(input) {
  const text = input.trim();
  const numeric = text.replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '').replace(/[\s-]+/g, '').toUpperCase();
  return /^\d+[\dX]$/.test(numeric) ? numeric : text;
}

export function catalogType(code) {
  if (/^\d{9}[\dX]$/.test(code)) {
    const total = Array.from(code, (digit, index) => (digit === 'X' ? 10 : Number(digit)) * (10 - index))
      .reduce((sum, digit) => sum + digit, 0);
    return total % 11 === 0 ? 'book' : null;
  }
  if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return null;
  const sum = Array.from(code).reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  if (sum % 10 !== 0) return null;
  return /^(?:978\d{10}|979[1-9]\d{9})$/.test(code) ? 'book' : 'product';
}

export function catalogSource(info) {
  if (info.source === 'glivres' && /^[a-f0-9-]{36}$/.test(info.record || '')) {
    return { name:'Galaxie Livres', url:'https://www.glivres.fr/livre/' + info.record };
  }
  if (info.source === 'publisher') {
    const book = publisherBook(info.code);
    return book ? { name:book.publisher, url:book.url } : null;
  }
  if (info.source === 'bnf') {
    const ark = /^ark:\/12148\/cb\w+$/.test(info.record) ? info.record : '';
    return {
      name: 'Bibliothèque nationale de France',
      url: ark ? 'https://catalogue.bnf.fr/' + ark : 'https://catalogue.bnf.fr/',
    };
  }
  if (info.source === 'openlibrary') {
    const edition = /^\/books\/OL\d+M$/.test(info.record) ? info.record : '/isbn/' + encodeURIComponent(info.code);
    return { name:'Open Library', url:'https://openlibrary.org' + edition };
  }
  if (info.source === 'opf') {
    return { name: 'Open Products Facts', url: 'https://world.openproductsfacts.org/product/' + encodeURIComponent(info.code) };
  }
  return null;
}

function clean(value, limit = 160) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : '';
}

export function catalogPrefill(info) {
  if (!info) return {};
  const { author, translator, publisher, pages, pagination, brand, model } = info;
  return { author, translator, publisher, pagination:pageCountValue(pages || pagination), brand, model };
}

export function catalogDescription(info) {
  if (!info) return '';
  if (info.description) return info.description;
  const { author, publisher, pages, pagination, published, collection, brand, model, packaging } = info;
  const parts = ['bnf', 'openlibrary', 'glivres'].includes(info.source) ? [
    author && 'Par ' + author,
    [publisher, published].filter(Boolean).join(', '),
    collection && 'Collection ' + collection,
    pages ? pages + ' pages' : pagination,
  ] : [brand && 'Marque ' + brand, model && 'Modèle ' + model, packaging && 'Conditionnement ' + packaging];
  return parts.filter(Boolean).map(part => /[.!?]$/.test(part) ? part : part + '.').join(' ');
}

export function catalogImages(info) {
  if (info?.source === 'publisher') {
    const book = publisherBook(info.code);
    return book?.cover ? [{ url:book.cover, label:'Couverture', source:book.publisher, link:book.url }] : [];
  }
  if (info && (info.source === 'bnf' || info.source === 'openlibrary') && catalogType(info.code) === 'book') {
    return [{
      url:'https://covers.openlibrary.org/b/isbn/' + info.code + '-M.jpg?default=false',
      label:'Couverture', source:'Open Library', link:'https://openlibrary.org/isbn/' + info.code,
    }];
  }
  if (info?.source !== 'opf' || !Array.isArray(info.images)) return [];
  return info.images.filter(image => /^https:\/\/images\.(?:openproductsfacts|openfoodfacts)\.org\//.test(image.url))
    .map(image => ({ ...image, source:'Open Products Facts', link:catalogSource(info).url }));
}


async function fetchCatalog(url, read) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Catalogue indisponible.');
    return await read(response);
  } finally { clearTimeout(timer); }
}

async function book(code) {
  const url = new URL('https://catalogue.bnf.fr/api/SRU');
  const query = `bib.isbn any "${code}"` + (code.length === 13 ? ` or bib.ean any "${code}"` : '');
  const params = { version:'1.2', operation:'searchRetrieve', query, maximumRecords:'1', recordSchema:'unimarcXchange' };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return fetchCatalog(url, async response => {
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length || xml.getElementsByTagNameNS('*', 'diagnostic').length) {
      throw new Error('Réponse du catalogue indisponible.');
    }
    const marc = xml.getElementsByTagNameNS('*', 'recordData')[0];
    if (!marc) return null;
    const fields = Array.from(marc.getElementsByTagNameNS('*', 'datafield'));
    function readSubfield(field, code, limit) {
      const value = Array.from(field.children).find(node => node.getAttribute('code') === code);
      return clean(value?.textContent, limit);
    }
    function subfield(tag, code) {
      return fields.filter(node => node.getAttribute('tag') === tag)
        .map(field => readSubfield(field, code)).find(Boolean) || '';
    }
    const title = subfield('200', 'a');
    if (!title) return null;
    const pagination = subfield('215', 'a');
    const pageCount = /^(?:1 vol\.\s*\()?\s*(\d+)\s*(?:p\.|pages?)\s*\)?$/i.exec(pagination);
    const sourceDate = fields.filter(node => node.getAttribute('tag') === '801')
      .flatMap(node => Array.from(node.children)).filter(node => node.getAttribute('code') === 'c')
      .map(node => clean(node.textContent)).filter(value => /^\d{8}$/.test(value)).sort().pop();
    const description = fields.filter(node => node.getAttribute('tag') === '330')
      .filter(node => /^(?:bnf|cnlj)?$/i.test(readSubfield(node, '2')))
      .map(node => readSubfield(node, 'a', 900)).find(Boolean);
    return {
      code, source:'bnf', title, author:subfield('200', 'f'), description,
      edition:subfield('205', 'a'), collection:subfield('225', 'a'), format:subfield('215', 'd'),
      retrieved:new Date().toISOString().slice(0, 10),
      publisher:subfield('210', 'c') || subfield('214', 'c'),
      published:(subfield('210', 'd') || subfield('214', 'd')).match(/\b\d{4}\b/)?.[0],
      pages:pageCount ? Number(pageCount[1]) : undefined,
      pagination:pageCount ? '' : pagination,
      record:xml.getElementsByTagNameNS('*', 'recordIdentifier')[0]?.textContent.trim(),
      updated:sourceDate ? `${sourceDate.slice(6, 8)}/${sourceDate.slice(4, 6)}/${sourceDate.slice(0, 4)}` : '',
    };
  });
}

function openLibraryBook(code) {
  const key = 'ISBN:' + code;
  const url = new URL('https://openlibrary.org/api/books');
  url.search = new URLSearchParams({ bibkeys:key, jscmd:'data', format:'json' });
  return fetchCatalog(url, async response => {
    const edition = (await response.json())[key];
    const title = clean(edition?.title);
    if (!title) return null;
    const names = values => clean(Array.isArray(values) ? values.map(value => value?.name).filter(Boolean).join(', ') : '');
    const pages = Number.isSafeInteger(edition.number_of_pages) && edition.number_of_pages > 0 ? edition.number_of_pages : undefined;
    return {
      code, source:'openlibrary', title, author:names(edition.authors), publisher:names(edition.publishers), pages,
      pagination:pages ? '' : clean(edition.pagination), record:clean(edition.key),
      published:clean(edition.publish_date).match(/\b\d{4}\b/)?.[0],
      retrieved:new Date().toISOString().slice(0, 10),
    };
  });
}

async function lookupBook(code) {
  let primaryError;
  try {
    const result = await book(code);
    if (result) return result;
  } catch (error) { primaryError = error; }
  const fallback = await openLibraryBook(code);
  if (!fallback && primaryError) throw primaryError;
  return fallback;
}

async function product(code) {
  const url = new URL('https://world.openproductsfacts.org/api/v3/product/' + code);
  url.searchParams.set('fields', 'product_name_fr,product_name,brands,model,quantity,generic_name_fr,generic_name,selected_images');
  return fetchCatalog(url, async response => {
    const { product } = await response.json();
    const title = clean(product?.product_name_fr) || clean(product?.product_name);
    const brand = clean(product?.brands), model = clean(product?.model), packaging = clean(product?.quantity);
    const description = clean(product?.generic_name_fr, 900) || clean(product?.generic_name, 900);
    const images = [['front', 'Face avant'], ['packaging', 'Emballage']].flatMap(([view, label]) => {
      const urls = product?.selected_images?.[view]?.display || {};
      const url = urls.fr || Object.values(urls)[0];
      return typeof url === 'string' ? [{ url, label }] : [];
    });
    if (!title && !brand && !model) return null;
    return { code, source:'opf', title, brand, model, packaging, description, images,
      retrieved:new Date().toISOString().slice(0, 10) };

  });
}

export async function lookupCatalog(code) {
  const type = catalogType(code);
  if (!type) return null;
  const verified = publisherBook(code);
  if (verified) return verified;
  if (!results.has(code)) {
    const result = (type === 'book' ? lookupBook(code) : product(code)).catch(error => {
      results.delete(code);
      throw error;
    });
    results.set(code, result);
  }
  return results.get(code);
}
