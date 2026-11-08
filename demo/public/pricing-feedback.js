import {safeSourceUrl,resaleConditions} from './product-assist-model.js';
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;};
const validMoney=value=>Number.isSafeInteger(value)&&value>0&&value<=100000000;
export function cleanPricingEvidence(value,accepted,now=Date.now()){
 if(!value||value.currency!=='EUR'||!validMoney(value.market_cents)||!validMoney(accepted))return undefined;
 const time=Date.parse(value.observed_at);if(!Number.isFinite(time)||time>now+300000||time<now-180*86400000)return undefined;
 const count=Number(value.source_count);if(!Number.isInteger(count)||count<2||count>12)return undefined;
 const condition=resaleConditions.some(([id])=>id===value.condition)?value.condition:'';
 const quality=value.market_quality==='comparable'&&count>=3&&Boolean(condition)&&!['parts','untested'].includes(condition);
 return {version:1,currency:'EUR',market_cents:value.market_cents,accepted_cents:accepted,source_count:count,condition,market_quality:quality?'comparable':'limited',confirmed:value.confirmed===true&&quality,observed_at:new Date(time).toISOString(),source_urls:[...new Set((Array.isArray(value.source_urls)?value.source_urls:[]).map(safeSourceUrl).filter(Boolean))].slice(0,5)};
}
export function pricingEvidence(estimate,accepted,{condition,confirmed=false,observedAt=new Date().toISOString()}={}){
 if(!estimate)return undefined;
 return cleanPricingEvidence({currency:'EUR',market_cents:estimate.reference,source_count:estimate.count,condition,confirmed,market_quality:estimate.count>=3&&!estimate.warnings?.length?'comparable':'limited',observed_at:observedAt,source_urls:estimate.rows.map(row=>row.url)},accepted);
}
export function pricingProfile(stock,{site_id,category,condition},now=Date.now()){
 const seen=new Set();const samples=(stock||[]).filter(row=>{
  const e=row.pricing_evidence;if(!row.id||seen.has(row.id))return false;seen.add(row.id);
  return row.kind==='item'&&row.site_id===site_id&&row.category===category&&Boolean(condition)&&e?.condition===condition&&e.confirmed===true&&e.market_quality==='comparable'&&e.currency==='EUR'&&e.source_count>=3&&e.accepted_cents===row.price_cents&&validMoney(e.market_cents)&&validMoney(e.accepted_cents)&&Date.parse(e.observed_at)<=now+300000&&Date.parse(e.observed_at)>=now-180*86400000&&!(row.state==='sorti'&&row.exit_type!=='vente')&&!(row.category==='Électrique'&&row.functionality!=='working');
 }).sort((a,b)=>Date.parse(b.pricing_evidence.observed_at)-Date.parse(a.pricing_evidence.observed_at)).slice(0,100).filter(row=>{const ratio=row.price_cents/row.pricing_evidence.market_cents;return ratio>=.05&&ratio<=1.5;});
 const count=samples.length;if(count<5)return {ready:false,count,minimum:5};
 const ratio=median(samples.map(row=>row.price_cents/row.pricing_evidence.market_cents)),discount=Math.max(0,Math.min(90,Math.round((1-ratio)*100/5)*5));
 return {ready:true,count,minimum:5,discount,category,condition};
}
export function marketPriceCards(rows,estimate,profile,{esc,euro}){
 const used=new Set(estimate?.rows.map(row=>row.url)||[]),priced=rows.filter(row=>row.price_cents&&(!row.blocked||(row.offer_kind==='buyback'&&row.related))).slice(0,6);
 return `<section class="market-breakdown"><h3>Prix trouvés en ligne</h3><p class="help">Annonces affichées, hors livraison · ces prix ne sont pas des ventes réalisées.</p><div class="market-price-cards">${priced.map(row=>`<a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(row.source)}</span><strong>${euro.format(row.price_cents/100)}</strong><small>${row.offer_kind==='buyback'?'Offre de rachat · hors calcul':used.has(row.url)?'Annonce retenue':'Référence à vérifier · hors calcul'}</small><span class="market-source-title">${esc(row.title)}</span></a>`).join('')||'<p class="help">Aucun montant exploitable dans les résultats disponibles.</p>'}</div><p class="pricing-learning">${profile?.ready?`Adaptation aux tarifs de ce site : ${profile.discount} % sous le repère web · ${profile.count} tarifs validés dans cette catégorie.`:`Adaptation aux tarifs de ce site : ${profile?.count||0}/5 exemples validés. Le premier produit reste estimable à partir du web.`}</p></section>`;
}
