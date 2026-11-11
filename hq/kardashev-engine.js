/* Optional local audio/visual effects. No network, no autoplay, no cognitive-performance claims. */
(()=>{'use strict';
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 let audio=null,focus=null,enabled=false,raf=0,canvas=null,ctx=null,w=0,h=0,dpr=1,nodes=[];
 const $=id=>document.getElementById(id);

 // Mirror only the local runtime's own status into the right-rail readout.
 const runtimeStatus=$('runtime-status'),liveStatus=$('jx-status-label');
 if(runtimeStatus&&liveStatus){
   const syncRuntimeStatus=()=>{liveStatus.textContent=runtimeStatus.textContent.trim()||'STATUS UNKNOWN'};
   syncRuntimeStatus();
   new MutationObserver(syncRuntimeStatus).observe(runtimeStatus,{childList:true,characterData:true,subtree:true});
 }

 const waveSelect=$('jx-focus-wave');
 const focusToggle=$('jx-local-focus-toggle');
 focusToggle?.addEventListener('click',()=>{const shell=document.querySelector('.local-chat-shell');if(!shell)return;const active=shell.classList.toggle('jx-global-focus');focusToggle.setAttribute('aria-pressed',String(active));focusToggle.textContent=active?'EXIT LOCKED-IN MODE':'ENTER LOCKED-IN MODE';syncFocus();});
 function audioContext(){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio is not supported in this browser.');if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}
 function tone(a=432,b=528,d=.075){if(!enabled)return;try{const c=audioContext();[a,b].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(i?.006:.009,c.currentTime+.012);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+d+.02)})}catch(e){const s=$('jx-audio-status');if(s)s.textContent=e.message}}
 function stopFocus(){if(!focus)return;const old=focus;focus=null;try{old.gain.gain.cancelScheduledValues(audio.currentTime);old.gain.gain.setTargetAtTime(.0001,audio.currentTime,.08);setTimeout(()=>{try{old.left.stop();old.right.stop()}catch{}},450)}catch{}}
 function startFocus(){stopFocus();if(!enabled||!document.body.classList.contains('jx-global-focus')&&!document.body.classList.contains('locked-in')&&!document.querySelector('.shell')?.classList.contains('jx-global-focus'))return;try{const c=audioContext(),base=216,beat=waveSelect?.value==='alpha'?10:40,left=c.createOscillator(),right=c.createOscillator(),merger=c.createChannelMerger(2),gain=c.createGain();left.type=right.type='sine';left.frequency.value=base;right.frequency.value=base+beat;gain.gain.value=.0001;left.connect(merger,0,0);right.connect(merger,0,1);merger.connect(gain).connect(c.destination);left.start();right.start();gain.gain.setTargetAtTime(.008,c.currentTime,.5);focus={left,right,gain}}catch(e){const s=$('jx-audio-status');if(s)s.textContent=e.message}}
 function syncFocus(){const active=document.body.classList.contains('locked-in')||document.querySelector('.shell')?.classList.contains('jx-global-focus');if(enabled&&active)startFocus();else stopFocus()}
 const toggle=$('jx-audio-toggle');toggle?.addEventListener('click',()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));toggle.textContent=enabled?'AUDIO EFFECTS · ON':'ENABLE AUDIO EFFECTS';if(!enabled)stopFocus();else{tone(432,528,.09);syncFocus()}const s=$('jx-audio-status');if(s)s.textContent=enabled?'Optional audio enabled. Focus tones only run while focus mode is active.':'Audio disabled.'});
 waveSelect?.addEventListener('change',syncFocus);
 const observer=new MutationObserver(syncFocus);observer.observe(document.body,{attributes:true,attributeFilter:['class']});const shell=document.querySelector('.shell');if(shell)observer.observe(shell,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',e=>{if(e.target.closest('#send-message,#load-model,.neural-orb,#jx-global-focus,#chat-focus'))tone();});
 function setupCanvas(){canvas=$('neural-constellation-canvas');if(!canvas){canvas=document.createElement('canvas');canvas.id='neural-constellation-canvas';document.body.prepend(canvas)}ctx=canvas.getContext('2d',{alpha:true});resize();nodes=Array.from({length:24},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18}));if(!reduced)draw()}
 function resize(){if(!canvas||!ctx)return;dpr=Math.min(window.devicePixelRatio||1,1.5);w=window.innerWidth;h=window.innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
 // Declare before setupCanvas() starts the first animation frame.
 let pointer={x:-1e4,y:-1e4,active:false};
 function draw(){if(document.hidden){raf=0;return}ctx.clearRect(0,0,w,h);for(let i=0;i<nodes.length;i++){const a=nodes[i];if(pointer.active){const dx=a.x-pointer.x,dy=a.y-pointer.y,dist=Math.hypot(dx,dy);if(dist>0&&dist<140){const force=(1-dist/140)*.018;a.vx+=dx/dist*force;a.vy+=dy/dist*force;const speed=Math.hypot(a.vx,a.vy);if(speed>.55){a.vx=a.vx/speed*.55;a.vy=a.vy/speed*.55}}}a.vx*=.999;a.vy*=.999;a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>w)a.vx*=-1;if(a.y<0||a.y>h)a.vy*=-1;ctx.fillStyle=pointer.active&&Math.hypot(a.x-pointer.x,a.y-pointer.y)<140?'rgba(0,245,212,.95)':'rgba(0,245,212,.65)';ctx.beginPath();ctx.arc(a.x,a.y,1.15,0,Math.PI*2);ctx.fill();if(pointer.active){const pd=Math.hypot(a.x-pointer.x,a.y-pointer.y);if(pd<140){ctx.strokeStyle='rgba(0,245,212,'+((1-pd/140)*.45)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(pointer.x,pointer.y);ctx.stroke()}}for(let j=i+1;j<nodes.length;j++){const b=nodes[j],dist=Math.hypot(a.x-b.x,a.y-b.y);if(dist<105){ctx.strokeStyle='rgba(0,245,212,'+(1-dist/105)*.22+')';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}raf=requestAnimationFrame(draw)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;stopFocus()}else if(!reduced&&!raf)draw()});window.addEventListener('resize',resize,{passive:true});setupCanvas();
