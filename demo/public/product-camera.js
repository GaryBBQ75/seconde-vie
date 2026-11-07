// Keep the camera open for successive shots; no analysis starts from this module.
export async function openProductCamera({photos,esc,encodePhoto,onOpen=()=>{},onClose=()=>{},onChange=()=>{},onError=()=>{}}) {
  if(!navigator.mediaDevices?.getUserMedia)return onError('La caméra directe n’est pas disponible ici. Utilisez Importer ou la caméra du téléphone dans Autres options.');
  const panel=document.createElement('dialog');
  panel.className='product-camera';
  panel.setAttribute('aria-labelledby','product-camera-title');
  panel.innerHTML=`<header><div><span class="eyebrow">Photos du produit</span><h2 id="product-camera-title">Photographiez à la suite</h2></div><button type="button" class="btn" data-close aria-label="Fermer la caméra">×</button></header><div class="product-camera-view"><video autoplay playsinline muted></video><p data-camera-start role="status">Ouverture de la caméra…</p></div><p data-camera-status role="status">Une vue d’ensemble, puis l’étiquette et les détails.</p><ol class="assist-photo-list" data-camera-photos></ol><footer><button type="button" class="btn primary" data-shutter disabled>Prendre la photo</button><button type="button" class="btn" data-done>Terminer</button></footer>`;
  let stream,closed=false,busy=false,captureError='';
  const video=panel.querySelector('video'),shutter=panel.querySelector('[data-shutter]'),status=panel.querySelector('[data-camera-status]');
  function close(){if(closed)return;closed=true;stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;panel.close?.();panel.remove();window.removeEventListener('pagehide',close);onChange();onClose();}
  function draw(){panel.querySelector('[data-camera-photos]').innerHTML=photos.map((src,index)=>`<li><img src="${esc(src)}" alt="Vue ${index+1}"><span>${index+1}</span><button type="button" data-remove="${index}" aria-label="Supprimer la photo ${index+1}">×</button></li>`).join('');status.textContent=captureError||`${photos.length} / 6 photos${photos.length>=6?' · Série complète. Terminez ou supprimez une vue.':' · Vous pouvez prendre la suivante.'}`;panel.querySelector('[data-done]').disabled=busy;shutter.disabled=busy||photos.length>=6||!stream||video.readyState<2;}
  onOpen(close);document.body.append(panel);panel.showModal();window.addEventListener('pagehide',close);
  panel.querySelector('[data-close]').addEventListener('click',close);panel.querySelector('[data-done]').addEventListener('click',close);panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  panel.querySelector('[data-camera-photos]').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button||busy)return;photos.splice(Number(button.dataset.remove),1);draw();onChange();});
  shutter.addEventListener('click',async()=>{
    if(closed||busy||photos.length>=6||video.readyState<2)return;
    busy=true;captureError='';draw();status.textContent='Enregistrement de la photo…';
    try {
      const canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(!blob)throw new Error('La photo n’a pas pu être prise. Réessayez.');
      const photo=await encodePhoto(blob);if(closed)return;photos.push(photo);onChange();
    }catch(error){if(!closed)captureError=error.message;}
    finally{busy=false;if(!closed)draw();}
  });
  draw();
  try {
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false});
    if(closed){stream.getTracks().forEach(track=>track.stop());return;}
    video.srcObject=stream;await video.play();if(closed)return;
    panel.querySelector('[data-camera-start]').hidden=true;draw();video.addEventListener('loadeddata',draw,{once:true});
  }catch(error){if(!closed){close();onError(error.name==='NotAllowedError'?'Autorisez la caméra pour prendre plusieurs photos à la suite. Vous pouvez aussi importer vos images.':'La caméra ne peut pas être ouverte. Utilisez Importer ou la caméra du téléphone dans Autres options.');}}
}
