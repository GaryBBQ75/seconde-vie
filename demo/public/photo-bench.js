import { inspectObjectPhoto } from './photo-search.js';

const form = document.querySelector('#bench');
const results = document.querySelector('#results');
const headers = { 'X-Seconde-Vie':'photo-bench' };
const names = { local:'MobileNet', google:'Google Cloud Vision', serp:'Lens via SerpApi', ocrLocal:'OCR local · Tesseract', edenOcr:'OCR Eden AI', edenLogo:'Logos Eden AI', linkup:'Recherche Linkup', ebay:'eBay France' };
const runs = new Map();
const remoteEngines = ['google','serp','edenOcr','edenLogo','linkup','ebay'];

function showOCR(section, value) {
  add(section, 'p', value ? 'Texte lu · ' + value : 'Aucun texte lisible détecté.');
  if (!value) return;
  const button = add(section, 'button', 'Reprendre ce texte dans la recherche');
  button.type = 'button';
  button.className = 'btn';
  button.addEventListener('click', () => {
    const query = form.querySelector('#query');
    query.value = value.trim().replace(/\s+/g, ' ').slice(0, 180);
    query.focus();
    query.select();
  });
}

async function localOCR(file) {
  const path = '/vendor/tesseract/';
  const {default: tesseract} = await import(path + 'tesseract.esm.min.js');
  const worker = await tesseract.createWorker('fra', 1, {
    workerPath:path + 'worker.min.js', corePath:path + 'tesseract-core-lstm.wasm.js',
    langPath:path.slice(0,-1), workerBlobURL:false
  });
  try {
    const {data} = await worker.recognize(await jpeg(file));
    return data.text.trim().slice(0,700);
  } finally { await worker.terminate(); }
}

function add(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  parent.append(element);
  return element;
}

async function jpeg(file) {
  if (!file) return '';
  if (file.size > 20 * 1024 * 1024) throw new Error('Choisissez une photo de moins de 20 Mo.');
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .78);
  } finally { bitmap.close(); }
}

async function run(engine, section) {
  const photo = form.querySelector('#photo').files[0];
  const label = form.querySelector('#label').files[0];
  const url = form.querySelector('#url').value.trim();
  const start = performance.now();
  if (engine === 'local') {
    if (!photo) throw new Error('Choisissez un fichier photo pour MobileNet.');
    const type = await inspectObjectPhoto(await jpeg(photo));
    add(section, 'p', type ? type.name + ' · ' + type.category : 'Type d’objet incertain');
  } else if (engine === 'ocrLocal') {
    if (!label && !photo) throw new Error('Ajoutez une photo de l’étiquette.');
    showOCR(section, await localOCR(label || photo));
  } else {
    const query = form.querySelector('#query').value.trim();
    if (engine === 'linkup' && !query) throw new Error('Saisissez une référence ou une description.');
    if (engine === 'ebay' && !photo) throw new Error('Ajoutez la photo de l’objet.');
    if (['edenOcr','edenLogo'].includes(engine) && !photo && !(engine === 'edenOcr' && label) && !url)
      throw new Error('Ajoutez une photo ou un lien public.');
    if (engine === 'serp' && !url) throw new Error('Ajoutez un lien HTTPS public direct vers la photo pour SerpApi.');
    if (engine === 'google' && !photo && !url) throw new Error('Ajoutez une photo ou un lien public.');
    const response = await fetch('/api/photo-bench', { method:'POST',
      headers:{ ...headers, 'Content-Type':'application/json' },
      body:JSON.stringify({ engine, url, query,
        photo:['google','edenOcr','edenLogo','ebay'].includes(engine) && !(engine === 'edenOcr' && label) ? await jpeg(photo) : '',
        label:['google','edenOcr'].includes(engine) ? await jpeg(label) : '' }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (data.labels?.length) add(section, 'p', data.labels.join(' · '));
    if (engine === 'edenOcr' || data.text) showOCR(section, data.text);
    if (engine === 'edenLogo' && !data.labels?.length) add(section, 'p', 'Aucun logo détecté.');
    for (const match of data.matches) {
      const line = add(section, 'p', '');
      const link = add(line, 'a', match.title);
      link.href = match.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (match.price) line.append(' · ' + match.price + ' affiché');
      if (match.note) add(section, 'small', match.note);
    }
    if (data.matches.length) add(section, 'p', 'Vérifiez la référence sur la page avant de comparer les prix.');
    else if (!['edenOcr','edenLogo'].includes(engine)) add(section, 'p', 'Aucune page candidate renvoyée.');
  }
  add(section, 'small', 'Durée · ' + ((performance.now() - start) / 1000).toFixed(1) + ' s');
  for (const criterion of ['Référence confirmée', 'Annonce comparable trouvée']) {
    const line = add(section, 'label', '');
    const checkbox = add(line, 'input', '');
    checkbox.type = 'checkbox';
    line.append(' ' + criterion);
    add(section, 'br', '');
  }
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  if (event.target.id === 'query') { runs.get('linkup')?.remove(); return; }
  results.replaceChildren();
  runs.clear();
});
form.querySelectorAll('button[data-engine]').forEach(button => button.addEventListener('click', async () => {
  const engine = button.dataset.engine;
  runs.get(engine)?.remove();
  const section = add(results, 'section', '');
  runs.set(engine, section);
  add(section, 'h2', names[engine]);
  const status = add(section, 'p', 'Analyse en cours…');
  status.setAttribute('role', 'status');
  button.disabled = true;
  try { await run(engine, section); }
  catch (error) { add(section, 'p', error.message || 'Analyse indisponible.'); }
  finally { status.remove(); button.disabled = false; }
}));

try {
  const response = await fetch('/api/photo-bench', { headers });
  const available = await response.json();
  for (const engine of remoteEngines) form.querySelector('[data-engine=' + engine + ']').disabled = !available[engine];
  document.querySelector('#availability').textContent =
    [!available.google && 'Cloud Vision attend une clé serveur.',
      !available.serp && 'SerpApi attend une clé serveur.',
      !available.edenOcr && 'Les trois essais Eden AI attendent EDENAI_API_KEY.',
      !available.ebay && 'eBay attend EBAY_CLIENT_ID et EBAY_CLIENT_SECRET.'].filter(Boolean).join(' ');
} catch {
  document.querySelector('#availability').textContent = 'Moteurs externes indisponibles pour le moment.';
}
