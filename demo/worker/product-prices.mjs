export function priceQuery(identity){
 const words=[identity.brand,identity.model,identity.type||(!identity.model?identity.title:'')].filter(Boolean);
 const label=[...new Set(words)].join(' ').slice(0,220)||identity.title||identity.barcode;
 const product=identity.barcode&&!identity.model?`(${identity.barcode} OR "${label.replace(/["()]/g,' ')}")`:label;return product+' occasion prix France';
}
export function serpPriceResults(data){
 return {results:(data.organic_results||[]).slice(0,12).map(row=>{
  const pieces=[row.snippet,...(row.extensions||[]),...(row.rich_snippet?.top?.extensions||[]),...(row.rich_snippet?.bottom?.extensions||[])].filter(value=>typeof value==='string');
  const detected=[row.rich_snippet?.top?.detected_extensions,row.rich_snippet?.bottom?.detected_extensions].filter(Boolean);
  const prices=detected.flatMap(value=>['€','EUR'].includes(value.currency)&&Number.isFinite(Number(value.price))&&Number(value.price)>0?[Math.round(Number(value.price)*100)]:[]);
  const unique=[...new Set(prices)];
  // Only an explicitly denominated source price is used, never a generated number.
  if(unique.length===1)pieces.unshift('Prix : '+(unique[0]/100).toFixed(2)+' EUR.');
  return {title:row.title,url:row.link,snippet:pieces.join(' · ')};
 })};
}
export async function serpPrices(key,identity){
 const endpoint=new URL('https://serpapi.com/search.json');endpoint.search=new URLSearchParams({engine:'google',q:priceQuery(identity),hl:'fr',gl:'fr',google_domain:'google.fr',num:'10',api_key:key});
 let response;try{response=await fetch(endpoint,{signal:AbortSignal.timeout(25000)});}catch{throw Object.assign(new Error('La recherche de prix prend trop de temps. Réessayez ; votre fiche est conservée.'),{status:504});}
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.error){const message=[401,403].includes(response.status)?'La clé de recherche web est refusée.':response.status===429?'La limite de recherche web est atteinte. Réessayez plus tard.':'La recherche web est indisponible. Vérifiez le crédit et la configuration du service.';throw Object.assign(new Error(message),{status:502});}
 return serpPriceResults(data);
}