// Pointer/touch proximity gives particles a local response without requesting device-motion permission.
const overview=document.querySelector('.shell:not(.local-chat-shell)');
overview?.addEventListener('pointermove',e=>{const r=overview.getBoundingClientRect();pointer={x:e.clientX,y:e.clientY,active:true}},{passive:true});
overview?.addEventListener('pointerleave',()=>{pointer.active=false},{passive:true});
overview?.addEventListener('pointerdown',e=>{const scene=e.target.closest('.jx-orbit-scene');if(scene){scene.classList.remove('jx-shockwave');void scene.offsetWidth;scene.classList.add('jx-shockwave');setTimeout(()=>scene.classList.remove('jx-shockwave'),850)}},{passive:true});

 // JARVIS-X HQ v25: explicit Sun Mode handoff and active-screen idle curtain.
 const overviewStage=document.querySelector('.jx-core-stage');
 if(overviewStage&&!document.querySelector('.jx-v25-control-dock')){
   const dock=document.createElement('section');
   dock.className='jx-v25-control-dock';
   dock.setAttribute('aria-label','Mode Soleil and screen controls');
   const sunButton=document.createElement('button');
   sunButton.type='button';
   sunButton.className='jx-v25-sun-toggle';
   sunButton.setAttribute('aria-pressed','false');
   sunButton.textContent='MODE SOLEIL · OFF';
   const shortcutButton=document.createElement('button');
   shortcutButton.type='button';
   shortcutButton.className='jx-v25-shortcut';
   shortcutButton.textContent='OPEN ALARMY SHORTCUT';
   shortcutButton.disabled=true;
   const sunStatus=document.createElement('span');
   sunStatus.className='jx-v25-status';
   sunStatus.setAttribute('role','status');
   sunStatus.setAttribute('aria-live','polite');
   sunStatus.textContent='Visual shield off · alarm handoff not armed';
   dock.append(sunButton,shortcutButton,sunStatus);
   overviewStage.append(dock);
   let sunMode=false;
   sunButton.addEventListener('click',()=>{
     sunMode=!sunMode;
     document.body.classList.toggle('jx-sun-mode',sunMode);
     sunButton.setAttribute('aria-pressed',String(sunMode));
     sunButton.textContent=sunMode?'MODE SOLEIL · ON':'MODE SOLEIL · OFF';
     shortcutButton.disabled=!sunMode;
     sunStatus.textContent=sunMode
       ?'Warm visual shield active · open your configured iOS Shortcut explicitly'
       :'Visual shield off · no alarm handoff requested';
   });
   shortcutButton.addEventListener('click',()=>{
     if(!sunMode)return;
     sunStatus.textContent='Shortcuts handoff requested · confirm the Alarmy shortcut in iOS';
     window.location.href='shortcuts://run-shortcut?name=Alarmy';
   });
 }

 // The OLED curtain is an in-page visual idle feature. It pauses while Safari hides
 // the page and never claims to wake the device or trigger a background alarm.
 let idleTimer=0;
 let idleCurtain=null;
 const IDLE_LIMIT_MS=30*60*1000;
 function removeIdleCurtain(){
   if(!idleCurtain)return;
   idleCurtain.remove();
   idleCurtain=null;
   resetIdleTimer();
 }
 function showIdleCurtain(){
   idleTimer=0;
   if(document.hidden||idleCurtain)return;
   idleCurtain=document.createElement('div');
   idleCurtain.className='jx-v25-idle-curtain';
   idleCurtain.setAttribute('role','dialog');
   idleCurtain.setAttribute('aria-modal','true');
   idleCurtain.setAttribute('aria-label','Screen rest');
   const panel=document.createElement('div');
   panel.className='jx-v25-idle-panel';
   const heading=document.createElement('strong');
   heading.textContent='CORE IN REST STATE';
   const detail=document.createElement('p');
   detail.textContent='The display curtain is active. This page cannot wake iPadOS or run a background alarm.';
   const resume=document.createElement('button');
   resume.type='button';
   resume.textContent='RESUME HQ';
   resume.addEventListener('click',removeIdleCurtain);
   panel.append(heading,detail,resume);
   idleCurtain.append(panel);
   document.body.append(idleCurtain);
   resume.focus();
 }
 function resetIdleTimer(){
   if(idleTimer)window.clearTimeout(idleTimer);
   idleTimer=0;
   if(document.hidden||idleCurtain)return;
   idleTimer=window.setTimeout(showIdleCurtain,IDLE_LIMIT_MS);
 }
 ['pointerdown','pointermove','keydown','touchstart'].forEach(type=>{
   document.addEventListener(type,()=>{
     if(idleCurtain){
       if(type==='keydown')removeIdleCurtain();
       return;
     }
     resetIdleTimer();
   },{passive:type!=='keydown'});
 });
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){if(idleTimer)window.clearTimeout(idleTimer);idleTimer=0;}
   else resetIdleTimer();
 });
 resetIdleTimer();

 window.addEventListener('pagehide',()=>{stopFocus();if(audio?.state==='running')audio.suspend().catch(()=>{})});
})();
