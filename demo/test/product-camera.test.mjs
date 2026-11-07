import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openProductCamera} from '../public/product-camera.js';

// Small DOM harness exercises the camera lifecycle without a physical camera.
function cameraDOM(){
 class Element {
  constructor(){this.events={};this.disabled=false;this.hidden=false;this.readyState=2;this.videoWidth=1200;this.videoHeight=900;this.children=new Map();}
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  setAttribute(){} addEventListener(key,fn){this.events[key]=fn;} removeEventListener(){} showModal(){this.open=true;} close(){this.open=false;} remove(){this.removed=true;}
  async play(){} async click(){await this.events.click?.({target:this});}
 }
 const panel=new Element(),track={stops:0,stop(){this.stops++;}},stream={getTracks:()=>[track]};
 return {panel,track,stream,document:{body:{append(){}},createElement:type=>type==='dialog'?panel:{getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new Blob(['image'],{type:'image/jpeg'}))}},window:new Element()};
}
async function withCamera(run){
 const saved=Object.fromEntries(['navigator','document','window'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),dom=cameraDOM();
 try{for(const [key,value] of Object.entries({document:dom.document,window:dom.window,navigator:{mediaDevices:{getUserMedia:async()=>dom.stream}}}))Object.defineProperty(globalThis,key,{value,configurable:true});await run(dom);}finally{for(const [key,descriptor]of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
test('caméra : trois prises successives, suppression, remplacement et arrêt du flux à Terminer',async()=>withCamera(async({panel,track})=>{
 const photos=[];let changes=0;
 await openProductCamera({photos,esc:value=>value,encodePhoto:async()=>`photo-${changes}`,onChange:()=>changes++});
 const shutter=panel.querySelector('[data-shutter]');
 for(let i=0;i<3;i++)await shutter.click();
 assert.equal(photos.length,3);assert.equal(panel.open,true);assert.equal(track.stops,0);
 const list=panel.querySelector('[data-camera-photos]');list.events.click({target:{closest:()=>({dataset:{remove:'1'}})}});
 assert.equal(photos.length,2);await shutter.click();assert.equal(photos.length,3);
 for(let i=0;i<5;i++)await shutter.click();assert.equal(photos.length,6);assert.equal(shutter.disabled,true);
 await panel.querySelector('[data-done]').click();assert.equal(panel.removed,true);assert.equal(track.stops,1);
}));
test('caméra : fermeture pendant la demande d’accès, le flux tardif est immédiatement arrêté',async()=>withCamera(async({panel,track,stream})=>{
 let resolve;Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>new Promise(done=>resolve=done)}},configurable:true});
 const opening=openProductCamera({photos:[],esc:value=>value,encodePhoto:async()=>''});
 await panel.querySelector('[data-close]').click();resolve(stream);await opening;assert.equal(track.stops,1);assert.equal(panel.removed,true);
}));
test('caméra : erreur de capture visible et possibilité de reprendre une photo',async()=>withCamera(async({panel})=>{
 const photos=[];let first=true;await openProductCamera({photos,esc:value=>value,encodePhoto:async()=>{if(first){first=false;throw new Error('Photo à reprendre');}return 'image';}});
 await panel.querySelector('[data-shutter]').click();assert.equal(photos.length,0);assert.match(panel.querySelector('[data-camera-status]').textContent,/Photo à reprendre/);
 await panel.querySelector('[data-shutter]').click();assert.equal(photos.length,1);await panel.querySelector('[data-done]').click();
}));
