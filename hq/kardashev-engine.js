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
 function draw(){if(document.hidden){raf=0;return}ctx.clearRect(0,0,w,h);for(let i=0;i<nodes.length;i++){const a=nodes[i];a.x+=a.vx;a.y+=a.vy;if(a.x<0||a.x>w)a.vx*=-1;if(a.y<0||a.y>h)a.vy*=-1;ctx.fillStyle='rgba(0,245,212,.65)';ctx.beginPath();ctx.arc(a.x,a.y,1.15,0,Math.PI*2);ctx.fill();for(let j=i+1;j<nodes.length;j++){const b=nodes[j],dist=Math.hypot(a.x-b.x,a.y-b.y);if(dist<105){ctx.strokeStyle='rgba(0,245,212,'+(1-dist/105)*.22+')';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}}raf=requestAnimationFrame(draw)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;stopFocus()}else if(!reduced&&!raf)draw()});window.addEventListener('resize',resize,{passive:true});setupCanvas();
 window.addEventListener('pagehide',()=>{stopFocus();if(audio?.state==='running')audio.suspend().catch(()=>{})});
})();
