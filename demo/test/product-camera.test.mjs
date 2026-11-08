import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openProductCamera,captureGeometry} from '../public/product-camera.js';

// Small DOM harness exercises the camera lifecycle without a physical camera.
function cameraDOM(){
 class Element {
  constructor(){this.style={};this.events={};this.disabled=false;this.hidden=false;this.readyState=2;this.videoWidth=1200;this.videoHeight=900;this.children=new Map();}
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  setAttribute(key,value){this.attributes??={};this.attributes[key]=value;} querySelectorAll(key){return key==='[data-zoom]'?[1,2,3].map(value=>{const item=this.querySelector('zoom-'+value);item.dataset={zoom:String(value)};return item;}):[];} addEventListener(key,fn){this.events[key]=fn;} removeEventListener(){} showModal(){this.open=true;} close(){this.open=false;} remove(){this.removed=true;}
  async play(){} async click(){await this.events.click?.({target:this});}
 }
 const draws=[];const panel=new Element(),track={stops:0,stop(){this.stops++;}},stream={getTracks:()=>[track]};
 return {panel,track,stream,draws,document:{body:{append(){}},createElement:type=>type==='dialog'?panel:{getContext:()=>({drawImage(...args){draws.push(args);}}),toBlob:fn=>fn(new Blob(['image'],{type:'image/jpeg'}))}},window:new Element()};
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

test('caméra : le zoom numérique est inclus dans le cadrage de la photo',async()=>withCamera(async({panel,draws})=>{
 const geometry=captureGeometry(1920,1440,2);assert.deepEqual(geometry,{sx:480,sy:360,sw:960,sh:720,width:960,height:720});
 await openProductCamera({photos:[],esc:String,encodePhoto:async()=> 'photo'});const slider=panel.querySelector('[data-camera-zoom]');slider.value='2';await slider.events.input();assert.equal(panel.querySelector('video').style.transform,'scale(2)');await panel.querySelector('[data-shutter]').click();
 assert.deepEqual(draws.at(-1).slice(1,5),[300,225,600,450]);await panel.querySelector('[data-done]').click();
}));
test('caméra : zoom matériel, éclairage, puis changement d’objectif et libération des pistes',async()=>withCamera(async({panel,track})=>{
 const constraints=[],settings={zoom:1,facingMode:'environment'};track.getCapabilities=()=>({zoom:{min:1,max:4},torch:true,focusMode:['continuous']});track.getSettings=()=>settings;track.applyConstraints=async value=>{constraints.push(value);Object.assign(settings,value.advanced[0]);};
 let second;Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async options=>{if((options.video.facingMode?.ideal||options.video.facingMode?.exact)==='user'){second={stops:0,stop(){this.stops++;},getSettings:()=>({facingMode:'user'})};return {getTracks:()=>[second]};}return {getTracks:()=>[track]};},enumerateDevices:async()=>[{kind:'videoinput',deviceId:'back-id',label:'Arrière'},{kind:'videoinput',deviceId:'front-id',label:'Avant'}]}},configurable:true});
 await openProductCamera({photos:[],esc:String,encodePhoto:async()=>''});await panel.querySelector('zoom-2').click();assert.equal(settings.zoom,2);await panel.querySelector('[data-camera-torch]').click();assert.equal(settings.torch,true);await panel.querySelector('[data-camera-flip]').click();assert.equal(track.stops,1);assert(second);await panel.querySelector('[data-close]').click();assert.equal(second.stops,1);
}));
test('caméra : les changements de zoom rapides s’appliquent dans l’ordre et la capture attend le réglage',async()=>withCamera(async({panel,track})=>{
 const pending=[],settings={zoom:1};track.getCapabilities=()=>({zoom:{min:1,max:4}});track.getSettings=()=>settings;track.applyConstraints=options=>new Promise(resolve=>pending.push(()=>{settings.zoom=options.advanced[0].zoom;resolve();}));
 await openProductCamera({photos:[],esc:String,encodePhoto:async()=> 'photo'});const slider=panel.querySelector('[data-camera-zoom]');slider.value='2';const first=slider.events.input();await new Promise(done=>setImmediate(done));assert.equal(panel.querySelector('[data-shutter]').disabled,true);slider.value='3';const last=slider.events.input();assert.equal(pending.length,1);pending.shift()();await first;await new Promise(done=>setImmediate(done));assert.equal(pending.length,1);pending.shift()();await last;assert.equal(settings.zoom,3);assert.equal(panel.querySelector('[data-shutter]').disabled,false);await panel.querySelector('[data-close]').click();
}));
