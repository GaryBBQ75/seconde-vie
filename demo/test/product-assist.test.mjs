import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanIdentification,normalizeComparables,resourcerieEstimate,sourcePrice,safeSourceUrl} from '../public/product-assist-model.js';
import {productAssist} from '../worker/product-assist.mjs';
const identity={title:'Fauteuil IKEA POÄNG',brand:'IKEA',model:'POÄNG'};
const source=(id,price,extra='')=>({title:'Fauteuil IKEA POÄNG occasion',url:'https://www.leboncoin.fr/ad/ameublement/'+id,snippet:'Bon état. Prix : '+price+' €. '+extra});
const raw={results:[source(1,40),source(2,50),source(3,60)]};

test('identification : champs bornés, catégories autorisées, ISBN contrôlé et prix ignoré',()=>{
 const value=cleanIdentification({candidates:[{title:'  Livre test ',category:'Livres',barcode:'978-2-01-021275-8',field_status:{pagination:'observed',barcode:'observed'},price:500,reference:{author:'Auteur',pagination:'120 p.',secret:'inutilisé'}},{title:'Autre',category:'inconnue',barcode:'1234'}]},['Livres']);
 assert.equal(value.candidates[0].barcode,'9782010212758');assert.equal(value.candidates[0].reference.pagination,'120');assert(!JSON.stringify(value).includes('secret'));assert(!Object.hasOwn(value.candidates[0],'price'));assert.equal(value.candidates[1].category,'');assert.equal(value.candidates[1].barcode,'');
});
test('comparables : prix explicites EUR, liens sûrs, dédoublonnage et distinction neuf/occasion',()=>{
 assert.equal(sourcePrice('Prix : 1 250,50 €'),125050);assert.equal(sourcePrice('40 € + 5 € de livraison'),null);assert.equal(sourcePrice('à partir de 30 € puis 50 €'),null);assert.equal(sourcePrice('USD 40'),null);
 for(const url of ['javascript:alert(1)','https://127.0.0.1/a','https://user:password@example.com/a','https://atelier.local/a'])assert.equal(safeSourceUrl(url),'');
 const value=normalizeComparables({results:[...raw.results,source(1,40),source(4,100,'Neuf jamais utilisé'),{...source(5,40),title:'Fauteuil d’une autre marque',snippet:'Bon état. Prix : 40 €.'}]},identity);
 assert.equal(value.length,5);assert.equal(value[0].eligible,true);assert.equal(value[3].blocked,true);assert.equal(value[4].eligible,false);
});
test('prix ressourcerie : confirmation, état, trois annonces et règle de remise visible',()=>{
 const rows=normalizeComparables(raw,identity),settings={confirmed:true,condition:'good',discount:20};
 assert.equal(resourcerieEstimate(rows,{...settings,confirmed:false}),null);assert.equal(resourcerieEstimate(rows,{...settings,condition:'parts'}),null);assert.equal(resourcerieEstimate(rows.slice(0,2),settings),null);
 const value=resourcerieEstimate(rows,settings);assert.equal(value.reference,4000);assert.equal(value.cents,3200);assert.equal(value.count,3);
 assert.equal(resourcerieEstimate(rows,{...settings,discount:0}).cents,4000);
 assert.equal(resourcerieEstimate(rows,{...settings,manualPrices:{[rows[0].url]:null}}),null);
 const blocked=[...rows,{...rows[0],url:'https://example.com/neuf',blocked:true,price_cents:1}];assert.equal(resourcerieEstimate(blocked,{...settings,selected:blocked.map(row=>row.url)}).count,3);
});

