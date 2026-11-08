export const commerceProviders={shopify:{name:'Shopify',color:'#e4edd5',mark:'S',description:'Envoyez vos objets en brouillon dans votre boutique Shopify. Prix, référence et disponibilité.'},woocommerce:{name:'WooCommerce',color:'#ece5f3',mark:'W',description:'Reliez votre boutique WordPress et préparez vos fiches produits WooCommerce.'},ebay:{name:'eBay',color:'#f6e9df',mark:'e',description:'Exportez les fiches à préparer pour eBay. Les catégories et règles vendeur restent à compléter.'}};
export function commerceHost(value,provider){
 let url;try{url=new URL(value);}catch{throw Object.assign(new Error('Indiquez une adresse HTTPS complète.'),{status:400});}
 const host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!host.includes('.')||!/[a-z]$/.test(host)||/[\[\]:]/.test(host)||/^\d/.test(host)||/(?:^|\.)(?:localhost|local|internal|test|invalid|example|arpa|lan)$/.test(host)||/(?:nip\.io|sslip\.io|localtest\.me|lvh\.me)$/.test(host))throw Object.assign(new Error('Utilisez le domaine public HTTPS de la boutique.'),{status:400});
 if(provider==='shopify'&&!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host))throw Object.assign(new Error('Utilisez le domaine de la boutique en .myshopify.com.'),{status:400});
 if(provider==='shopify'&&url.pathname!=='/')throw Object.assign(new Error('Indiquez seulement le domaine Shopify.'),{status:400});
 return url.origin+url.pathname.replace(/\/+$/,'');
}
export function onlineQuantity(row){return row?.kind==='item'&&row.web_visible&&row.state==='pret'&&Number.isSafeInteger(row.price_cents)&&row.price_cents>=0?Math.max(0,Math.min(100000,Number.isSafeInteger(row.quantity)?row.quantity:1)):0;}
export function exportProducts(rows,currency='EUR'){
 const cell=value=>'"'+String(value??'').replace(/^([=+@\-\t\r])/,"'$1").replace(/"/g,'""')+'"';
 return '\ufeff'+[['SKU','Titre','Description','Prix','Devise','Quantité','Catégorie','Code EAN ou ISBN','Marque','Modèle','État','Photos publiques'],...rows.filter(row=>onlineQuantity(row)>0).map(row=>[row.code,row.title,row.description,(row.price_cents/100).toFixed(2),currency,onlineQuantity(row),row.category,row.barcode,row.reference?.brand,row.reference?.model,row.condition,(row.public_photos||[]).join(' | ')])].map(row=>row.map(cell).join(';')).join('\r\n');
}
