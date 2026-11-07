import { catalogType, normalizeScanCode } from './catalog.js';
import { matchesObjectType, namedObjectType, normalizedWords } from './object-types.js';
import { publisherBook } from './publisher-books.js';

const demoBookRate = 40;

export function priceEstimate(stock, item) {
  if (item.kind !== 'item') return null;
  const code = normalizeScanCode(item.barcode || '');
  const codeType = catalogType(code);
  const brand = normalizedWords(item.reference?.brand);
  const model = normalizedWords(item.reference?.model);
  const type = namedObjectType(item);
  if (!item.site_id || (!codeType && !(brand && model) && !type)) return null;
  const sold = stock.filter(row => row.id !== item.id && row.site_id === item.site_id && row.kind === 'item'
    && row.state === 'sorti' && row.exit_type === 'vente' && Number.isSafeInteger(row.price_cents) && row.price_cents > 0);
  const sameCode = codeType && sold.filter(row => normalizeScanCode(row.barcode || '') === code);
  if (sameCode?.length) return summarize(sameCode, 'Même code-barres');
  if (brand && model) {
    const sameModel = sold.filter(row => row.category === item.category
      && normalizedWords(row.reference?.brand || row.catalog?.brand) === brand
      && normalizedWords(row.reference?.model || row.catalog?.model) === model);
    if (sameModel.length) return summarize(sameModel, 'Même marque et modèle');
  }
  const similar = type ? sold.filter(row => matchesObjectType(row, type)) : [];
  if (similar.length >= 3) return summarize(similar, 'Même type d’objet');
  const publisher = codeType === 'book' ? publisherBook(code) : undefined;
  if (publisher?.retailPriceCents) {
    return { cents:Math.round(publisher.retailPriceCents * demoBookRate / 100), rate:demoBookRate };
  }
  return null;
}

function summarize(rows, basis) {
  const prices = rows.map(row => row.price_cents).sort((a, b) => a - b);
  const count = prices.length;
  const middle = Math.floor(count / 2);
  const cents = count % 2 ? prices[middle] : Math.round(prices[middle - 1] / 2 + prices[middle] / 2);
  return { cents, count, low:prices[0], high:prices[count - 1], basis };
}
