export type AuditStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";
export type AuditDecision = "KEEP" | "MODIFY" | "REJECT" | "UNPROVEN";
export type ChangeClass = "internal-code" | "external-integration" | "deployment" | "paid-inference" | "destructive";
export type EvaluationScope = "runtime-contract" | "reasoning-quality" | "memory-quality" | "fusion-quality";
export type ExecutionMode = "deterministic" | "mock" | "authenticated-e2e" | "local-model" | "live-provider";

export interface AuditMetric {
  name: string;
  baseline: number;
  candidate: number;
  direction: "higher" | "lower";
  minimumImprovement?: number;
}
export interface AuditCheck { name: string; result: "pass" | "fail" | "unknown"; }
export interface AuditEvidence {
  claim: string;
  status: AuditStatus;
  source?: string;
  sourceHash?: string;
  revision?: string;
}
export interface EvaluationProvenance {
  scope: EvaluationScope;
  executionMode: ExecutionMode;
  baselineRunId: string;
  candidateRunId: string;
  baselineRevision: string;
  candidateRevision: string;
  taskSetHash: string;
  holdoutSetHash: string;
  environmentHash: string;
  protocolHash: string;
  rubricVersion: string;
  paired: boolean;
  holdoutSampleCount: number;
  leakageCheck: "pass" | "fail" | "unknown";
  independentGrader: string;
  primaryMetric: string;
  primaryImprovementLowerBound: number;
}
export interface CostEvidence {
  known: boolean;
  currency: string;
  actual: number | null;
  ceiling: number;
}
export interface RecentFailure { signature: string; interventionId: string; }
export interface SelfAuditInput {
  objective: string;
  changeClass: ChangeClass;
  explicitApproval: boolean;
  comparableRetest: boolean;
  metrics: AuditMetric[];
  checks: AuditCheck[];
  evidence: AuditEvidence[];
  independentChallenge: "pass" | "fail" | "unknown";
  regressionTests: "pass" | "fail" | "unknown";
  restartPersistence: "pass" | "fail" | "unknown" | "not-applicable";
  evaluation?: EvaluationProvenance;
  cost?: CostEvidence;
  liveProviderCalls?: number;
  recentFailures?: RecentFailure[];
  recentFailureSignatures?: string[];
  consecutiveComparableRetestFailures?: number;
}
export interface SelfAuditResult {
  decision: AuditDecision;
  status: AuditStatus;
  circuitBreaker: boolean;
  improvementPercent: Record<string, number | null>;
  metricDeltas: Record<string, number>;
  reasons: string[];
  nextAction: string;
}
const APPROVAL_REQUIRED = new Set<ChangeClass>(["external-integration", "deployment", "paid-inference", "destructive"]);
const STATUSES = new Set<AuditStatus>(["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN", "REJECTED", "SUPERSEDED"]);
const CHANGE_CLASSES = new Set<ChangeClass>(["internal-code", "external-integration", "deployment", "paid-inference", "destructive"]);
const SCOPES = new Set<EvaluationScope>(["runtime-contract", "reasoning-quality", "memory-quality", "fusion-quality"]);
const MODES = new Set<ExecutionMode>(["deterministic", "mock", "authenticated-e2e", "local-model", "live-provider"]);
const CHECK_RESULTS = new Set(["pass", "fail", "unknown"]);
const TRI_STATES = new Set(["pass", "fail", "unknown"]);
const REQUIRED_METRICS: Record<EvaluationScope, string[]> = {
  "runtime-contract": ["correctness", "safety", "latency", "cost"],
  "reasoning-quality": ["accuracy", "groundedness", "instruction_adherence", "safety", "latency", "cost"],
  "memory-quality": ["retrieval_precision", "freshness", "tenant_isolation", "deletion_correctness", "latency", "cost"],
  "fusion-quality": ["accuracy", "groundedness", "instruction_adherence", "safety", "tool_correctness", "verification_precision", "latency", "cost"]
};
const REQUIRED_CHECKS: Record<EvaluationScope, string[]> = {
  "runtime-contract": ["build", "unit-tests", "regression", "security", "privacy", "cost-guard"],
  "reasoning-quality": ["benchmark", "holdout", "independent-grader", "leakage-check", "safety", "cost-guard"],
  "memory-quality": ["restart-persistence", "tenant-isolation", "consent", "deletion", "holdout", "cost-guard"],
  "fusion-quality": ["benchmark", "holdout", "independent-grader", "leakage-check", "tool-correctness", "verification", "safety", "cost-guard"]
};
const PRIMARY_METRIC: Record<EvaluationScope, string> = {
  "runtime-contract": "correctness",
  "reasoning-quality": "accuracy",
  "memory-quality": "retrieval_precision",
  "fusion-quality": "accuracy"
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function result(
  decision: AuditDecision,
  circuitBreaker: boolean,
  improvementPercent: Record<string, number | null>,
  metricDeltas: Record<string, number>,
  reasons: string[],
  nextAction: string
): SelfAuditResult {
  return {
    decision,
    status: decision === "KEEP" ? "VALIDATED" : decision === "MODIFY" ? "PROPOSED" : decision === "REJECT" ? "REJECTED" : "UNPROVEN",
    circuitBreaker,
    improvementPercent,
    metricDeltas,
    reasons,
    nextAction
  };
}
/** Deterministic evidence-backed promotion gate. It never executes, approves, merges or deploys a candidate. */
export function runSelfAudit(input: SelfAuditInput): SelfAuditResult {
  const improvementPercent: Record<string, number | null> = {};
  const metricDeltas: Record<string, number> = {};
  if (!isRecord(input)) {
    return result("UNPROVEN", false, improvementPercent, metricDeltas, ["Audit input must be an object."], "Keep candidate inactive; correct the audit input and rerun.");
  }
  const value = input as unknown as Record<string, unknown>;
  const malformed: string[] = [];
  const reasons: string[] = [];
  const objective = value.objective;
  const changeClass = value.changeClass;
  const evaluation = value.evaluation;
  const metrics = value.metrics;
  const checks = value.checks;
  const evidence = value.evidence;
  const failures = value.recentFailures;
  const legacySignatures = value.recentFailureSignatures;
  const failureCount = value.consecutiveComparableRetestFailures;

  if (!nonEmpty(objective)) malformed.push("objective must be a non-empty string");
  if (!nonEmpty(changeClass) || !CHANGE_CLASSES.has(changeClass as ChangeClass)) malformed.push("changeClass is invalid");
  if (typeof value.explicitApproval !== "boolean") malformed.push("explicitApproval must be boolean");
  if (typeof value.comparableRetest !== "boolean") malformed.push("comparableRetest must be boolean");
  if (!Array.isArray(metrics)) malformed.push("metrics must be an array");
  if (!Array.isArray(checks)) malformed.push("checks must be an array");
  if (!Array.isArray(evidence)) malformed.push("evidence must be an array");
  if (!TRI_STATES.has(String(value.independentChallenge))) malformed.push("independentChallenge is invalid");
  if (!TRI_STATES.has(String(value.regressionTests))) malformed.push("regressionTests is invalid");
  if (!new Set(["pass", "fail", "unknown", "not-applicable"]).has(String(value.restartPersistence))) malformed.push("restartPersistence is invalid");
  if (!isRecord(evaluation)) malformed.push("evaluation provenance is required");
  if (!isRecord(value.cost)) malformed.push("cost evidence is required");
  if (value.liveProviderCalls !== undefined && (!Number.isInteger(value.liveProviderCalls) || (value.liveProviderCalls as number) < 0)) malformed.push("liveProviderCalls must be a non-negative integer");
  if (failureCount !== undefined && (!Number.isInteger(failureCount) || (failureCount as number) < 0)) malformed.push("consecutiveComparableRetestFailures must be a non-negative integer");

  const metricNames = new Set<string>();
  if (Array.isArray(metrics)) for (const item of metrics) {
    if (!isRecord(item)) { malformed.push("each metric must be an object"); continue; }
    const m = item as Record<string, unknown>;
    if (!nonEmpty(m.name) || metricNames.has(m.name)) malformed.push("metric names must be non-empty and unique");
    else metricNames.add(m.name);
    if (typeof m.baseline !== "number" || !Number.isFinite(m.baseline) || typeof m.candidate !== "number" || !Number.isFinite(m.candidate)) malformed.push("metric values must be finite numbers");
    if (m.direction !== "higher" && m.direction !== "lower") malformed.push("metric direction must be higher or lower");
    if (m.minimumImprovement !== undefined && (typeof m.minimumImprovement !== "number" || !Number.isFinite(m.minimumImprovement) || m.minimumImprovement < 0)) malformed.push("minimumImprovement must be finite and non-negative");
  }

  const checkNames = new Set<string>();
  if (Array.isArray(checks)) for (const item of checks) {
    if (!isRecord(item) || !nonEmpty(item.name) || !CHECK_RESULTS.has(String(item.result))) {
      malformed.push("each check needs a non-empty name and pass/fail/unknown result");
      continue;
    }
    if (checkNames.has(item.name)) malformed.push("check names must be unique");
    checkNames.add(item.name);
  }

  if (Array.isArray(evidence)) for (const item of evidence) {
    if (!isRecord(item) || !nonEmpty(item.claim) || typeof item.status !== "string" || !STATUSES.has(item.status as AuditStatus) ||
        (item.source !== undefined && typeof item.source !== "string") ||
        (item.sourceHash !== undefined && typeof item.sourceHash !== "string") ||
        (item.revision !== undefined && typeof item.revision !== "string")) {
      malformed.push("each evidence item needs a claim, valid status, and optional string provenance");
    }
  }

  if (failures !== undefined && (!Array.isArray(failures) || failures.some(item => !isRecord(item) || !nonEmpty(item.signature) || !nonEmpty(item.interventionId)))) {
    malformed.push("recentFailures must contain signature and interventionId strings");
  }
  if (legacySignatures !== undefined && (!Array.isArray(legacySignatures) || legacySignatures.some(s => !nonEmpty(s)))) {
    malformed.push("recentFailureSignatures must contain non-empty strings");
  }

  const failurePairs = Array.isArray(failures)
    ? (failures as RecentFailure[]).map(item => item.signature + "::" + item.interventionId)
    : [];
  const repeatedInterventionFailure = new Set(failurePairs).size < failurePairs.length;
  const legacyRepeatedFailure = Array.isArray(legacySignatures) && new Set(legacySignatures).size < legacySignatures.length;
  const circuitBreaker = repeatedInterventionFailure || legacyRepeatedFailure ||
    (typeof failureCount === "number" && failureCount >= 2);

  if (malformed.length) return result("UNPROVEN", circuitBreaker, improvementPercent, metricDeltas, [...new Set(malformed)], "Keep candidate inactive; correct malformed input and rerun validation.");
  if (circuitBreaker) reasons.push("Circuit breaker: repeated failure under the same intervention or two consecutive comparable retest failures.");

  const evalData = evaluation as Record<string, unknown>;
  const scope = evalData.scope;
  const mode = evalData.executionMode;
  if (!nonEmpty(scope) || !SCOPES.has(scope as EvaluationScope)) malformed.push("evaluation scope is invalid");
  if (!nonEmpty(mode) || !MODES.has(mode as ExecutionMode)) malformed.push("evaluation executionMode is invalid");
  for (const key of ["baselineRunId", "candidateRunId", "baselineRevision", "candidateRevision", "taskSetHash", "holdoutSetHash", "environmentHash", "protocolHash", "rubricVersion"]) {
    if (!nonEmpty(evalData[key])) malformed.push("evaluation " + key + " is required");
  }
  if (evalData.baselineRunId === evalData.candidateRunId) malformed.push("baseline and candidate run IDs must differ");
  if (evalData.baselineRevision === evalData.candidateRevision) malformed.push("baseline and candidate revisions must differ");
  if (evalData.paired !== true) reasons.push("Evaluation must be a paired comparison.");
  if (!Number.isInteger(evalData.holdoutSampleCount) || (evalData.holdoutSampleCount as number) < 10) reasons.push("Holdout sample count must be at least 10; this is an integrity floor, not statistical power proof.");
  if (evalData.leakageCheck !== "pass") reasons.push("Holdout leakage check must pass.");
  if (!nonEmpty(evalData.independentGrader)) malformed.push("independentGrader description is required");
  if (!nonEmpty(evalData.primaryMetric)) malformed.push("primaryMetric is required");
  if (typeof evalData.primaryImprovementLowerBound !== "number" || !Number.isFinite(evalData.primaryImprovementLowerBound)) malformed.push("primaryImprovementLowerBound must be finite");
  if (malformed.length) return result("UNPROVEN", circuitBreaker, improvementPercent, metricDeltas, [...new Set(malformed)], "Keep candidate inactive; correct evaluation provenance and rerun.");

  const typedScope = scope as EvaluationScope;
  const typedMode = mode as ExecutionMode;
  const requiredMetrics = REQUIRED_METRICS[typedScope];
  const requiredChecks = REQUIRED_CHECKS[typedScope];
  const missingMetrics = requiredMetrics.filter(name => !metricNames.has(name));
  const missingChecks = requiredChecks.filter(name => !checkNames.has(name));
  if (missingMetrics.length) reasons.push("Missing required metrics: " + missingMetrics.join(", ") + ".");
  if (missingChecks.length) reasons.push("Missing required checks: " + missingChecks.join(", ") + ".");
  if (evalData.primaryMetric !== PRIMARY_METRIC[typedScope]) reasons.push("Primary metric does not match the declared evaluation scope.");
  if (evalData.holdoutSetHash === evalData.taskSetHash) reasons.push("Task-set and holdout-set hashes must be distinct.");
  if (evalData.paired !== true) reasons.push("Baseline and candidate task pairing is not verified.");
  if (typedScope === "reasoning-quality" || typedScope === "fusion-quality") {
    if (typedMode !== "local-model" && typedMode !== "live-provider") reasons.push("Mock/deterministic execution cannot establish reasoning-quality or fusion-quality gains.");
    if (evalData.independentGrader !== "blind-independent") reasons.push("Quality claims require a blind independent grader.");
  }
  if (typedScope === "memory-quality" && typedMode !== "authenticated-e2e") reasons.push("Memory-quality claims require authenticated end-to-end execution.");
  if (typedMode === "live-provider" && !(typeof value.liveProviderCalls === "number" && value.liveProviderCalls > 0)) reasons.push("Live-provider mode requires an observed provider-call receipt.");
  if (typedMode === "live-provider" && (!APPROVAL_REQUIRED.has(changeClass as ChangeClass) || value.explicitApproval !== true)) reasons.push("Live-provider evaluation requires explicit external-integration or paid-inference approval.");
  if (typedMode !== "live-provider" && (value.liveProviderCalls ?? 0) !== 0) reasons.push("Non-live execution mode cannot report live provider calls.");

  const cost = value.cost as Record<string, unknown>;
  const costKnown = cost.known === true;
  const actual = cost.actual;
  const ceiling = cost.ceiling;
  if (cost.currency !== "USD") reasons.push("Cost currency must be explicitly USD for the configured budget policy.");
  if (!costKnown || typeof actual !== "number" || !Number.isFinite(actual) || actual < 0 ||
      typeof ceiling !== "number" || !Number.isFinite(ceiling) || ceiling < 0) {
    reasons.push("Cost is unknown or malformed; cost evidence is required.");
  } else if (actual > ceiling) {
    reasons.push("Observed cost exceeds the declared ceiling.");
  }

  if (APPROVAL_REQUIRED.has(changeClass as ChangeClass) && value.explicitApproval !== true) reasons.push("Explicit approval is required for this change class.");
  if (value.comparableRetest !== true) reasons.push("Comparable baseline/retest missing.");
  if (value.independentChallenge !== "pass") reasons.push("Independent challenge did not pass.");
  if (value.regressionTests !== "pass") reasons.push("Regression tests did not pass.");
  if (value.restartPersistence === "unknown" || value.restartPersistence === "fail") reasons.push("Persistence after restart is not verified.");
  if (value.restartPersistence === "not-applicable" && /memory|sync|persist/i.test(String(objective))) reasons.push("Memory/sync work cannot waive persistence verification.");

  let hasRegression = false;
  for (const item of metrics as Record<string, unknown>[]) {
    const name = item.name as string;
    const baseline = item.baseline as number;
    const candidate = item.candidate as number;
    const delta = item.direction === "higher" ? candidate - baseline : baseline - candidate;
    metricDeltas[name] = delta;
    improvementPercent[name] = baseline === 0 ? null : Math.round((delta / Math.abs(baseline)) * 10000) / 100;
    if (delta < 0) hasRegression = true;
  }
  if (hasRegression) reasons.push("At least one metric regressed against baseline.");
  const primary = (metrics as Record<string, unknown>[]).find(metric => metric.name === evalData.primaryMetric);
  const primaryDelta = primary ? metricDeltas[String(primary.name)] : Number.NaN;
  const primaryBaseline = primary?.baseline as number | undefined;
  const primaryPct = primary && primaryBaseline !== 0 ? primaryDelta / Math.abs(primaryBaseline) : primaryDelta;
  if (!primary || !Number.isFinite(primaryPct) || primaryPct <= 0 || primaryPct < (evalData.primaryImprovementLowerBound as number)) {
    reasons.push("Primary metric did not demonstrate the declared minimum improvement lower bound.");
  }

  const failed = (checks as AuditCheck[]).filter(check => check.result === "fail");
  const unknown = (checks as AuditCheck[]).filter(check => check.result === "unknown");
  if (failed.length) reasons.push("Failed checks: " + failed.map(check => check.name).join(", ") + ".");
  if (unknown.length) reasons.push("Unknown checks: " + unknown.map(check => check.name).join(", ") + ".");

  const evidenceRows = evidence as AuditEvidence[];
  const currentEvidence = evidenceRows.filter(item =>
    (item.status === "OBSERVED" || item.status === "VALIDATED") &&
    nonEmpty(item.source) && nonEmpty(item.sourceHash) &&
    item.revision === evalData.candidateRevision
  );
  if (currentEvidence.length === 0) reasons.push("No source-backed OBSERVED/VALIDATED evidence matches the candidate revision.");
  const staleEvidence = evidenceRows.some(item =>
    (item.status === "OBSERVED" || item.status === "VALIDATED") &&
    nonEmpty(item.source) && item.revision !== evalData.candidateRevision
  );
  if (staleEvidence) reasons.push("Evidence revision does not match the candidate revision.");

  const costOverrun = costKnown && typeof actual === "number" && typeof ceiling === "number" && actual > ceiling;
  const hardReject = hasRegression || failed.length > 0 || costOverrun ||
    value.independentChallenge === "fail" || value.regressionTests === "fail" || value.restartPersistence === "fail";
  if (hardReject) return result("REJECT", circuitBreaker, improvementPercent, metricDeltas, reasons, "Do not promote. Preserve last known-good version; isolate the failure and require a changed intervention plus independent retest.");
  if (circuitBreaker || reasons.length) {
    const decision: AuditDecision = !circuitBreaker &&
      reasons.every(reason => reason.startsWith("Primary metric did not demonstrate"))
      ? "MODIFY" : "UNPROVEN";
    return result(decision, circuitBreaker, improvementPercent, metricDeltas, reasons,
      circuitBreaker ? "STOP retries. Preserve checkpoint and test a materially changed intervention." :
      decision === "MODIFY" ? "Evidence is usable but target improvement is insufficient; propose a targeted intervention and rerun the frozen evaluation." :
      "Keep candidate inactive. Resolve missing provenance, coverage, cost or verification gates before promotion.");
  }
  return result("KEEP", false, improvementPercent, metricDeltas,
    ["All scope-specific evidence, provenance, cost, holdout, challenge and regression gates passed."],
    "Keep as a validated candidate baseline, preserve the evidence packet and monitor regressions.");
}
