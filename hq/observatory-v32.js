(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const safeRead=(key,fallback)=>{try{const value=localStorage.getItem(key);return value===null?fallback:JSON.parse(value)}catch{return fallback}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
const host=$('#v29-panels'),dock=$('.dock'),boot=$('#ignition');
if(!host||!dock)return;
document.documentElement.dataset.jxVersion='32';
/* Full-screen, skippable three-act cinema. Existing v31 entry points remain intact. */
if(boot){
 boot.id='jx-cinema-boot';boot.classList.add('jx-v32-cinema');
 const collapse=document.createElement('i'),burst=document.createElement('i'),lock=document.createElement('i');
 collapse.className='jx-v32-collapse';burst.className='jx-v32-supernova';lock.className='jx-v32-lock';
 [collapse,burst,lock].forEach(n=>{n.setAttribute('aria-hidden','true');boot.prepend(n)});
 let skipped=false;
 const skip=()=>{if(skipped)return;skipped=true;boot.classList.add('done');boot.classList.remove('jx-v32-act-1','jx-v32-act-2','jx-v32-act-3')};
 boot.addEventListener('pointerdown',e=>{if(e.target.closest('#skip-boot'))return;skip()},{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')skip()});
 $('#skip-boot')?.addEventListener('click',skip);
 if(!reduced){boot.classList.add('jx-v32-act-1');window.setTimeout(()=>{if(!skipped){boot.classList.remove('jx-v32-act-1');boot.classList.add('jx-v32-act-2')}},600);window.setTimeout(()=>{if(!skipped){boot.classList.remove('jx-v32-act-2');boot.classList.add('jx-v32-act-3')}},1200);window.setTimeout(skip,2050)}else skip();
}
/* One canvas prism and one set of three canvas rings: retire the legacy DOM duplicates. */
$('.astrolabe>.crystal')?.setAttribute('aria-hidden','true');
$$('.astrolabe>.orbit').forEach(node=>node.setAttribute('aria-hidden','true'));
/* Two persistent HUD panels are deliberately local profiles, not claims of connected agents. */
function makePanel(type,side,title,kicker){
 let panel=host.querySelector('[data-type="'+type+'"]');if(panel)return panel;
 panel=document.createElement('article');panel.className='v29-panel jx-v32-side '+side;panel.dataset.type=type;
 const head=document.createElement('header'),grip=document.createElement('button'),name=document.createElement('strong');
 grip.type='button';grip.className='v29-handle';grip.textContent='✥ MOVE';name.textContent=title;
 head.append(grip,name);panel.append(head);
 const label=document.createElement('p');label.className='jx-v32-kicker';label.textContent=kicker;panel.append(label);
 const content=document.createElement('div');content.className='jx-v32-panel-content';panel.append(content);
 host.append(panel);return panel;
}
const left=makePanel('v32-neural','jx-v32-left','01 // NEURAL & AGENTS MATRIX','LOCAL REGISTRY · NOT A LIVE AGENT CONNECTION');
const leftContent=left.querySelector('.jx-v32-panel-content');
function renderAgents(){
 if(!leftContent)return;leftContent.replaceChildren();
 const agents=safeRead('jarvis_x_custom_agents',[]);
 if(!Array.isArray(agents)||!agents.length){const p=document.createElement('p');p.textContent='No local agent profiles yet. Create a profile from AGENTS IA.';leftContent.append(p);return}
 agents.slice(0,8).forEach((agent,index)=>{const row=document.createElement('div');row.className='jx-v32-agent-row';const name=document.createElement('strong'),meta=document.createElement('small');name.textContent=String(agent?.name||'Agent '+(index+1));meta.textContent=String(agent?.domain||'GENERAL')+' · LOCAL PROFILE';row.append(name,meta);leftContent.append(row)});
}
renderAgents();
const right=makePanel('v32-command','jx-v32-right','02 // COMMAND & QUICK CHAT','LOCAL DRAFT · SEND IN LOCAL CHAT');
const rightContent=right.querySelector('.jx-v32-panel-content');
const quick=document.createElement('textarea');quick.rows=3;quick.maxLength=1200;quick.placeholder='Write a quick command or note…';quick.setAttribute('aria-label','Quick chat draft');
const quickActions=document.createElement('div');quickActions.className='jx-v32-actions';
const save=document.createElement('button');save.type='button';save.textContent='SAVE LOCAL DRAFT';
const openChat=document.createElement('a');openChat.href='./local-chat.html';openChat.textContent='OPEN CHAT IA ↗';
save.addEventListener('click',()=>{const value=quick.value.trim();if(!value)return;const items=safeRead('jarvis_x_v32_quick_drafts',[]);safeWrite('jarvis_x_v32_quick_drafts',[{text:value,at:Date.now()},...(Array.isArray(items)?items:[])].slice(0,20));quick.value='';status.textContent='Draft saved on this device.'});
const status=document.createElement('p');status.className='jx-v32-status';status.setAttribute('role','status');status.textContent='Ready · no message sent';
quickActions.append(save,openChat);rightContent.append(quick,quickActions,status);
/* Focus timer: explicit 25/50 minute session; completion stops at zero. */
const timer=document.createElement('section');timer.className='jx-v32-timer';
const timerTitle=document.createElement('strong');timerTitle.textContent='DEEP WORK SESSION';
const readout=document.createElement('output');readout.className='jx-v32-clock';readout.textContent='25:00';readout.setAttribute('aria-live','off');
const timerControls=document.createElement('div');timerControls.className='jx-v32-actions';
const start=document.createElement('button'),short=document.createElement('button'),long=document.createElement('button'),stop=document.createElement('button');
start.type=short.type=long.type=stop.type='button';start.textContent='START';short.textContent='25 MIN';long.textContent='50 MIN';stop.textContent='STOP';
timerControls.append(short,long,start,stop);timer.append(timerTitle,readout,timerControls);rightContent.append(timer);
let remaining=1500,interval=0;
const display=()=>{readout.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0')};
const halt=message=>{if(interval)window.clearInterval(interval);interval=0;start.disabled=false;if(message)status.textContent=message;display()};
short.addEventListener('click',()=>{halt('25-minute session selected.');remaining=1500;display()});
long.addEventListener('click',()=>{halt('50-minute session selected.');remaining=3000;display()});
start.addEventListener('click',()=>{if(interval||remaining<=0)return;start.disabled=true;status.textContent='Focus session running.';interval=window.setInterval(()=>{remaining=Math.max(0,remaining-1);display();if(remaining===0)halt('Session complete · timer stopped at 00:00.')},1000)});
stop.addEventListener('click',()=>halt('Session stopped.'));
display();window.addEventListener('pagehide',()=>halt(''));
/* Dock: retain existing forge buttons and add reliable touch targets for all requested destinations. */
const entries=[
 ['FOOT PRO','foot-pro'],['RESET HUD','reset']
];
entries.forEach(([label,key])=>{if(dock.querySelector('[data-jx-v32="'+key+'"]'))return;const b=document.createElement(key==='foot-pro'?'a':'button');if(key==='foot-pro'){b.href='../apex-career-os/index.html';b.setAttribute('aria-label','Open APEX CAREER OS / SAMPA.CO')}else b.type='button';b.dataset.jxV32=key;b.textContent=label;dock.append(b)});
dock.querySelectorAll('[data-v29-add="agents"]').forEach(b=>{b.textContent='AGENTS IA'});
dock.querySelectorAll('[data-v29-add="briefs"]').forEach(b=>{b.textContent='OBJECTIFS'});
dock.querySelectorAll('[data-v29-add="vault"]').forEach(b=>{b.textContent='MÉMOIRE'});
dock.querySelectorAll('[data-v29-add="recovery"]').forEach(b=>{b.textContent='RECOVERY'});
dock.querySelectorAll('[data-v29-add="telemetry"]').forEach(b=>{b.textContent='SYSTÈME'});
dock.querySelectorAll('a[href="./local-chat.html"]').forEach(a=>{a.textContent='CHAT IA'});
function showInfo(title,bodyText){
 let overlay=$('#jx-v32-info');if(!overlay){overlay=document.createElement('section');overlay.id='jx-v32-info';overlay.className='jx-v32-info';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','jx-v32-info-title');const card=document.createElement('div');card.className='jx-v32-info-card';const h=document.createElement('h2');h.id='jx-v32-info-title';const p=document.createElement('p');const close=document.createElement('button');close.type='button';close.textContent='CLOSE';close.addEventListener('click',()=>overlay.classList.remove('open'));card.append(h,p,close);overlay.append(card);overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('open')});document.body.append(overlay);overlay._title=h;overlay._copy=p}
 overlay._title.textContent=title;overlay._copy.textContent=bodyText;overlay.classList.add('open');overlay.querySelector('button')?.focus();
}

dock.querySelector('[data-jx-v32="reset"]')?.addEventListener('click',()=>{try{localStorage.removeItem('jarvis_x_v31_panel_geometry');localStorage.removeItem('jarvis_x_v30_panel_sizes');localStorage.removeItem('jarvis_x_v29_positions')}catch{}showInfo('HUD GEOMETRY RESET','Saved panel positions and sizes were cleared. Reload the Observatory to restore the default layout.')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#jx-v32-info')?.classList.remove('open')});
/* Opt-in 40 Hz binaural pulse, only after a user gesture and only in Focus mode. */
let pulseContext=null,lastPulse=0;
function pulse40(){
 if(localStorage.getItem('jarvis_x_auto_audio')!=='true'||localStorage.getItem('jarvis_x_active_mode')!=='focus')return;
 const now=Date.now();if(now-lastPulse<180)return;lastPulse=now;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  if(!pulseContext)pulseContext=new Audio();
  if(pulseContext.state==='suspended')pulseContext.resume().catch(()=>{});
  if(pulseContext.state!=='running')return;
  [200,240].forEach(freq=>{const osc=pulseContext.createOscillator(),gain=pulseContext.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,pulseContext.currentTime);gain.gain.linearRampToValueAtTime(.018,pulseContext.currentTime+.025);gain.gain.setTargetAtTime(.0001,pulseContext.currentTime+.13,.025);osc.connect(gain);gain.connect(pulseContext.destination);osc.start();osc.stop(pulseContext.currentTime+.24);osc.addEventListener('ended',()=>{osc.disconnect();gain.disconnect()},{once:true})});
 }catch{}
}
document.addEventListener('pointerdown',pulse40,{passive:true});document.addEventListener('keydown',pulse40);
window.addEventListener('storage',e=>{if(e.key==='jarvis_x_custom_agents')renderAgents()});
window.JXObservatoryV32={version:32,panels:'local-only',timer:'25/50-minute'};
})();