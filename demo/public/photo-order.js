export function movePhoto(photos,from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=photos.length||to>=photos.length||from===to)return false;photos.splice(to,0,photos.splice(from,1)[0]);return true;}
export function bindPhotoOrder(list,{photos,changed=()=>{},busy=()=>false,announce=()=>{}}){
 let dragging=null,pointer=null;
 const tile=target=>target?.closest?.('[data-photo-index]');
 function clear(){list.querySelectorAll('[data-photo-index]').forEach(node=>node.classList.remove('photo-dragging','photo-drop-target'));}
 function finish(from,to){clear();if(!busy()&&movePhoto(photos,from,to)){changed();announce(`Photo déplacée en position ${to+1}${to===0?' · photo principale':''}.`);}}
 list.addEventListener('dragstart',event=>{const item=tile(event.target);if(!item||busy()){event.preventDefault();return;}dragging=Number(item.dataset.photoIndex);event.dataTransfer.setData('text/plain',String(dragging));event.dataTransfer.effectAllowed='move';item.classList.add('photo-dragging');});
 list.addEventListener('dragover',event=>{if(dragging===null||busy())return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';clear();tile(event.target)?.classList.add('photo-drop-target');});
 list.addEventListener('drop',event=>{if(dragging===null)return;event.preventDefault();event.stopPropagation();const target=tile(event.target),from=dragging;dragging=null;if(target&&list.contains(target))finish(from,Number(target.dataset.photoIndex));else clear();});
 list.addEventListener('dragend',()=>{dragging=null;clear();});
 list.addEventListener('keydown',event=>{const handle=event.target.closest?.('[data-photo-drag]'),item=tile(handle);if(!item||busy()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const from=Number(item.dataset.photoIndex),to=from+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);finish(from,to);list.querySelector(`[data-photo-index="${Math.max(0,Math.min(photos.length-1,to))}"] [data-photo-drag]`)?.focus();});
 list.addEventListener('pointerdown',event=>{const handle=event.target.closest?.('[data-photo-drag]'),item=tile(handle);if(!item||busy()||event.button>0)return;event.preventDefault();event.stopPropagation();pointer={id:event.pointerId,from:Number(item.dataset.photoIndex),to:Number(item.dataset.photoIndex),handle};handle.setPointerCapture?.(event.pointerId);item.classList.add('photo-dragging');});
 list.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;event.preventDefault();const target=tile(document.elementFromPoint(event.clientX,event.clientY));if(target&&list.contains(target)){pointer.to=Number(target.dataset.photoIndex);clear();target.classList.add('photo-drop-target');}});
 list.addEventListener('pointerup',event=>{if(!pointer||event.pointerId!==pointer.id)return;const current=pointer;pointer=null;current.handle.releasePointerCapture?.(event.pointerId);finish(current.from,current.to);});
 list.addEventListener('pointercancel',()=>{pointer=null;clear();});
}
