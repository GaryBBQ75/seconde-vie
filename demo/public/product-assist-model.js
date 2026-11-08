import {catalogType,normalizeScanCode} from './catalog.js';
import {cleanReference,referenceFields} from './reference.js';
import {cleanVisualCondition} from './condition.js';
import {normalizedWords,namedObjectType} from './object-types.js';

const clean=(value,max=160)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
export const resaleConditions=[['like_new','Très bon état / comme neuf'],['good','Bon état'],['fair','État correct'],['poor','État dégradé'],['untested','Non testé'],['parts','Pour pièces']];
export function safeSourceUrl(value) {
  try {const url=new URL(value);if(url.protocol!=='https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /\.(local|localhost|internal|test)$/i.test(url.hostname))return '';url.hash='';if(/(?:^|\.)(leboncoin\.fr|vinted\.fr|ebay\.fr)$/.test(url.hostname))url.search='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);return url.href;}catch{return '';}
}
export function cleanIdentification(value,categories) {
  const candidates=(Array.isArray(value?.candidates)?value.candidates:[]).slice(0,3).flatMap(candidate=>{
    const title=clean(candidate.title),category=categories.includes(candidate.category)?candidate.category:'';
    if(!title)return [];
    const code=normalizeScanCode(clean(candidate.barcode,80));
    const supplied={...candidate.reference,brand:clean(candidate.reference?.brand)||clean(candidate.brand),model:clean(candidate.reference?.model)||clean(candidate.model)};
    const field_status=Object.fromEntries(referenceFields(category).map(([key])=>[key,['observed','inferred','unknown'].includes(candidate.field_status?.[key])?candidate.field_status[key]:supplied[key]?'inferred':'unknown']));
    for(const [key,status] of Object.entries(field_status))if(status==='unknown')delete supplied[key];
    if(field_status.model!=='observed'&&/\d/.test(supplied.model||'')){delete supplied.model;field_status.model='unknown';}
    field_status.barcode=candidate.field_status?.barcode==='observed'?'observed':'unknown';
    for(const key of ['manufacturer_reference','serial_number','power','voltage','size','pagination','capacity','dimensions'])if(field_status[key]!=='observed'){delete supplied[key];field_status[key]='unknown';}
    if(category==='Textile'&&field_status.material!=='observed'){delete supplied.material;field_status.material='unknown';}
    const reference=cleanReference(category,supplied);
    return [{title,category,field_status,visual_condition:cleanVisualCondition(candidate.visual_condition),brand:reference?.brand||'',model:reference?.model||'',barcode:field_status.barcode==='observed'&&catalogType(code)?code:'',reference,description:clean(candidate.description,800),evidence:clean(candidate.evidence,300),uncertainty:clean(candidate.uncertainty,250),certainty:['strong','possible','uncertain'].includes(candidate.certainty)?candidate.certainty:'uncertain'}];
  });
  return {candidates,missing:clean(value?.missing,350)};
}
export function sourcePrice(text) {
  const money='(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+|\\d+)([,.]\\d{1,2})?\\s*(?:€|EUR\\b)';
  const marked=[...text.matchAll(new RegExp('\\bprix\\s*[:：]\\s*'+money,'gi'))];
  const hits=marked.length?marked:[...text.matchAll(new RegExp('(?<![\\d.,\\u00a0\\u202f])'+money,'gi')),...text.matchAll(new RegExp('(?:€|EUR)\\s*(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+|\\d+)([,.]\\d{1,2})?(?![\\d.,])','gi'))];
  const prices=new Set(hits.map(hit=>Math.round(Number(hit[1].replace(/[ .\u00a0\u202f]/g,'')+(hit[2]||'').replace(',','.'))*100)).filter(value=>Number.isSafeInteger(value)&&value>0&&value<=100000000));
  if(!marked.length && /livraison|frais de port|mensualit|\b\d\s*[x×]\s*\d|\b(?:lot de|pack de)\s*\d/i.test(text))return null;
  return prices.size===1?[...prices][0]:null;
}
function sourceCondition(text) {
  const words=normalizedWords(text);
  if(/\b(pour pieces|hs|h s|hors service|ne fonctionne pas|en panne|non fonctionnel|non fonctionnelle|defectueux|defectueuse)\b/.test(words))return 'parts';
  if(/\b(abime|degrade|tres use|mauvais etat)\b/.test(words))return 'poor';
  if(/\b(non teste|a tester)\b/.test(words))return 'untested';
  if(/\b(comme neuf|comme neuve|quasi neuf|quasi neuve|excellent etat|tres bon etat)\b/.test(words))return 'like_new';
  if(/\b(bon etat|fonctionne parfaitement|teste fonctionne)\b/.test(words))return 'good';
  if(/\b(etat correct|etat acceptable|etat satisfaisant|etat moyen)\b/.test(words))return 'fair';
  return '';
}
export function normalizeComparables(output,identity) {
  const container=output?.output||output?.data||output;
  const list=Array.isArray(container)?container:Array.isArray(container?.results)&&container.results.length?container.results:Array.isArray(container?.sources)?container.sources:Array.isArray(container?.organic_results)?container.organic_results:[];
  const code=normalizeScanCode(identity.barcode||''),brandWords=normalizedWords(identity.brand||'').split(' ').filter(Boolean),modelWords=normalizedWords(identity.model||'').split(' ').filter(Boolean);
  const stop=new Set(['appareil','machine','ensemble','avec','pour','sans','des','une','les','test','noir','noire','blanc','blanche','bleu','bleue','rouge','bon','etat','occasion','personnes']);
  const terms=normalizedWords(identity.type||identity.title).split(' ').filter(word=>word.length>2&&!stop.has(word)&&!brandWords.includes(word));
  const type=namedObjectType({kind:'item',title:identity.title,category:identity.category});
  const originalTitle=normalizedWords(identity.title),accessories=/\b(accessoires?|chargeur|cable|telecommande|notice|manuel|housse|boite vide|pieces? detachees?|capsules?)\b/;
  const seen=new Set();
  return list.slice(0,20).flatMap(item=>{
    const url=safeSourceUrl(item.url||item.link);if(!url||seen.has(url))return [];seen.add(url);
    const title=clean(item.title||item.name),snippet=clean(item.snippet||item.content||item.description,3000),text=title+' '+snippet,words=' '+normalizedWords(text)+' ',compact=normalizedWords(text).replace(/[^a-z0-9]/g,'');if(!title)return [];
    const brandMatch=brandWords.length>0&&brandWords.every(term=>words.includes(' '+term+' '));
    const modelMatch=modelWords.length>0&&(modelWords.every(term=>words.includes(' '+term+' '))||(/\d/.test(identity.model)&&compact.includes(modelWords.join(''))));
    const codeMatch=Boolean(code&&catalogType(code)&&text.replace(/[\s-]/g,'').includes(code));
    const exact=codeMatch||Boolean(brandMatch&&modelMatch);
    const sourceType=type&&namedObjectType({kind:'item',title:text,category:type.category}),sameType=!type||!sourceType||type.name===sourceType.name;
    const overlap=terms.filter(term=>words.includes(' '+term+' ')).length,typeMatch=terms.length>0&&overlap>=Math.max(1,Math.ceil(terms.length*.6));
    const related=sameType&&(exact||(identity.model?false:(brandWords.length?brandMatch&&typeMatch:typeMatch&&terms.length>=2)));
    const normalizedTitle=normalizedWords(title),leadingProduct=[identity.type,type?.name,terms[0]].filter(Boolean).map(normalizedWords).some(prefix=>prefix.length>2&&normalizedTitle.startsWith(prefix+' '));
    const accessory=accessories.test(normalizedTitle)&&!accessories.test(originalTitle)&&!leadingProduct,lot=/\b(?:lot de|pack de)\s*\d/i.test(title);
    const condition=sourceCondition(text),used=/\b(occasion|seconde main|d occasion|reconditionne|used)\b/.test(words)||Boolean(condition)||/(?:^|\.)(leboncoin\.fr|vinted\.fr)$/.test(new URL(url).hostname);
    const isNew=/\b(neuf|neufs|neuve|neuves|new|jamais utilise|jamais utilisee)\b/.test(words)&&!/\b(comme neuf|comme neuve|quasi neuf|quasi neuve|reconditionne|remis a neuf)\b/.test(words);
    const listing=!/\/(?:recherche|search|catalog|sch\/i\.html)(?:[/?]|$)/i.test(new URL(url).pathname);
    const buyback=/(?:^|\.)momox\.fr$/.test(new URL(url).hostname),offer_kind=buyback?'buyback':'listing';
    const cents=sourcePrice(text),hardReason=accessory?'Accessoire seul':lot?'Lot de plusieurs produits':!related?'Référence différente ou non confirmée':!listing?'Page de résultats':buyback?'Offre de rachat, hors comparaison de vente':isNew?'Produit neuf':!used?'Occasion non précisée':!cents?'Prix absent ou ambigu':'';
    return [{url,title,snippet,price_cents:cents,condition,exact,related,offer_kind,eligible:!hardReason,blocked:buyback||isNew||!listing||accessory||lot,reason:hardReason||(!condition?'État non précisé — repère indicatif':''),source:new URL(url).hostname.replace(/^www\./,'')}];
  }).slice(0,12);
}
export function selectedComparables(rows,condition){
 return rows.filter(row=>row.eligible&&!row.blocked&&(row.condition===condition||(!row.condition&&!['parts','poor','untested'].includes(condition))||(!condition&&['good','fair','like_new'].includes(row.condition)))).map(row=>row.url);
}
export function resourcerieEstimate(comparables,{condition,discount=20,confirmed=false,selected,manualPrices={},provisional=false}={}) {
  if((!confirmed&&!provisional)||(!resaleConditions.some(([key])=>key===condition)&&!(provisional&&!condition)))return null;
  const allowed=new Set(Array.isArray(selected)?selected:selectedComparables(comparables,condition));
  const rows=comparables.flatMap(row=>{
    const manual=manualPrices[row.url],price=Object.hasOwn(manualPrices,row.url)?(Number.isSafeInteger(manual)&&manual>0&&manual<=100000000?manual:null):row.price_cents;
    const accepted=allowed.has(row.url);
    return accepted && !row.blocked && price>0?[{...row,price_cents:price}]:[];
  });
  if(rows.length<(provisional?2:3))return null;
  const prices=rows.map(row=>row.price_cents).sort((a,b)=>a-b),pick=q=>prices[Math.floor((prices.length-1)*q)],rate=Math.max(0,Math.min(90,Number.isFinite(discount)?discount:20));
  const reference=pick(.25),cents=Math.max(1,Math.round(reference*(100-rate)/100));
  const unspecified=rows.filter(row=>!row.condition).length,warnings=[rows.length<3?'Seulement deux annonces exploitables.':'',unspecified?`État non précisé pour ${unspecified} annonce${unspecified>1?'s':''}.`:'',!condition?'État du produit à confirmer.':''].filter(Boolean);
  return {cents,reference,provisional:!confirmed||Boolean(warnings.length),warnings,discount:rate,low:prices[0],high:prices.at(-1),median:pick(.5),count:rows.length,rows,confidence:warnings.length?'Repère limité, à confirmer':rows.every(row=>row.eligible&&row.exact&&row.condition===condition)?'Comparaison ciblée':'Repères sur des produits similaires'};
}
