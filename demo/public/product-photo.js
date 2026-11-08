export const productPhotoLimits={longEdge:1280,targetBytes:160000,maxBytes:270000,maxInputBytes:20*1024*1024,minQuality:.66};
export function photoDimensions(width,height,side=productPhotoLimits.longEdge){if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Dimensions de photo invalides.');const factor=Math.min(1,side/Math.max(width,height));return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};}
export function photoBytes(value){return typeof value==='string'&&value.startsWith('data:image/jpeg;base64,')?Math.floor((value.length-value.indexOf(',')-1)*3/4):0;}
export async function compressProductPhoto(file,{document=globalThis.document,Image=globalThis.Image,URL=globalThis.URL,FileReader=globalThis.FileReader}={}){
 if(!file||file.size>productPhotoLimits.maxInputBytes)throw new Error('Choisissez une photo de moins de 20 Mo.');
 if(file.type&&!/^image\//.test(file.type))throw new Error('Choisissez un fichier photo JPEG, PNG ou WebP.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Cette photo ne peut pas être lue. Exportez-la en JPEG ou PNG.'));image.src=url;});
  if(image.naturalWidth*image.naturalHeight>48000000)throw new Error('Cette image dépasse 48 mégapixels. Réduisez-la avant de l’importer.');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('La photo ne peut pas être préparée sur cet appareil.');let fallback;
  for(const side of [1280,1088,925,800]){
   Object.assign(canvas,photoDimensions(image.naturalWidth,image.naturalHeight,side));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.74,.66]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw new Error('La photo ne peut pas être compressée. Essayez une autre image.');
    if(blob.size<=productPhotoLimits.maxBytes&&!fallback)fallback=blob;
    if(blob.size<=productPhotoLimits.targetBytes){fallback=blob;break;}
   }
   if(fallback?.size<=productPhotoLimits.targetBytes)break;
  }
  if(!fallback)throw new Error('Cette photo reste trop lourde. Recadrez l’objet ou choisissez une autre image.');
  return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('La photo n’a pas pu être préparée.'));reader.readAsDataURL(fallback);});
 }finally{URL.revokeObjectURL(url);}
}
