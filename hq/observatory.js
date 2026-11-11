(()=>{'use strict';
const $=id=>document.getElementById(id), body=document.body, canvas=$('synapses'),ctx=canvas.getContext('2d');
let w=0,h=0,dpr=1,raf=0,mode='normal',lastActivity=Date.now(),sleepTimer=0;
const pointer={x:-1000,y:-1000};
const nodes=Array.from({length:72},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.32,vy:(Math.random()-.5)*.32,r:Math.random()*1.5+1}));
function resize(){dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
function draw(){ctx.clearRect(0,0,w,h);nodes.forEach((n,i)=>{let dx=pointer.x-n.x,dy=pointer.y-n.y,d=Math.hypot(dx,dy);if(d<150&&d>1){n.vx-=dx/d*.002;n.vy-=dy/d*.002;ctx.strokeStyle='rgba(0,245,212,'+(1-d/150)*.4+')';ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(pointer.x,pointer.y);ctx.stroke()}n.x+=n.vx;n.y+=n.vy;n.vx*=.999;n.vy*=.999;if(n.x<0||n.x>w)n.vx*=-1;if(n.y<0||n.y>h)n.vy*=-1;ctx.fillStyle=mode==='sun'?'rgba(255,190,140,.65)':'rgba(0,245,212,.8)';ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fill();for(let j=i+1;j<nodes.length;j++){let t=nodes[j],dist=Math.hypot(n.x-t.x,n.y-t.y);if(dist<105){ctx.strokeStyle='rgba(114,9,183,'+(1-dist/105)*.23+')';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(t.x,t.y);ctx.stroke()}}});raf=requestAnimationFrame(draw)}
function pulse(){const s=$('shockwave');s.classList.remove('burst');void s.offsetWidth;s.classList.add('burst')}
function setMode(next){mode=next;body.classList.remove('mode-focus','mode-sun');if(next==='focus')body.classList.add('mode-focus');if(next==='sun')body.classList.add('mode-sun');document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));$('mode-status').textContent=next.toUpperCase()+' DISPLAY · VISUAL PROFILE ACTIVE';if(next==='sun')resetSleep();else $('sleep-curtain').classList.remove('show')}
function resetSleep(){lastActivity=Date.now();clearTimeout(sleepTimer);if(mode==='sun')sleepTimer=setTimeout(()=>$('sleep-curtain').classList.add('show'),30*60*1000)}
function activity(){lastActivity=Date.now();if($('sleep-curtain').classList.contains('show'))$('sleep-curtain').classList.remove('show');if(mode==='sun')resetSleep()}
window.addEventListener('resize',resize);window.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;activity()},{passive:true});window.addEventListener('pointerdown',e=>{pointer.x=e.clientX;pointer.y=e.clientY;activity()},{passive:true});window.addEventListener('keydown',activity);
$('astrolabe').addEventListener('click',pulse);$('astrolabe').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pulse()}});$('pulse').addEventListener('click',pulse);
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('go-focus').addEventListener('click',()=>setMode('focus'));$('go-sun').addEventListener('click',()=>setMode('sun'));
$('open-shortcut').addEventListener('click',()=>{const time=$('alarm-time').value||'07:00';window.location.href='shortcuts://run-shortcut?name=JARVIS_ALARMY&input=text&text='+encodeURIComponent(time)});
$('sleep-curtain').addEventListener('click',()=>{$('sleep-curtain').classList.remove('show');activity()});
const ignition=$('ignition');const finish=()=>ignition.classList.add('done');$('skip-boot').addEventListener('click',finish);setTimeout(finish,2200);
resize();draw();
})();