import {test} from 'node:test';import assert from 'node:assert/strict';
import {cleanPricingEvidence,pricingProfile,pricingEvidence,marketPriceCards} from '../public/pricing-feedback.js';
import {normalizeComparables,resourcerieEstimate} from '../public/product-assist-model.js';
import {movePhoto} from '../public/photo-order.js';
const now=Date.parse('2026-11-08T00:00:00Z'),date=new Date(now).toISOString(),evidence=(extra={})=>({currency:'EUR',market_cents:10000,source_count:3,condition:'good',market_quality:'comparable',confirmed:true,observed_at:date,source_urls:['https://example.org/offer'],...extra});
const sample=(id,price=4000,extra={})=>({id,kind:'item',site_id:'paris',category:'Mobilier',state:'pret',price_cents:price,pricing_evidence:cleanPricingEvidence(evidence(),price,now),...extra});
const query={site_id:'paris',category:'Mobilier',condition:'good'};
test('prix : seulement les validations explicites, fraîches et cohérentes alimentent le profil local',()=>{
 const stock=Array.from({length:4},(_,i)=>sample('a'+i));assert.deepEqual(pricingProfile(stock,query,now),{ready:false,count:4,minimum:5});
 for(const bad of [sample('bad',4000,{site_id:'rouen'}),sample('bad',4000,{category:'Textile'}),sample('bad',4000,{price_cents:5000}),sample('bad',4000,{pricing_evidence:evidence({accepted_cents:4000,confirmed:false})}),sample('bad',4000,{state:'sorti',exit_type:'don'}),sample('bad',4000,{pricing_evidence:evidence({accepted_cents:4000,observed_at:'2020-01-01'})})])assert.equal(pricingProfile([...stock,bad],query,now).ready,false);
 const profile=pricingProfile([...stock,sample('fifth'),sample('outlier',10000)],query,now);assert.equal(profile.discount,60);assert.equal(profile.count,6);assert.equal(pricingProfile([...stock,stock[0]],query,now).ready,false);
});
test('prix : hygiène des sources, état et absence de boucle sur les prix automatiques',()=>{
 assert.equal(cleanPricingEvidence(evidence({currency:'USD'}),100,now),undefined);assert.equal(cleanPricingEvidence(evidence({observed_at:'2020-01-01'}),100,now),undefined);assert.equal(cleanPricingEvidence(evidence({source_count:1}),100,now),undefined);
 assert.equal(cleanPricingEvidence(evidence({condition:'parts'}),100,now).confirmed,false);assert.equal(cleanPricingEvidence(evidence({source_count:2}),100,now).confirmed,false);assert.deepEqual(cleanPricingEvidence(evidence({source_urls:['javascript:bad','https://example.org/offer','https://example.org/offer']}),100,now).source_urls,['https://example.org/offer']);
 const auto=pricingEvidence({reference:10000,count:3,rows:[],warnings:[]},3000,{condition:'good',observedAt:new Date().toISOString()});assert.equal(auto.confirmed,false);
});
test('prix : l’électrique non testé n’entraîne pas le profil des objets fonctionnels',()=>{const rows=Array.from({length:5},(_,i)=>sample(String(i),4000,{category:'Électrique',functionality:'untested'}));assert.equal(pricingProfile(rows,{...query,category:'Électrique'},now).count,0);rows.forEach(row=>row.functionality='working');assert.equal(pricingProfile(rows,{...query,category:'Électrique'},now).ready,true);});
test('photos : déplacement vers la couverture, indices invalides et conservation des six vues',()=>{const rows=['a','b','c','d','e','f'];assert.equal(movePhoto(rows,5,0),true);assert.deepEqual(rows,['f','a','b','c','d','e']);for(const [a,b]of [[0,6],[-1,0],[0,0],[.5,2]])assert.equal(movePhoto(rows,a,b),false);assert.equal(rows.length,6);});
