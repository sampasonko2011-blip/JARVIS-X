(()=>{'use strict';
const MODE='jarvis_x_active_mode', AUDIO='jarvis_x_auto_audio';
const valid=['normal','focus','sun'];
const read=(k,f)=>{try{return localStorage.getItem(k)??f}catch{return f}};
let mode=read(MODE,'normal');if(!valid.includes(mode))mode='normal';
let enabled=read(AUDIO,'false')==='true',audio=null,lastCue=null,ripples=[];
const $=id=>document.getElementById(id);
function setMode(next){if(!valid.includes(next))return;mode=next;try{localStorage.setItem(MODE,mode)}catch{};document.body.classList.remove('mode-focus','mode-sun');document.body.classList.add('mode-'+mode);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const status=$('mode-status');if(status)status.textContent=({normal:'NORMAL DISPLAY · VISUAL PROFILE ACTIVE',focus:'FOCUS DISPLAY · SIDE WINGS FOLDED',sun:'SUNSET DISPLAY · WARM LOW-LIGHT PROFILE'})[mode];}
function context(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}
function cue(){if(!enabled)return;const c=context();if(!c)return;lastCue=mode;window.__jxLastCue=mode;const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=mode==='sun'?110:mode==='focus'?240:528;const vol=mode==='sun'?.003:mode==='focus'?.006:.005;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(vol,c.currentTime+.012);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+(mode==='sun'?.22:.09));o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+(mode==='sun'?.24:.11))}
function setAudio(on){enabled=!!on;try{localStorage.setItem(AUDIO,String(enabled))}catch{};const b=$('audio-toggle');if(b){b.setAttribute('aria-pressed',String(enabled));b.textContent=enabled?'SOUND ENGINE · AUTO-SYNC ON':'ENABLE SOUND ENGINE'};const s=$('jx-audio-status');if(s)s.textContent=enabled?'AUTO-SYNC · ON · Sound resumes on the next touch in this page.':'Audio off · enable explicitly in Observatory.';if(enabled){const c=context();if(c)cue()}}
function ripple(x,y){ripples.push({x,y,r:5,a:.8,max:mode==='focus'?190:130});if(ripples.length>12)ripples.shift()}
function animate(){const canvas=$('synapses');if(canvas){const c=canvas.getContext('2d');const w=canvas.width=innerWidth,h=canvas.height=innerHeight;c.clearRect(0,0,w,h);ripples.forEach(p=>{p.r+=5;p.a*=.94;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.strokeStyle='rgba(0,245,212,'+p.a+')';c.stroke()});ripples=ripples.filter(p=>p.r<p.max&&p.a>.03);canvas.dataset.rippleCount=String(ripples.length)}requestAnimationFrame(animate)}
document.addEventListener('pointerdown',e=>{ripple(e.clientX,e.clientY);cue()},{passive:true});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
const audioButton=$('audio-toggle');audioButton?.addEventListener('click',()=>setAudio(!enabled));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audio?.state==='running')audio.suspend().catch(()=>{})});
window.JXMode={get mode(){return mode},get audioEnabled(){return enabled},setMode,setAudio,resume(){if(enabled)context()}};
setMode(mode);if($('audio-toggle'))setAudio(enabled);else{const s=$('jx-audio-status');if(s)s.textContent=enabled?'AUTO-SYNC · ON · Tap to resume audio.':'Audio off · Observatory opt-in required.'}
if($('jx-audio-status'))$('jx-audio-status').textContent=enabled?'AUTO-SYNC · ON · Tap to resume audio.':'Audio off · Observatory opt-in required.';
if($('synapses'))animate();
})();