/* Cinematic HQ arrival. Session-scoped, skippable, reduced-motion aware; no telemetry or network. */
(() => {
  const overlay=document.querySelector("#jx-arrival");
  if(!overlay||overlay.dataset.ready==="true")return;
  overlay.dataset.ready="true";
  const enter=document.querySelector("#jx-arrival-enter");
  const skip=document.querySelector("#jx-arrival-skip");
  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let autoDismissTimer=0;
  const dismiss=()=>{
    if(autoDismissTimer)window.clearTimeout(autoDismissTimer);
    if(overlay.classList.contains("is-exiting"))return;
    overlay.classList.add("is-exiting");
    overlay.setAttribute("aria-hidden","true");
    overlay.setAttribute("inert","");
    try{sessionStorage.setItem("jx-hq-arrival-seen","1")}catch{}
    window.setTimeout(()=>{overlay.remove();document.querySelector('#page-title')?.focus({preventScroll:true});},reduced?0:900);
  };
  let seen=false;
  try{seen=sessionStorage.getItem("jx-hq-arrival-seen")==="1"}catch{}
  if(seen){overlay.remove();return}
  enter?.addEventListener("click",dismiss);
  skip?.addEventListener("click",dismiss);
  overlay.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();dismiss()}
    if(event.key==="Tab"){
      const controls=[enter,skip].filter(x=>x&&!x.disabled);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
  });
  if(reduced){overlay.classList.add("reduced-motion")}
  requestAnimationFrame(()=>enter?.focus({preventScroll:true}));
  // Arrival is decorative: never block the live cockpit waiting for a click.
  autoDismissTimer=window.setTimeout(dismiss,1200);
})();
