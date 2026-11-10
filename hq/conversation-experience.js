/* JARVIS-X Conversation Nexus progressive enhancement. No network, model calls or simulated streaming. */
(() => {
  const view=document.querySelector("#view-chat");
  if(!view||view.dataset.nexusReady==="true")return;
  view.dataset.nexusReady="true";
  const input=document.querySelector("#chat-compose");
  const counter=document.querySelector("#chat-draft-count");
  const size=document.querySelector("#jx-chat-draft-size");
  const state=document.querySelector("#jx-draft-state");
  const orb=document.querySelector("#jx-chat-presence");
  const detail=document.querySelector("#jx-chat-presence-detail");
  const thread=document.querySelector("#chat-thread");
  const send=document.querySelector("#chat-send");
  const update=()=>{
    const n=input?.value.length||0;
    if(counter)counter.textContent=n.toLocaleString()+" / 12000";
    if(size)size.textContent=n.toLocaleString()+" chars";
    const composing=n>0;
    view.dataset.chatState=composing?"composing":"idle";
    if(state)state.textContent=composing?"INPUT CHANNEL · COMPOSING":"INPUT CHANNEL · IDLE";
    if(orb)orb.textContent=composing?"READY FOR TRANSMISSION":"STANDING BY";
    if(detail)detail.textContent=composing?"Draft remains local until you transmit":"Interface ready · runtime not presumed";
  };
  input?.addEventListener("input",update);
  input?.addEventListener("focus",()=>{view.dataset.chatState=input.value?"composing":"idle";});
  document.querySelectorAll("[data-chat-prompt]").forEach(button=>button.addEventListener("click",()=>{
    if(!input)return;
    const prefix=button.dataset.chatPrompt||"";
    input.value=prefix;
    input.focus();
    update();
    input.setSelectionRange(input.value.length,input.value.length);
  }));
  const refreshCount=()=>{
    const count=thread?.querySelectorAll(".log").length||0;
    const target=document.querySelector("#jx-chat-message-count");
    if(target)target.textContent=String(count);
  };
  if(thread&&typeof MutationObserver!=="undefined"){
    new MutationObserver(refreshCount).observe(thread,{childList:true,subtree:true});
  }
  document.querySelector("#chat-check-gateway")?.addEventListener("click",()=>{
    view.dataset.chatState="checking";
    if(orb)orb.textContent="VERIFYING CONNECTION";
    if(detail)detail.textContent="Checking authenticated gateway health";
    if(send)send.disabled=true;
    const status=document.querySelector("#chat-gateway-status");
    const observer=new MutationObserver(()=>{
      if(status&&/verified|failed|unavailable|not connected|timed out/i.test(status.textContent)){
        view.dataset.chatState=input?.value?"composing":"idle";
        if(orb)orb.textContent="STANDING BY";
        if(detail)detail.textContent="Gateway result is shown below the composer";
        observer.disconnect();
      }
    });
    if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});
    window.setTimeout(()=>{observer.disconnect();view.dataset.chatState=input?.value?"composing":"idle";if(orb)orb.textContent="STANDING BY";},9000);
  });
  const search=document.querySelector("#jx-transcript-search");
  const results=document.querySelector("#jx-transcript-results");
  const applySearch=()=>{
    const query=(search?.value||"").trim().toLocaleLowerCase();
    const messages=[...(thread?.querySelectorAll(".log")||[])];
    let visible=0;
    for(const message of messages){
      const match=!query||message.textContent.toLocaleLowerCase().includes(query);
      message.hidden=!match;
      if(match)visible++;
    }
    if(results)results.textContent=query?visible+" / "+messages.length+" messages match":"All "+messages.length+" messages visible";
  };
  search?.addEventListener("input",applySearch);
  search?.addEventListener("keydown",event=>{if(event.key==="Escape"&&search.value){search.value="";applySearch();}});
  document.addEventListener("keydown",event=>{
    if(event.key==="/"&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){event.preventDefault();search?.focus();}
  });
  if(thread&&typeof MutationObserver!=="undefined")new MutationObserver(applySearch).observe(thread,{childList:true,subtree:true});
  document.querySelector("#jx-transcript-copy")?.addEventListener("click",async()=>{
    const lines=[...(thread?.querySelectorAll(".log:not([hidden])")||[])].map(node=>node.innerText.trim()).filter(Boolean);
    const payload=lines.join("\n\n");
    const status=document.querySelector("#chat-gateway-status");
    if(!payload){if(status)status.textContent="No visible messages to copy.";return;}
    try{if(!navigator.clipboard?.writeText)throw new Error("Clipboard API unavailable");await navigator.clipboard.writeText(payload);if(status)status.textContent="Visible transcript copied to clipboard.";}catch{if(status)status.textContent="Clipboard access unavailable in this browser context. Select the messages and copy manually.";}
  });
  document.querySelector("#jx-chat-focus")?.addEventListener("click",event=>{
    const button=event.currentTarget;
    const active=view.dataset.focusMode!=="true";
    view.dataset.focusMode=String(active);
    button.setAttribute("aria-pressed",String(active));
    button.textContent=active?"EXIT FOCUS":"FOCUS MODE";
  });
  update();
  refreshCount();
  applySearch();
})();
