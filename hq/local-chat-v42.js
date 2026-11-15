(() => {
"use strict";
const $=id=>document.getElementById(id);
const shell=document.querySelector("main.local-chat-shell");
const stage=document.querySelector(".jx-chat-stage");
const header=shell?.querySelector(":scope > .brand");
const transcript=$("transcript"),message=$("message"),send=$("send-message"),voice=$("voice-dictation");
if(!shell||!stage||!header||!transcript||!message||!send)return;
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const button=(cls,label,fn)=>{const b=make("button",cls,label);b.type="button";b.addEventListener("click",fn);return b};
const modal=(id,title)=>{const back=make("div","jx42-modal-backdrop");back.id=id;back.hidden=true;back.setAttribute("aria-hidden","true");const panel=make("section","jx42-modal");panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-label",title);const head=make("div","jx42-modal-head");const h=make("h2","",title);const close=button("jx42-modal-close","×",()=>closeModal(back));close.setAttribute("aria-label","Fermer");head.append(h,close);const body=make("div","jx42-modal-body");panel.append(head,body);back.append(panel);document.body.append(back);back.addEventListener("click",e=>{if(e.target===back)closeModal(back)});return{back,body,close,panel}};
const closeModal=back=>{back.hidden=true;back.setAttribute("aria-hidden","true");document.body.classList.remove("jx42-modal-open");};
const openModal=(m,trigger)=>{for(const x of [engineModal,memoryModal,upgradeModal,agentModal])closeModal(x.back);m.back.hidden=false;m.back.setAttribute("aria-hidden","false");document.body.classList.add("jx42-modal-open");m.close.focus();m.trigger=trigger||document.activeElement;};
const engineModal=modal("jx42-engine-modal","ENGINE & MODEL");
const memoryModal=modal("jx42-memory-modal","XMEMO · MEMORY VAULT");
const upgradeModal=modal("jx42-upgrade-modal","UPGRADE APPROVAL");
const agentModal=modal("jx42-agent-modal","CREATE CUSTOM AGENT");
const hud=make("div","jx42-hud-actions");
const enginePill=button("jx42-pill primary","◈ JARVIS-X · M1 / CLOUD",()=>openModal(engineModal,enginePill));
const memoryPill=button("jx42-pill","🧠 XMEMO",()=>openModal(memoryModal,memoryPill));
const upgradePill=button("jx42-pill","🧬 UPGRADES",()=>openModal(upgradeModal,upgradePill));
const count=make("span","jx42-count","0");count.setAttribute("aria-label","propositions en attente");upgradePill.append(count);hud.append(enginePill,memoryPill,upgradePill);header.append(hud);
const dock=make("section","jx42-dock");dock.setAttribute("aria-label","Command dock");
const agentStrip=make("div","jx42-agent-strip");agentStrip.setAttribute("aria-label","Agents disponibles");
const composer=make("div","jx42-composer");
const actions=message.parentElement?.querySelector(".actions");
composer.append(message);if(actions){composer.append(actions);const voiceStatus=$("voice-dictation-status");if(voiceStatus)composer.append(voiceStatus)}
dock.append(agentStrip,composer);shell.append(dock);
const drawer=$("jx-inspector-drawer");
const modelRail=shell.querySelector(".jx-model-rail")||drawer?.querySelector(".jx-model-rail");
const controlRail=shell.querySelector(".jx-control-rail")||drawer?.querySelector(".jx-control-rail");
if(modelRail)engineModal.body.append(modelRail);
if(controlRail){const provider=controlRail.querySelector(".jx-status-panel");const focus=controlRail.querySelector(".jx-focus-panel");const memory=controlRail.querySelector(".jx-memory-panel");if(provider)engineModal.body.append(provider);if(focus)engineModal.body.append(focus);if(memory)memoryModal.body.append(memory)}
const agentPanel=drawer?.querySelector('[aria-labelledby="jx-agent-heading"]');
const upgradePanel=drawer?.querySelector('[aria-labelledby="jx-upgrade-heading"]');
const vault=drawer?.querySelector(".jx-vault-list");
if(agentPanel){agentModal.body.append(agentPanel);agentPanel.classList.add("jx42-agent-create")}
if(upgradePanel)upgradeModal.body.append(upgradePanel);
if(vault)memoryModal.body.append(vault);
if(drawer){drawer.hidden=true;drawer.classList.remove("is-open")}
const status=make("p","jx42-statusline","Sélectionne un agent pour les prochains tours.");agentModal.body.prepend(status);
const agentSelect=$("jx-agent-select-chat")||$("jx-agent-select");
const refreshAgents=()=>{agentStrip.replaceChildren();const opts=agentSelect?[...agentSelect.options]:[];for(const opt of opts){const b=button("jx42-agent",opt.textContent,()=>{if(agentSelect){agentSelect.value=opt.value;agentSelect.dispatchEvent(new Event("change",{bubbles:true}))}refreshAgents();});b.dataset.agent=opt.value;b.setAttribute("aria-pressed",String(agentSelect?.value===opt.value));agentStrip.append(b)}const create=button("jx42-agent create","+ Créer Agent",()=>openModal(agentModal,create));agentStrip.append(create)};
refreshAgents();
const selectObserver=agentSelect?new MutationObserver(refreshAgents):null;if(selectObserver)selectObserver.observe(agentSelect,{childList:true,subtree:true});
const agentForm=$("jx-agent-form");if(agentForm)agentForm.addEventListener("submit",()=>window.setTimeout(refreshAgents,0));
const upgradeBox=$("jx-upgrade-proposals");
const refreshCount=()=>{const pending=upgradeBox?[...upgradeBox.querySelectorAll(".jx-upgrade-card")].filter(c=>/PENDING/.test(c.textContent)).length:0;count.textContent=String(pending);count.hidden=pending===0;upgradePill.setAttribute("aria-label",pending+" propositions en attente");};
if(upgradeBox)new MutationObserver(refreshCount).observe(upgradeBox,{childList:true,subtree:true,characterData:true});
const upgradeForm=$("jx-upgrade-form");if(upgradeForm)upgradeForm.addEventListener("submit",()=>window.setTimeout(refreshCount,0));refreshCount();
const statusNode=$("jx-xmemo-sync-status");if(statusNode){const sync=()=>{memoryPill.dataset.state=statusNode.textContent||"local";};new MutationObserver(sync).observe(statusNode,{childList:true,subtree:true,characterData:true});sync()}
for(const b of [enginePill,memoryPill,upgradePill])b.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();b.click()}});
window.addEventListener("keydown",e=>{if(e.key==="Escape"){for(const m of [engineModal,memoryModal,upgradeModal,agentModal])if(!m.back.hidden){closeModal(m.back);m.trigger?.focus?.();break}}});
const firstControl=modelRail?.querySelector("#load-model");if(firstControl)firstControl.setAttribute("aria-label","Load selected model");
const xmemoConsent=$("local-memory-consent");if(xmemoConsent){const label=xmemoConsent.closest("label");if(label)label.classList.add("jx42-memory-consent")}
const focus=$("jx-local-focus-toggle");if(focus)focus.addEventListener("click",()=>{const on=focus.getAttribute("aria-pressed")==="true";focus.setAttribute("aria-pressed",String(!on));focus.textContent=on?"ENTER LOCKED-IN MODE":"EXIT LOCKED-IN MODE"});
if(voice)voice.setAttribute("aria-label","Voice dictation");
const syncDisabled=()=>{if(message.disabled)send.disabled=true;};new MutationObserver(syncDisabled).observe(message,{attributes:true,attributeFilter:["disabled"]});
const oldClear=$("clear-chat");if(oldClear){const clear=button("jx42-pill","CLEAR",()=>oldClear.click());clear.hidden=true}
refreshAgents();refreshCount();
})();