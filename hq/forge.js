import {
  validateModelCandidate,
  compareBenchmarkRuns,
  assessPromotion
} from "./model-registry.mjs";

const STORE_KEY = "jarvis-x-hq-v0";
const FORGE_KEY = "jarvis-x-model-forge-v1";
const allowedHosts = new Set(["huggingface.co", "github.com", "gitlab.com", "ollama.com"]);
const byId = (id) => document.getElementById(id);
const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const timestamp = () => new Date().toISOString();
const newId = () => globalThis.crypto?.randomUUID?.() || "forge-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

function loadForge() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORGE_KEY) || '{"candidates":[],"runs":[]}');
    if (!parsed || !Array.isArray(parsed.candidates) || !Array.isArray(parsed.runs)) throw new Error("Invalid registry shape");
    const validRecords = [...parsed.candidates, ...parsed.runs].every((record) =>
      record && typeof record === "object" && !Array.isArray(record) &&
      typeof record.id === "string" && typeof record.status === "string");
    if (!validRecords) throw new Error("Invalid registry records");
    return parsed;
  } catch {
    return { candidates: [], runs: [], readOnly: true };
  }
}

let state = loadForge();
function persist() {
  if (state.readOnly) {
    setStatus("forge-intake-status", "Saved Forge data could not be validated. Registry is read-only to protect existing records; export/inspect browser storage before recovery.", true);
    return false;
  }
  try {
    localStorage.setItem(FORGE_KEY, JSON.stringify({ candidates: state.candidates, runs: state.runs }));
    render();
    return true;
  } catch {
    setStatus("forge-intake-status", "Could not persist Forge records in this browser. Nothing is claimed saved.", true);
    return false;
  }
}
function setStatus(id, message, error = false) {
  const element = byId(id);
  if (!element) return;
  element.textContent = message;
  element.dataset.state = error ? "error" : "info";
}
function readText(id) { return byId(id).value.trim(); }
function clearForm() {
  ["forge-id","forge-name","forge-source","forge-revision","forge-license","forge-digest","forge-capabilities","forge-baseline-id","forge-candidate-id","forge-security-id"].forEach((id) => { byId(id).value = ""; });
}
function render() {
  const candidateList = byId("forge-candidate-list");
  candidateList.innerHTML = state.candidates.length ? state.candidates.slice().reverse().map((candidate) =>
    '<div class="log"><strong>' + safeText(candidate.displayName) + '</strong> <span class="tag ' +
    (candidate.status === "REGISTERED_CANDIDATE" ? "green" : "amber") + '">' + safeText(candidate.status) + '</span>' +
    '<div>' + safeText(candidate.id) + ' · revision ' + safeText(candidate.revision) + '</div>' +
    '<small>' + safeText(candidate.licenseId) + ' · SHA-256 ' + safeText(candidate.artifactSha256.slice(0, 12)) +
    '… · ' + safeText(candidate.createdAt) + '</small>' +
    (candidate.lastEvaluation ? '<p>Latest gate: ' + safeText(candidate.lastEvaluation) + '</p>' : '') + '</div>'
  ).join("") : '<p class="empty">No candidates registered.</p>';

  const runList = byId("forge-run-list");
  runList.innerHTML = state.runs.length ? state.runs.slice().reverse().map((run) =>
    '<div class="log"><strong>' + safeText(run.candidateName) + '</strong> <span class="tag ' +
    (run.status === "ELIGIBLE_FOR_STAGED_RELEASE" ? "green" : "amber") + '">' + safeText(run.status) + '</span>' +
    '<div>' + safeText(run.summary) + '</div><small>' + safeText(run.createdAt) + ' · manually entered measurements</small></div>'
  ).join("") : '<p class="empty">No evaluations recorded.</p>';

  const selector = byId("forge-benchmark-candidate");
  const current = selector.value;
  selector.innerHTML = '<option value="">Select a registered candidate</option>' + state.candidates.map((candidate) =>
    '<option value="' + safeText(candidate.id) + '">' + safeText(candidate.displayName) + ' (' + safeText(candidate.id) + ')</option>'
  ).join("");
  if (state.candidates.some((candidate) => candidate.id === current)) selector.value = current;
  byId("forge-register").disabled = Boolean(state.readOnly);
  byId("forge-evaluate").disabled = Boolean(state.readOnly);
}
function getCandidateFromForm() {
  const capabilities = readText("forge-capabilities").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    id: readText("forge-id"),
    displayName: readText("forge-name"),
    sourceUrl: readText("forge-source"),
    revision: readText("forge-revision"),
    licenseId: readText("forge-license"),
    artifactSha256: readText("forge-digest").toLowerCase(),
    capabilities,
    baselineBenchmarkId: readText("forge-baseline-id"),
    candidateBenchmarkId: readText("forge-candidate-id"),
    securityReviewId: readText("forge-security-id"),
    networkAccess: false,
    secretsAccess: false,
    autoPromote: false
  };
}
byId("forge-register")?.addEventListener("click", () => {
  const candidate = getCandidateFromForm();
  if (state.candidates.some((existing) => existing.id === candidate.id)) {
    setStatus("forge-intake-status", "Candidate ID already exists. Use a new immutable candidate ID; existing records are not overwritten.", true);
    return;
  }
  const result = validateModelCandidate(candidate);
  if (!result.valid) {
    setStatus("forge-intake-status", "Candidate rejected by local validation: " + result.errors.join(" · "), true);
    return;
  }
  let source;
  try { source = new URL(candidate.sourceUrl); } catch { /* validation above reports the malformed URL */ }
  if (!source || source.protocol !== "https:" || !allowedHosts.has(source.hostname.toLowerCase())) {
    setStatus("forge-intake-status", "Candidate source is outside the browser intake allowlist.", true);
    return;
  }
  candidate.status = "REGISTERED_CANDIDATE";
  candidate.createdAt = timestamp();
  candidate.lastEvaluation = "";
  state.candidates.push(candidate);
  if (persist()) {
    clearForm();
    setStatus("forge-intake-status", "Candidate metadata registered locally. No model weights were downloaded and no model was executed.");
  }
});
byId("forge-clear")?.addEventListener("click", clearForm);
byId("forge-evaluate")?.addEventListener("click", () => {
  const candidate = state.candidates.find((item) => item.id === byId("forge-benchmark-candidate").value);
  if (!candidate) {
    setStatus("forge-benchmark-status", "Select a registered candidate first.", true);
    return;
  }
  const numericFields = [
    "forge-base-quality","forge-new-quality","forge-base-safety","forge-new-safety",
    "forge-base-latency","forge-new-latency","forge-base-memory","forge-new-memory"
  ];
  const values = Object.fromEntries(numericFields.map((id) => [id, byId(id).value.trim() === "" ? NaN : Number(byId(id).value)]));
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0) ||
      values["forge-base-quality"] > 1 || values["forge-new-quality"] > 1 ||
      values["forge-base-safety"] > 1 || values["forge-new-safety"] > 1) {
    setStatus("forge-benchmark-status", "Enter finite non-negative measurements; quality and safety must be between 0 and 1. No run was recorded.", true);
    return;
  }
  const baseline = {
    quality: values["forge-base-quality"], safety: values["forge-base-safety"],
    latencyMs: values["forge-base-latency"], memoryMb: values["forge-base-memory"]
  };
  const result = {
    quality: values["forge-new-quality"], safety: values["forge-new-safety"],
    latencyMs: values["forge-new-latency"], memoryMb: values["forge-new-memory"]
  };
  const comparison = compareBenchmarkRuns(baseline, result);
  const humanApproved = byId("forge-human-approval").checked;
  const promotion = assessPromotion(candidate, baseline, result, {
    humanApproved,
    approver: humanApproved ? "local-user-approval" : ""
  });
  const failedGates = comparison.gates ? Object.entries(comparison.gates).filter(([, pass]) => !pass).map(([name]) => name) : comparison.errors;
  const run = {
    id: newId(),
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    status: !comparison.eligible ? "REJECTED_BY_NUMERIC_GATES" : (humanApproved ? "APPROVAL_RECORDED_UNVERIFIED" : "UNPROVEN_MANUAL_BENCHMARKS"),
    createdAt: timestamp(),
    measurements: { baseline, candidate: result },
    comparison,
    summary: comparison.eligible
      ? "Quality " + (comparison.deltas.quality >= 0 ? "+" : "") + comparison.deltas.quality.toFixed(3) +
        "; safety " + comparison.deltas.safety.toFixed(3) +
        "; latency " + comparison.deltas.latencyMs + " ms; memory " + comparison.deltas.memoryMb + " MB"
      : "Rejected gates: " + failedGates.join(", ")
  };
  state.runs.push(run);
  candidate.lastEvaluation = run.status;
  if (!persist()) return;
  byId("forge-human-approval").checked = false;
  setStatus("forge-benchmark-status",
    "Recorded local comparison: " + run.status + ". " +
    (comparison.eligible
      ? "The entered numbers pass the numeric gates, but remain unverified manual claims. " + (humanApproved ? "Your local approval was recorded; this does not promote, install, or deploy the model." : "No approval recorded. ") + "This is not proof of model improvement; actual benchmark artifacts and independent verification are still required before any release decision."
      : "The candidate failed one or more gates: " + failedGates.join(", ") + "."));
});
render();
