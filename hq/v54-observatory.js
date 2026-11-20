/* JARVIS-X v54 Observatory integration — no fabricated subsystem states */
(() => {
  'use strict';
  const root=document.createElement('section');
  root.className='jx-v54-shell';
  root.setAttribute('aria-label','JARVIS-X live system telemetry');
  root.innerHTML=`
    <section class="jx-v54-panel"><div class="jx-v54-title">SYSTEM TELEMETRY</div>
      <p class="jx-v54-title">LOCAL M1 ENGINE</p><div class="jx-v54-value" id="jx54-local">UNKNOWN · NO TELEMETRY SOURCE</div>
      <p class="jx-v54-title">CLOUD GATEWAY</p><div class="jx-v54-value" id="jx54-cloud">UNKNOWN · NO TELEMETRY SOURCE</div>
      <p class="jx-v54-title">AGENTS</p><div class="jx-v54-value" id="jx54-agents">UNKNOWN</div>
      <p class="jx-v54-title">XMEMO</p><div class="jx-v54-value" id="jx54-xmemo">UNKNOWN</div>
      <p class="jx-v54-title">SNAPSHOT</p><div class="jx-v54-value" id="jx54-updated">NO VERIFIED UPDATE</div>
    </section>
    <section class="jx-v54-panel amber"><div class="jx-v54-title">NEURAL CONSTELLATION // VISUAL CORE</div>
      <div class="jx-v54-orb" aria-hidden="true"><div class="jx-v54-orb-core"></div></div>
      <div class="jx-v54-title">MONTE CARLO // SIMULATION ONLY</div>
      <button type="button" id="jx54-simulate">RUN 10,000 ITERATIONS</button>
      <p class="jx-v54-value" id="jx54-sim-result" aria-live="polite">NOT RUN · NOT LIVE SYSTEM PROBABILITY</p>
    </section>
    <section class="jx-v54-panel"><div class="jx-v54-title">CORE DIAGNOSTICS</div>
      <button type="button" id="jx54-diagnostics">RUN LOCAL CHECKS</button>
      <pre class="jx-v54-value" id="jx54-diagnostic-result" aria-live="polite">NOT RUN</pre>
      <p class="jx-v54-title">DATA INTEGRITY</p><div class="jx-v54-value">UNKNOWN VALUES ARE PRESERVED. VISUAL ANIMATION IS NOT SYSTEM TELEMETRY.</div>
    </section>`;
  const main=document.querySelector('main');
  if(main)main.insertAdjacentElement('afterend',root);else document.body.append(root);
  const byId=id=>document.getElementById(id);
  const fmt=v=>v===null||v===undefined?'UNKNOWN':String(v);
  function render(s){
    const local=s.localEngine||{},cloud=s.cloudGateway||{},agents=s.agents||{},xm=s.xmemo||{};
    byId('jx54-local').textContent=fmt(local.status)+' · '+fmt(local.modelId)+' · '+fmt(local.backend);
    byId('jx54-cloud').textContent=fmt(cloud.health)+' · chatEnabled='+fmt(cloud.chatEnabled)+' · '+fmt(cloud.lockReason);
    byId('jx54-agents').textContent='localCount='+fmt(agents.localCount)+' · liveConnected='+fmt(agents.liveConnected);
    byId('jx54-xmemo').textContent='connected='+fmt(xm.connected)+' · consent='+fmt(xm.consent)+' · '+fmt(xm.syncStatus);
    byId('jx54-updated').textContent=(s.updatedAt||'NO VERIFIED UPDATE')+' · '+(s.source||'UNKNOWN SOURCE');
  }
  const core=window.JXHarmonyCore;
  if(core){render(core.getSystemState());window.addEventListener('jx:system-state',e=>render(e.detail||{}));}
  byId('jx54-simulate').addEventListener('click',()=>{
    if(!core){byId('jx54-sim-result').textContent='CORE UNAVAILABLE';return;}
    const worker=core.createMonteCarloWorker(),id='sim-'+Date.now();
    worker.onmessage=e=>{if(e.data?.id!==id)return;worker.terminate();byId('jx54-sim-result').textContent=e.data.ok?JSON.stringify(e.data.result):'SIMULATION ERROR: '+e.data.error;};
    worker.onerror=()=>{worker.terminate();byId('jx54-sim-result').textContent='WORKER ERROR';};
    worker.postMessage({id,iterations:10000,base:.5,spread:.2,threshold:.5});
  });
  byId('jx54-diagnostics').addEventListener('click',async()=>{
    byId('jx54-diagnostic-result').textContent='CHECKING…';
    try{const result=core?await core.runDiagnostics():{core:'UNAVAILABLE'};byId('jx54-diagnostic-result').textContent=JSON.stringify(result,null,2);}
    catch(error){byId('jx54-diagnostic-result').textContent='ERROR: '+String(error);}
  });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(reg=>{window.dispatchEvent(new CustomEvent('jx:v54-sw',{detail:{status:'REGISTERED',scope:reg.scope}}));})
      .catch(error=>window.dispatchEvent(new CustomEvent('jx:v54-sw',{detail:{status:'FAILED',message:String(error)}})));
  }
})();
