import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validProductCode,productCodes,mergePhotoCodes} from '../public/product-codes.js';
test('codes produit : contrôle des chiffres EAN et ISBN, sans convertir un numéro de série ou un lien',()=>{
 assert.equal(validProductCode('978-2-01-021275-8'),'9782010212758');assert.equal(validProductCode('4006381333931'),'4006381333931');
 for(const invalid of ['9782010212759','0000000000000','SN123456','https://example.org/9782010212758',123456789])assert.equal(validProductCode(invalid),'');
 assert.deepEqual(productCodes(['4006381333931','4006381333931','invalide']),['4006381333931']);
});
test('un code décodé dans la photo complète le champ vide ; deux codes imposent un choix',()=>{
 const candidate={title:'Produit',barcode:'',field_status:{barcode:'unknown'}};
 const result=mergePhotoCodes({candidates:[candidate]},['4006381333931']);assert.equal(result.candidates[0].barcode,'4006381333931');assert.equal(result.candidates[0].field_status.barcode,'observed');
 const conflict=mergePhotoCodes({candidates:[{...candidate,barcode:'9782010212758'}]},['4006381333931']);assert.equal(conflict.candidates[0].barcode,'');assert.equal(conflict.candidates[0].barcode_candidates.length,2);
 assert.equal(mergePhotoCodes({candidates:[candidate]},['invalide']).candidates[0].barcode,'');
});
