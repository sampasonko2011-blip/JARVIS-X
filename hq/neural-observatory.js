/* JARVIS-X Neural Observatory progressive enhancement. Decorative graphics only. */
(() => {
  const stage=document.querySelector(".jx-core-stage");
  if(!stage || stage.dataset.observatoryReady==="true") return;
  stage.dataset.observatoryReady="true";

  const scene=stage.querySelector(".jx-orbit-scene");
  if(scene){
    const web=document.createElement("div");
    web.className="jx-neural-web";
    web.setAttribute("aria-hidden","true");
    web.innerHTML='<svg viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet" focusable="false"><g class="jx-neural-links"><path d="M34 70 92 45 145 78 180 35 230 67 294 43 330 91M34 70 58 145 112 190 180 218 244 190 310 151 330 91M58 145 92 45M112 190 145 78M244 190 230 67M310 151 294 43M145 78 230 67M112 190 244 190"/></g><g class="jx-neural-nodes"><circle cx="34" cy="70" r="3"/><circle cx="92" cy="45" r="2.5"/><circle cx="145" cy="78" r="3"/><circle cx="180" cy="35" r="2.5"/><circle cx="230" cy="67" r="3"/><circle cx="294" cy="43" r="2.5"/><circle cx="330" cy="91" r="3"/><circle cx="58" cy="145" r="2.5"/><circle cx="112" cy="190" r="3"/><circle cx="180" cy="218" r="2.5"/><circle cx="244" cy="190" r="3"/><circle cx="310" cy="151" r="2.5"/></g></svg>';
    scene.prepend(web);
  }

  const rail=document.createElement("div");
  rail.className="jx-observatory-rail";
  rail.setAttribute("aria-label","Executive system status");
  rail.innerHTML=[
    '<div class="jx-telemetry"><small>Local inference</small><strong><i class="jx-signal"></i>Device runtime</strong><em>Separate local-chat test required</em></div>',
    '<div class="jx-telemetry"><small>Long-term memory</small><strong><i class="jx-signal"></i>XMemo</strong><em>Live recall/store not verified</em></div>',
    '<div class="jx-telemetry"><small>Cognitive policy</small><strong><i class="jx-signal"></i>Adaptive routing</strong><em>Local-chat integration pending</em></div>',
    '<div class="jx-telemetry"><small>Execution governance</small><strong><i class="jx-signal"></i>Permission gates</strong><em>Live execution requires separate verification</em></div>'
  ].join("");
  const footer=stage.querySelector(".jx-core-foot");
  if(footer) stage.insertBefore(rail,footer); else stage.appendChild(rail);
})();
