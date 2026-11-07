export const shortcutKeys=(key,mac)=>key==='Enter'?(mac?'Meta+Enter':'Control+Enter'):key==='R'?(mac?'Meta+K':'Control+K'):(mac?'Control+Shift+':'Alt+')+key;
export const shortcutLabel=(key,mac)=>key==='Enter'?(mac?'⌘ + Entrée':'Ctrl + Entrée'):key==='R'?(mac?'⌘ + K':'Ctrl + K'):(mac?'Ctrl + Maj + ':'Alt + ')+key;
export function keyboardAction(event,{mac=false,page='' }={}){
 if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||event.getModifierState?.('AltGraph'))return '';
 const key=(event.key||'').toLowerCase(),command=mac?event.metaKey&&!event.ctrlKey:event.ctrlKey&&!event.metaKey;
 if(command&&!event.altKey&&!event.shiftKey){if(key==='k')return 'search';if(key==='enter'&&page==='accueil')return 'continue';}
 const legacy=mac?event.ctrlKey&&event.shiftKey&&!event.altKey&&!event.metaKey:event.altKey&&!event.ctrlKey&&!event.shiftKey&&!event.metaKey;
 if(!legacy)return '';
 if(key==='r')return 'search';
 return page==='caisse'?({a:'add',p:'payment'}[key]||''):'';
}
