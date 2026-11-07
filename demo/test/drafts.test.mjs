import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveIntakeDraft,readIntakeDraft,clearIntakeDraft } from '../public/intake-draft.js';
class Store {
  values=new Map();getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,value);}removeItem(key){this.values.delete(key);}
}
test('brouillon : reprise des champs et photos, séparation par personne et site, effacement après validation',()=>{
  const storage=new Store(),draft={fields:{title:'Carton',category:'Livres',quantity:'12',ref_author:'Auteur',contact_id:'contact',secret:'non'},photos:['data:image/jpeg;base64,/9j/2Q==']};
  assert(saveIntakeDraft('org-personne','site',draft,storage));
  assert.equal(readIntakeDraft('org-personne','site',storage).fields.title,'Carton');
  assert.equal(readIntakeDraft('org-personne','site',storage).photos.length,1);
  assert(!('secret' in readIntakeDraft('org-personne','site',storage).fields));
  assert.equal(readIntakeDraft('org-autre','site',storage),null);assert.equal(readIntakeDraft('org-personne','autre',storage),null);
  clearIntakeDraft('org-personne','site',storage);assert.equal(readIntakeDraft('org-personne','site',storage),null);
});
test('brouillon : quota photo dépassé conserve les champs et signale une sauvegarde partielle',()=>{
  const storage=new Store();storage.setItem=function(key,value){if(JSON.parse(value).photos.length)throw new Error('Quota');this.values.set(key,value);};
  assert.equal(saveIntakeDraft('org','site',{fields:{title:'À conserver'},photos:['data:image/jpeg;base64,/9j/2Q==']},storage),false);
  assert.equal(readIntakeDraft('org','site',storage).fields.title,'À conserver');assert.deepEqual(readIntakeDraft('org','site',storage).photos,[]);
});