test('les accessoires, lots et pages de résultats ne deviennent jamais des comparables automatiques',()=>{
 const results=[{...source(10,20),title:'Housse fauteuil IKEA POÄNG occasion'}, {...source(11,80),title:'Lot de 2 fauteuils IKEA POÄNG occasion'}, {...source(12,40),url:'https://www.vinted.fr/catalog?search_text=poang'}];
 const rows=normalizeComparables({results},{...identity,category:'Mobilier'});assert(rows.every(row=>row.blocked));assert.equal(resourcerieEstimate(rows,{confirmed:true,condition:'good',selected:rows.map(row=>row.url)}),null);
});
const request=(body,extra={})=>new Request('https://sv.example.com/api/product-assist',{method:'POST',headers:{Origin:'https://sv.example.com','X-Seconde-Vie':'product-assist','X-Seconde-Vie-Request':crypto.randomUUID(),'oai-authenticated-user-id':'operator',...extra},body:JSON.stringify(body)});
const photo='data:image/jpeg;base64,/9j/2Q==';
test('Eden : session et origine obligatoires, clé gardée au serveur, appels bornés et réutilisation d’une requête',async()=>{
 const original=globalThis.fetch;let calls=0,payload;
 globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);assert.equal(url,'https://api.edenai.run/v3/chat/completions');return Response.json({choices:[{message:{content:JSON.stringify({candidates:[{...identity,category:'Mobilier',certainty:'possible'}]})}}]});};
 try {
  const env={'Eden AI':'server-secret'},body={operation:'identify',photo,categories:['Mobilier']};
  assert.equal((await productAssist(request(body,{'oai-authenticated-user-id':''}),env)).status,403);
  assert.equal((await productAssist(request(body,{Origin:'https://other.example.com'}),env)).status,403);assert.equal(calls,0);
  const req=request(body),clone=req.clone(),first=await productAssist(req,env),data=await first.json();assert.equal(first.status,200);assert.equal(data.candidates[0].model,'POÄNG');assert.equal(payload.model,'google/gemini-2.5-flash');assert(!JSON.stringify(data).includes('server-secret'));
  assert.equal((await productAssist(clone,env)).status,200);assert.equal(calls,1);
  const bad=await productAssist(request({...body,photo:'https://127.0.0.1/secret'}),env);assert.equal(bad.status,400);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('Eden recherche : seuls les extraits sourcés produisent des prix, erreur fournisseur compréhensible',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.model,'web/search/linkup');assert.equal(payload.input.max_results,8);return Response.json({status:'success',output:raw});};
 try{const response=await productAssist(request({operation:'compare',identity,condition:'good'}),{EDENAI_API_KEY:'server-secret'}),data=await response.json();assert.equal(response.status,200);assert.equal(data.comparables.length,3);assert.equal(data.comparables[0].price_cents,4000);
 globalThis.fetch=async()=>new Response('secret-provider-diagnostic',{status:402});const failed=await productAssist(request({operation:'compare',identity,condition:'good'}),{EDENAI_API_KEY:'server-secret'});assert.equal(failed.status,502);assert.match((await failed.json()).error,/crédit/i);
 }finally{globalThis.fetch=original;}
});


test('photo : propositions par catégorie, état visuel et fonctionnement séparés, numéros jamais inférés',()=>{
 const value=cleanIdentification({candidates:[{title:'Appareil à raclette Tefal',category:'Électrique',brand:'Tefal',model:'RE1234',reference:{product_type:'Appareil à raclette',color:'Noir',power:'1500 W',serial_number:'123',manufacturer_reference:'RE1234'},field_status:{brand:'observed',model:'inferred',power:'inferred',serial_number:'inferred',manufacturer_reference:'inferred',product_type:'observed',color:'observed'},visual_condition:{grade:'fair',summary:'Traces d’usage sur la plaque.',defects:['Rayures visibles'],functionality:'working',limits:'Le fonctionnement ne se déduit pas de cette vue.'}}]},['Électrique']);
 const row=value.candidates[0];assert.equal(row.reference.color,'Noir');assert.equal(row.brand,'Tefal');assert.equal(row.model,'');assert(!row.reference.serial_number);assert(!row.reference.power);assert(!row.reference.manufacturer_reference);assert.equal(row.visual_condition.grade,'fair');assert(!Object.hasOwn(row.visual_condition,'functionality'));
 const garment=cleanIdentification({candidates:[{title:'Veste bleue',category:'Textile',reference:{product_type:'Veste',color:'Bleu',size:'M',material:'Coton',pattern:'Uni',cut:'Droite',fastening:'Boutons'},field_status:{size:'observed',material:'observed',color:'observed'}}]},['Textile']).candidates[0];assert.equal(garment.reference.size,'M');assert.equal(garment.reference.material,'Coton');assert.equal(garment.reference.fastening,'Boutons');
});
test('une proposition de prix peut être préparée avant validation, sans devenir un prix confirmé',()=>{
 const value=resourcerieEstimate(normalizeComparables(raw,identity),{condition:'good',provisional:true});assert.equal(value.cents,3200);assert.equal(value.provisional,true);assert.equal(resourcerieEstimate(normalizeComparables(raw,identity),{condition:'good'}),null);
});

test('analyse : une à six vues du même produit, toutes transmises en un seul appel',async()=>{
 const original=globalThis.fetch;let calls=0,payload;
 globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({candidates:[{...identity,category:'Mobilier'}]})}}]});};
 try {
  const env={EDENAI_API_KEY:'test-only-key'},photos=Array(6).fill(photo),body={operation:'identify',photos,categories:['Mobilier']};
  assert.equal((await productAssist(request(body),env)).status,200);assert.equal(calls,1);
  const images=payload.messages[0].content.filter(row=>row.type==='image_url');assert.equal(images.length,6);assert(images.every(row=>row.image_url.url===photo));
  assert.match(payload.messages[0].content[0].text,/MÊME produit/);
  for(const invalid of [[],Array(7).fill(photo),[photo,'https://example.org/photo.jpg'],[photo,null],'invalid'])assert.equal((await productAssist(request({...body,photos:invalid}),env)).status,400);
  assert.equal(calls,1);
  // Six independently prepared views may exceed the old two-image body limit.
  const large='data:image/jpeg;base64,/9j/'+ 'A'.repeat(385000);
  assert.equal((await productAssist(request({...body,photos:Array(6).fill(large)}),env)).status,200);assert.equal(calls,2);
  const oversized='data:image/jpeg;base64,/9j/'+ 'A'.repeat(500000);
  assert.equal((await productAssist(request({...body,photos:[oversized]}),env)).status,400);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
