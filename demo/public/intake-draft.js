const key = (org,site) => 'seconde-vie-intake-' + org + '-' + site;
const fields = new Set(['category','kind','mode','quantity','weight','weight_optional','title','price',
  'condition','contact_id','zone_id','origin','description','note','barcode']);

export function saveIntakeDraft(org,site,draft,storage = localStorage) {
  const clean = Object.fromEntries(Object.entries(draft.fields || {}).filter(([name,value]) =>
    (fields.has(name) || /^ref_[a-z]+$/.test(name)) && typeof value === 'string' && value.length <= 1500));
  const photos = (draft.photos || []).filter(value => typeof value === 'string'
    && value.length <= 400000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value)).slice(0,3);
  try {
    storage.setItem(key(org,site),JSON.stringify({fields:clean,photos}));
    return true;
  } catch {
    try { storage.setItem(key(org,site),JSON.stringify({fields:clean,photos:[]})); } catch { /* Stockage indisponible. */ }
    return false;
  }
}

export function readIntakeDraft(org,site,storage = localStorage) {
  try {
    const draft = JSON.parse(storage.getItem(key(org,site)) || 'null');
    if(!draft || !draft.fields || Array.isArray(draft.fields) || typeof draft.fields !== 'object' || !Array.isArray(draft.photos))return null;
    return {fields:Object.fromEntries(Object.entries(draft.fields).filter(([name,value])=>(fields.has(name) || /^ref_[a-z]+$/.test(name)) && typeof value==='string' && value.length<=1500)),
      photos:draft.photos.filter(value=>typeof value==='string' && value.length<=400000 && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value)).slice(0,3)};
  } catch { return null; }
}

export function clearIntakeDraft(org,site,storage = localStorage) {
  try { storage.removeItem(key(org,site)); } catch { /* Aucun changement métier. */ }
}
