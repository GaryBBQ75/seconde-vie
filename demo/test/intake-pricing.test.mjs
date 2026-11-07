import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountIntakePricing} from '../public/intake-pricing.js';
function setup(){
 const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{value:key==='[data-price-condition]'?'good':key==='[data-price-discount]'?'20':'',addEventListener(type,fn){this[type]=fn;},querySelector:node,setAttribute(){},dataset:{}});return nodes.get(key);};
 const form={isConnected:true,elements:Object.fromEntries(['title','category','price','barcode','ref_brand','ref_model','ref_product_type'].map(name=>[name,{value:({title:'Fauteuil IKEA POÄNG',category:'Mobilier',ref_brand:'IKEA',ref_model:'POÄNG'})[name]||'',focus(){},dispatchEvent(){}}])),querySelector:node,addEventListener(type,fn){this['on'+type]=fn;}};
 mountIntakePricing(form,{esc:String,euro:new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}),referenceConfirmed:true});return {form,nodes,node};
}
const rows=[40,50,60].map((price,index)=>({url:'https://example.org/'+index,title:'Fauteuil IKEA POÄNG occasion',condition:'good',price_cents:price*100,eligible:true,blocked:false}));
test('le web est lancé seulement au clic et le prix proposé reste sous le contrôle de l’opérateur',async()=>{
 const original=globalThis.fetch;let calls=0,resolve;globalThis.fetch=()=>{calls++;return new Promise(done=>resolve=done);};
 try{const {form,node}=setup();assert.equal(calls,0);const pending=node('[data-price-search]').click();assert.equal(calls,1);form.elements.price.value='25';resolve(Response.json({comparables:rows}));await pending;assert.equal(form.elements.price.value,'25');assert.match(node('[data-price-result]').innerHTML,/32,00/);
 await node('[data-apply-price]').click();assert.equal(form.elements.price.value,'32.00');
 }finally{globalThis.fetch=original;}
});
test('pas de remplacement d’une saisie si le produit change pendant la recherche',async()=>{
 const original=globalThis.fetch;let resolve;globalThis.fetch=()=>new Promise(done=>resolve=done);
 try{const {form,node}=setup();const pending=node('[data-price-search]').click();form.elements.title.value='Autre produit';resolve(Response.json({comparables:rows}));await pending;assert.equal(form.elements.price.value,'');assert.match(node('[data-price-result]').textContent,/produit a changé/);}
 finally{globalThis.fetch=original;}
});

test('un tarif automatique est retiré quand l’identité du produit change après la réponse',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({comparables:rows});
 try{const {form,node}=setup();await node('[data-price-search]').click();assert.equal(form.elements.price.value,'32.00');form.elements.title.value='Autre produit';form.oninput({target:{name:'title'}});assert.equal(form.elements.price.value,'');}
 finally{globalThis.fetch=original;}
});
