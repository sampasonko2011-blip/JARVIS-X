(() => {
  const button = document.querySelector('#run-checks');
  const list = document.querySelector('#checks');
  const result = document.querySelector('#result');
  if (!button || !list || !result) return;

  const row = (name, detail, status) =>
    '<div class="log"><strong>' + name + ' <span class="tag ' +
    (status === 'AVAILABLE' ? 'green' : status === 'UNAVAILABLE' ? 'amber' : '') +
    '">' + status + '</span></strong><small>' + detail + '</small></div>';

  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = 'Checking browser capabilities…';
    const checks = [];
    const secure = window.isSecureContext;
    checks.push(row('Secure context', secure ? 'HTTPS or localhost is active.' : 'WebGPU generally requires a secure context.', secure ? 'AVAILABLE' : 'UNAVAILABLE'));

    const gpuApi = typeof navigator.gpu !== 'undefined';
    checks.push(row('WebGPU API', gpuApi ? 'navigator.gpu is exposed.' : 'This browser does not expose navigator.gpu.', gpuApi ? 'AVAILABLE' : 'UNAVAILABLE'));

    let adapter = null;
    if (gpuApi && secure) {
      try { adapter = await navigator.gpu.requestAdapter(); }
      catch (_) { adapter = null; }
    }
    checks.push(row('GPU adapter', adapter ? 'A WebGPU adapter was returned. This does not prove the model will fit.' : 'No usable WebGPU adapter was returned.', adapter ? 'AVAILABLE' : 'UNAVAILABLE'));

    let storage = 'UNKNOWN';
    try {
      const estimate = await navigator.storage?.estimate?.();
      storage = estimate ? Math.round((estimate.quota || 0) / 1024 / 1024) + ' MB estimated browser quota; usage ' + Math.round((estimate.usage || 0) / 1024 / 1024) + ' MB.' : 'Storage estimate API unavailable.';
    } catch (_) { storage = 'Storage estimate unavailable.'; }
    checks.push(row('Browser storage', storage, 'INFO'));

    const memory = navigator.deviceMemory ? navigator.deviceMemory + ' GB reported by browser (may be absent or rounded).' : 'Browser does not expose deviceMemory.';
    checks.push(row('Device memory hint', memory, 'INFO'));

    list.innerHTML = checks.join('');
    const pass = secure && gpuApi && !!adapter;
    result.textContent = pass
      ? 'PRELIMINARY PASS: WebGPU is exposed. Next gate is a controlled model-load test; no inference has run.'
      : 'NOT READY: this browser did not pass the WebGPU preflight. No model was downloaded and no cloud fallback was attempted.';
    button.disabled = false;
  });
})();
