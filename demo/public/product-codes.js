import {catalogType,normalizeScanCode} from './catalog.js';
export function validProductCode(value){if(typeof value!=='string')return '';const code=normalizeScanCode(value);return catalogType(code)&&!/^(\d)\1+$/.test(code)?code:'';}
export function productCodes(values){return [...new Set((Array.isArray(values)?values:[]).map(validProductCode).filter(Boolean))].slice(0,6);}
export function mergePhotoCodes(identification,values){
 const codes=productCodes(values);
 return {...identification,detected_barcodes:codes,candidates:identification.candidates.map(candidate=>{
  const choices=productCodes([...codes,candidate.barcode]);
  if(choices.length===1)return {...candidate,barcode:choices[0],barcode_candidates:choices,field_status:{...candidate.field_status,barcode:'observed'}};
  if(choices.length>1)return {...candidate,barcode:'',barcode_candidates:choices,field_status:{...candidate.field_status,barcode:'unknown'},uncertainty:[candidate.uncertainty,'Plusieurs codes lisibles : choisissez celui du produit.'].filter(Boolean).join(' · ')};
  return candidate;
 })};
}
let software;
async function softwareReader(){
 if(globalThis.ZXingBrowser)return new globalThis.ZXingBrowser.BrowserMultiFormatReader();
 if(!software)software=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/zxing/zxing-browser.min.js';script.onload=resolve;script.onerror=()=>{software=null;reject(new Error('Lecteur indisponible'));};document.head.append(script);});
 await software;return new globalThis.ZXingBrowser.BrowserMultiFormatReader();
}
export async function readProductCodes(source){
 let url,owned=false,timer;
 try{
  url=typeof source==='string'?source:URL.createObjectURL(source);owned=typeof source!=='string';
  const read=async()=>{
   const picture=new Image();picture.src=url;await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=reject;if(picture.complete&&picture.naturalWidth)resolve();});
   if(globalThis.BarcodeDetector)try{const supported=await globalThis.BarcodeDetector.getSupportedFormats(),formats=['ean_13','ean_8','upc_a','upc_e','code_128'].filter(format=>supported.includes(format));if(formats.length){const found=productCodes((await new globalThis.BarcodeDetector({formats}).detect(picture)).map(row=>row.rawValue));if(found.length)return found;}}catch{}
   const reader=await softwareReader();
   const canvas=document.createElement('canvas'),ratio=Math.min(1,2400/Math.max(picture.naturalWidth,picture.naturalHeight));canvas.width=Math.round(picture.naturalWidth*ratio);canvas.height=Math.round(picture.naturalHeight*ratio);canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);
   try{return productCodes([reader.decodeFromCanvas(canvas).getText()]);}catch{return [];}
  };
  return await Promise.race([read(),new Promise(resolve=>{timer=setTimeout(()=>resolve([]),4500);})]);
 }catch{return [];}finally{clearTimeout(timer);if(owned)URL.revokeObjectURL(url);}
}
