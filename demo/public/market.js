const fallbackSites = [
  ['Leboncoin', 'https://www.leboncoin.fr/recherche', 'text'],
  ['Vinted', 'https://www.vinted.fr/catalog', 'search_text'],
  ['eBay', 'https://www.ebay.fr/sch/i.html', '_nkw'],
];

export function bindMarket(panel, { esc, euro }) {
  const form = panel.querySelector('form');
  const input = form.elements.query;
  const results = panel.querySelector('[data-market-results]');
  const records = panel.querySelector('[data-market-collections]');
  const museumButton = panel.querySelector('[data-find-collections]');
  let request, heritageRequest, context, intakeResults;

  function setResults(markup) {
    results.innerHTML = markup;
    if (intakeResults?.isConnected) intakeResults.innerHTML = markup;
  }

  function reset() {
    request?.abort();
    heritageRequest?.abort();
    panel.hidden = true;
    intakeResults = undefined;
    setResults('');
    records.innerHTML = '';
    museumButton.disabled = false;
  }

  async function lookup(path, params, signal) {
    const response = await fetch(path + '?' + new URLSearchParams(params), { signal, headers:{ 'X-Seconde-Vie':'market' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Source temporairement indisponible.');
    return data;
  }

  function links(query) {
    return '<div class="market-links">' + fallbackSites.map(([site, path, key]) => {
      const url = new URL(path);
      url.searchParams.set(key, query);
      return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Voir sur ${site}</a>`;
    }).join('') + '</div>';
  }

  function showOffers(data, query) {
    const items = data.offers.slice(0, 3);
    const numbers = items.filter(item => item.exact && item.kind === 'live' && item.price && item.condition);
    const comparable = numbers.length === 3 && numbers.every(item => item.condition === numbers[0].condition);
    const range = comparable ? `<p class="help">Offres de la même référence et du même état · ${euro.format(Math.min(...numbers.map(item => item.price)) / 100)} à ${euro.format(Math.max(...numbers.map(item => item.price)) / 100)}.</p>` : '';
    const missing = data.web === 'needs_key' ? 'Recherche généraliste en attente de connexion.'
      : data.web === 'restricted' ? 'Connectez-vous pour utiliser la recherche généraliste.'
      : data.web === 'unavailable' ? 'Recherche généraliste momentanément indisponible.' : '';
    return (items.length ? `<ul class="market-offers">${items.map(item => `<li>
      <div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>
      <small>${esc([item.source, item.seller, item.condition, item.exact ? 'Même code' : 'Résultat proche'].filter(Boolean).join(' · '))}</small></div>
      <div class="market-amount"><strong>${item.price ? euro.format(item.price / 100) : 'Voir l’annonce'}</strong>
      <small>${item.kind === 'index' && item.price ? 'Prix indexé à confirmer' : item.kind === 'live' ? 'Offre hors livraison' : ''}</small></div>
      </li>`).join('')}</ul><p class="help">Prix affichés par les vendeurs.</p>${range}`
      : '<p class="help">Aucune offre correspondante dans les sources disponibles.</p>')
      + (data.media === 'unavailable' ? '<p class="help">Galaxie Livres est temporairement indisponible.</p>' : '')
      + (missing ? `<p class="help">${missing}</p>` : '') + links(query);
  }

  async function search(query, options = {}) {
    reset();
    panel.hidden = false;
    input.value = query;
    context = options;
    query = query.trim();
    if (!query) {
      setResults('<p class="help">Saisissez le nom de l’objet ou un détail visible pour chercher des offres.</p>');
      return;
    }
    setResults('<p class="help">Recherche d’annonces en cours…</p>');
    request = new AbortController();
    const { signal } = request;
    try {
      const data = await lookup('/api/market', { q:query, barcode:options.barcode || '', media:options.media === false ? '0' : '1' }, signal);
      if (!signal.aborted && panel.isConnected) {
        setResults(showOffers(data, query));
        return data.reference;
      }
    } catch {
      if (!signal.aborted && panel.isConnected) setResults('<p class="help">Recherche temporairement indisponible.</p>' + links(query));
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    search(query, { ...context, barcode:query === context?.barcode ? context.barcode : '' });
  });
  museumButton.addEventListener('click', async () => {
    const query = input.value.trim();
    if (!query || /^\d+$/.test(query)) {
      records.textContent = 'Indiquez un type d’objet, une marque ou une inscription.';
      input.focus();
      return;
    }
    heritageRequest?.abort();
    heritageRequest = new AbortController();
    const { signal } = heritageRequest;
    museumButton.disabled = true;
    records.textContent = 'Recherche dans les collections…';
    try {
      const data = await lookup('/api/market/collections', { q:query }, signal);
      if (signal.aborted || !panel.isConnected) return;
      records.innerHTML = data.records.length ? `<p class="help">Collections du Cleveland Museum of Art · Informations de référence</p>
        <ul class="market-offers">${data.records.map(item => `<li><div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>
          <small>${esc([item.author, item.date, item.material].filter(Boolean).join(' · '))}</small></div></li>`).join('')}</ul>`
        : '<p class="help">Aucune notice trouvée dans ce musée.</p>';
    } catch (error) {
      if (!signal.aborted && panel.isConnected) records.textContent = error.message;
    } finally {
      if (!signal.aborted) museumButton.disabled = false;
    }
  });

  return { search, reset, showInIntake(target) {
    intakeResults = target;
    intakeResults.innerHTML = results.innerHTML;
  } };
}
