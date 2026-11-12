(()=>{'use strict';
const KEY='jarvis_x_v31_panel_geometry';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
const write=v=>{try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function attach(panel){
 if(panel.dataset.jx31Ready)return;panel.dataset.jx31Ready='1';panel.classList.add('jx-v31-positioned');
 const type=panel.dataset.type||'panel',all=read(),saved=all[type]||{};
 const rect=panel.getBoundingClientRect(),w=saved.width||Math.min(rect.width||340,innerWidth*.92),h=saved.height||rect.height||260;
 const left=saved.left??clamp(rect.left,8,Math.max(8,innerWidth-w-8)),top=saved.top??clamp(rect.top,72,Math.max(72,innerHeight-h-90));
 const set=(x,y,width,height)=>{panel.style.setProperty('--jx31-left',x+'px');panel.style.setProperty('--jx31-top',y+'px');panel.style.setProperty('--jx31-width',width+'px');panel.style.setProperty('--jx31-height',height+'px')};
 let g={left,top,width:w,height:h};set(g.left,g.top,g.width,g.height);
 const handle=panel.querySelector('.v29-handle');if(handle){handle.textContent='✥ MOVE';handle.setAttribute('aria-label','Move '+type+' panel');}
 const resize=document.createElement('button');resize.type='button';resize.className='jx-v31-resize';resize.textContent='↘';resize.setAttribute('aria-label','Resize '+type+' panel');panel.append(resize);
 let action=null,start=null,initial=null;
 const begin=(kind,e)=>{e.preventDefault();e.stopPropagation();action=kind;start={x:e.clientX,y:e.clientY};initial={...g};(kind==='move'?handle:resize)?.setPointerCapture?.(e.pointerId);panel.classList.add('jx-v31-dragging')};
 handle?.addEventListener('pointerdown',e=>begin('move',e));
 resize.addEventListener('pointerdown',e=>begin('resize',e));
 panel.addEventListener('pointermove',e=>{if(!action)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(action==='move'){g.left=clamp(initial.left+dx,0,innerWidth-90);g.top=clamp(initial.top+dy,0,innerHeight-80)}else{g.width=clamp(initial.width+dx,240,innerWidth-g.left-8);g.height=clamp(initial.height+dy,150,innerHeight-g.top-90)}set(g.left,g.top,g.width,g.height)});
 const end=e=>{if(!action)return;action=null;panel.classList.remove('jx-v31-dragging');const state=read();state[type]={...g};write(state);try{(e.target).releasePointerCapture(e.pointerId)}catch{}};
 panel.addEventListener('pointerup',end);panel.addEventListener('pointercancel',end);
}
const host=document.querySelector('#v29-panels');if(!host)return;
host.querySelectorAll('.v29-panel').forEach(attach);
new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.matches?.('.v29-panel'))attach(n);n.querySelectorAll?.('.v29-panel').forEach(attach)}}))).observe(host,{childList:true});
document.querySelectorAll('.dock [data-v29-add]').forEach(b=>{b.addEventListener('click',()=>{const modal=document.querySelector('#v29-launcher');if(modal?.classList.contains('open'))return;});});
window.JXObservatoryV31={version:31,storageKey:KEY};
})();