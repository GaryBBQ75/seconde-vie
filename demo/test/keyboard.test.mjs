import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardAction,shortcutKeys,shortcutLabel} from '../public/keyboard.js';
const key=(value,extra={})=>({key:value,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...extra});
test('Mac : Commande K pour chercher, Commande Entrée pour enregistrer en réception',()=>{
 assert.equal(keyboardAction(key('k',{metaKey:true}),{mac:true,page:'accueil'}),'search');assert.equal(shortcutKeys('R',true),'Meta+K');assert.equal(shortcutLabel('R',true),'⌘ + K');
 assert.equal(keyboardAction(key('Enter',{metaKey:true}),{mac:true,page:'accueil'}),'continue');assert.equal(keyboardAction(key('Enter',{metaKey:true}),{mac:true,page:'caisse'}),'');
 assert.equal(keyboardAction(key('R',{ctrlKey:true,shiftKey:true}),{mac:true,page:'stock'}),'search');
});
test('clavier Windows/Linux : Control K et raccourcis existants',()=>{
 assert.equal(keyboardAction(key('k',{ctrlKey:true}),{page:'scanner'}),'search');assert.equal(keyboardAction(key('r',{altKey:true}),{page:'scanner'}),'search');assert.equal(shortcutKeys('R',false),'Control+K');
 assert.equal(keyboardAction(key('p',{altKey:true}),{page:'caisse'}),'payment');assert.equal(keyboardAction(key('p',{altKey:true}),{page:'accueil'}),'');
});
test('ne pas déclencher pendant une composition, une répétition ou une combinaison différente',()=>{
 for(const extra of [{isComposing:true},{repeat:true},{defaultPrevented:true},{altKey:true},{shiftKey:true}])assert.equal(keyboardAction(key('k',{metaKey:true,...extra}),{mac:true,page:'accueil'}),'');
 assert.equal(keyboardAction(key('k'),{mac:true,page:'accueil'}),'');assert.equal(keyboardAction(key('R',{metaKey:true,shiftKey:true}),{mac:true,page:'accueil'}),'');
});
