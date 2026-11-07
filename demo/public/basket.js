const key = (org, site) => 'seconde-vie-basket-' + org + '-' + site;

export function readBasket(org, site, stock, storage = sessionStorage) {
  try {
    const saved = JSON.parse(storage.getItem(key(org,site)) || 'null');
    if (!saved || !Array.isArray(saved.lines)) return {lines:[],discount:null};
    const lines = saved.lines.slice(0,100).flatMap(line => {
      if (line.kind === 'libre') return /^libre-[a-f0-9]{32}$/.test(line.id)
        && Number.isSafeInteger(line.price_cents) && line.price_cents >= 0 ? [line] : [];
      const current = stock.find(row => row.id === line.id && row.site_id === site && row.state === 'pret');
      return current && Number.isSafeInteger(current.price_cents) && current.price_cents >= 0 ? [current] : [];
    });
    const subtotal = lines.reduce((sum,row) => sum + row.price_cents, 0);
    const discount = saved.discount;
    const valid = discount && Number.isSafeInteger(discount.value) && discount.value >= 0
      && (discount.type === 'percent' ? discount.value <= 100 : discount.type === 'amount' && discount.value <= subtotal);
    return {lines,discount:lines.length && valid ? discount : null};
  } catch { return {lines:[],discount:null}; }
}

export function saveBasket(org, site, lines, discount, storage = sessionStorage) {
  try {
    if (lines.length) storage.setItem(key(org,site),JSON.stringify({lines,discount}));
    else storage.removeItem(key(org,site));
  } catch { /* La vente reste possible si le navigateur refuse le brouillon. */ }
}
