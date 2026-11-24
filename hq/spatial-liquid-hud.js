/* Spatial Liquid HUD behavior. Reads existing UI telemetry; it does not invent backend state. */
(()=>{
 'use strict';
 const pill=document.querySelector('#jx-neural-pill');
 const dock=document.querySelector('#jx-control-dock');
 if(!pill||!dock)return;
 const sources=[
  ['network','#net-status'],
  ['records','#data-count'],
  ['runtime','#runtime-status'],
  ['gateway','#gateway-nav-state']
 ];
 const signals=new Map();
 for(const [key] of sources)signals.set(key,pill.querySelector('[data-signal="'+key+'"]'));
 function tone(key,value){
  const v=String(value||'').toUpperCase();
  if(key==='network')return v.includes('OFFLINE')?'red':v.includes('ONLINE')?'emerald':'amber';
  if(key==='records')return 'cyan';
  if(key==='runtime')return v.includes('SHELL ONLY')?'amber':v.includes('READY')?'emerald':'amber';
  if(key==='gateway')return v.includes('VERIFIED')?'emerald':v.includes('FAILED')?'red':'amber';
  return 'amber';
 }
 function sync(){
  for(const [key,selector] of sources){
   const source=document.querySelector(selector),target=signals.get(key);
   if(!target)continue;
   const value=source?.textContent?.trim()||'UNKNOWN';
   target.textContent=value;
   target.closest('.jx-neural-pill__signal')?.setAttribute('data-tone',tone(key,value));
  }
 }
 sync();
 const observers=[];
 for(const [,selector] of sources){
  const source=document.querySelector(selector);
  if(!source||typeof MutationObserver==='undefined')continue;
  const observer=new MutationObserver(sync);
  observer.observe(source,{childList:true,characterData:true,subtree:true});
  observers.push(observer);
 }
 // Undo is deliberately scoped to navigation history; it does not reverse data writes or external actions.
 const history=[];
 let activeView=document.querySelector('[data-view].active')?.dataset.view||'overview';
 const undo=dock.querySelector('[data-jx-undo]');
 const undoLabel=undo?.querySelector('[data-jx-undo-label]');
 function updateUndo(){
  if(undo)undo.disabled=history.length===0;
  if(undoLabel)undoLabel.textContent=history.length?'UNDO VIEW':'UNDO · NONE';
 }
 document.addEventListener('click',event=>{
  const control=event.target.closest('[data-view],[data-go]');
  if(!control)return;
  const next=control.dataset.view||control.dataset.go;
  if(!next||next===activeView)return;
  if(document.querySelector('#view-'+next)){
   history.push(activeView);
   if(history.length>30)history.shift();
   activeView=next;
   updateUndo();
  }
 },true);
 undo?.addEventListener('click',()=>{
  const previous=history.pop();
  if(!previous)return;
  activeView=previous;
  document.querySelector('[data-view="'+CSS.escape(previous)+'"]')?.click();
  updateUndo();
 });
 updateUndo();
 window.addEventListener('pagehide',()=>observers.forEach(observer=>observer.disconnect()),{once:true});
})();