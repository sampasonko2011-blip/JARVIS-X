/* JARVIS-X v54 Harmony Core — truth-first telemetry */
(() => {
  'use strict';
  const CHANNEL='jx_system_state_v54', KEY='jx_v54_telemetry_snapshot';
  const defaults={
    updatedAt:null, source:'UNKNOWN',
    localEngine:{modelId:'UNKNOWN',status:'UNKNOWN',backend:'UNKNOWN',tokensPerSec:null},
    cloudGateway:{health:'UNKNOWN',chatEnabled:null,lockReason:'UNKNOWN',latencyMs:null},
    agents:{localCount:null,liveConnected:null},
    xmemo:{connected:null,consent:null,syncStatus:'UNKNOWN'}
  };
  const copy=x=>JSON.parse(JSON.stringify(x));
  const merge=(a,b)=>({...a,...b,localEngine:{...a.localEngine,...(b.localEngine||{})},cloudGateway:{...a.cloudGateway,...(b.cloudGateway||{})},agents:{...a.agents,...(b.agents||{})},xmemo:{...a.xmemo,...(b.xmemo||{})}});
  let state=copy(defaults);
  try { const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved&&typeof saved==='object'&&!Array.isArray(saved))state=merge(state,saved); } catch {}
  const bus=typeof BroadcastChannel==='function'?new BroadcastChannel(CHANNEL):null;
  function publishSystemState(patch,source='UNVERIFIED_SOURCE'){
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Telemetry patch must be an object');
    state=merge(state,patch); state.updatedAt=new Date().toISOString(); state.source=String(source).slice(0,80);
    try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}
    bus?.postMessage({type:'STATE_UPDATE',payload:state});
    window.dispatchEvent(new CustomEvent('jx:system-state',{detail:copy(state)}));
    return copy(state);
  }
  if(bus)bus.onmessage=e=>{const p=e.data?.type==='STATE_UPDATE'&&e.data.payload;if(p&&typeof p==='object'){state=merge(state,p);window.dispatchEvent(new CustomEvent('jx:system-state',{detail:copy(state)}));}};
  function createMonteCarloWorker(){
    const source=`self.onmessage=e=>{const {id,iterations=10000,base=.5,spread=.2,threshold=.5}=e.data||{};if(!Number.isInteger(iterations)||iterations<100||iterations>100000||![base,spread,threshold].every(Number.isFinite)||spread<=0){postMessage({id,ok:false,error:'INVALID_BOUNDED_INPUT'});return;}let wins=0,sum=0;for(let i=0;i<iterations;i++){const u=Math.max(Math.random(),1e-12),v=Math.random(),z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v),s=base+z*spread;if(s>=threshold)wins++;sum+=s;}postMessage({id,ok:true,result:{iterations,probability:+(wins/iterations*100).toFixed(2),mean:+(sum/iterations).toFixed(4),label:'SIMULATION_ONLY_NOT_LIVE_SYSTEM_PROBABILITY'}});};`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const worker=new Worker(url); worker.addEventListener('error',()=>URL.revokeObjectURL(url),{once:true}); worker.addEventListener('message',()=>URL.revokeObjectURL(url),{once:true}); return worker;
  }
  async function runDiagnostics(){
    let storage='UNKNOWN';try{const k='__jx_v54_probe';localStorage.setItem(k,'1');localStorage.removeItem(k);storage='PASS';}catch{storage='FAIL';}
    return {timestamp:new Date().toISOString(),webgpu:navigator.gpu?'AVAILABLE_NOT_TESTED':'UNAVAILABLE',serviceWorker:navigator.serviceWorker?.controller?'CONTROLLED':'NOT_CONTROLLED',storage,telemetry:state.updatedAt?'SNAPSHOT_PRESENT':'UNKNOWN'};
  }
  window.JXHarmonyCore=Object.freeze({getSystemState:()=>copy(state),publishSystemState,createMonteCarloWorker,runDiagnostics});
})();
