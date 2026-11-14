(() => {
"use strict";
const drawer=document.getElementById("jx-inspector-drawer");
const toggle=document.getElementById("jx-toggle-inspector");
const model=document.querySelector(".local-chat-shell>.jx-model-rail");
const rail=document.querySelector(".local-chat-shell>.jx-control-rail");
if(!drawer||!toggle||!model||!rail)return;
// Move, never clone: preserve the existing controls, IDs, labels and live form state.
drawer.append(model,rail);
drawer.hidden=true;
drawer.classList.remove("is-open");
toggle.setAttribute("aria-expanded","false");
const setOpen=(open)=>{drawer.hidden=!open;drawer.classList.toggle("is-open",open);toggle.classList.toggle("is-active",open);toggle.setAttribute("aria-expanded",String(open));};
toggle.addEventListener("click",()=>setOpen(drawer.hidden));
window.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&!drawer.hidden){setOpen(false);toggle.focus();}});
})();
