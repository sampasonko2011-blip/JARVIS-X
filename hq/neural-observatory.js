/* Small progressive enhancement for the Neural Observatory HQ surface. */
(() => {
  const stage=document.querySelector(".jx-core-stage");
  if(!stage || stage.dataset.observatoryReady==="true") return;
  stage.dataset.observatoryReady="true";
  const rail=document.createElement("div");
  rail.className="jx-observatory-rail";
  rail.setAttribute("aria-label","Executive system status");
  rail.innerHTML=[
    '<div class="jx-telemetry"><small>Local inference</small><strong><i class="jx-signal"></i>Device runtime</strong><em>Tested separately in Local Model Chat</em></div>',
    '<div class="jx-telemetry"><small>Long-term memory</small><strong><i class="jx-signal"></i>XMemo gateway</strong><em>Live read/write not yet verified</em></div>',
    '<div class="jx-telemetry"><small>Cognitive policy</small><strong><i class="jx-signal"></i>Adaptive sampling</strong><em>Policy module present; local integration pending</em></div>',
    '<div class="jx-telemetry"><small>Execution governance</small><strong><i class="jx-signal"></i>Fail-closed controls</strong><em>Authorization and budget gates retained</em></div>'
  ].join("");
  const footer=stage.querySelector(".jx-core-foot");
  if(footer) stage.insertBefore(rail,footer); else stage.appendChild(rail);
})();
