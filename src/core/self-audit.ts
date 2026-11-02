export type AuditStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";
export type AuditDecision = "KEEP" | "MODIFY" | "REJECT" | "UNPROVEN";
export type ChangeClass = "internal-code" | "external-integration" | "deployment" | "paid-inference" | "destructive";
export interface AuditMetric { name: string; baseline: number; candidate: number; direction: "higher" | "lower"; minimumImprovement?: number; }
export interface AuditCheck { name: string; result: "pass" | "fail" | "unknown"; }
export interface AuditEvidence { claim: string; status: AuditStatus; source?: string; }
export interface SelfAuditInput {
 objective: string; changeClass: ChangeClass; explicitApproval: boolean; comparableRetest: boolean;
 metrics: AuditMetric[]; checks: AuditCheck[]; evidence: AuditEvidence[];
 independentChallenge: "pass" | "fail" | "unknown"; regressionTests: "pass" | "fail" | "unknown";
 restartPersistence: "pass" | "fail" | "unknown" | "not-applicable";
 recentFailureSignatures?: string[]; consecutiveComparableRetestFailures?: number;
}
export interface SelfAuditResult { decision: AuditDecision; status: AuditStatus; circuitBreaker: boolean; improvementPercent: Record<string, number>; reasons: string[]; nextAction: string; }
const APPROVAL_REQUIRED = new Set<ChangeClass>(["external-integration","deployment","paid-inference","destructive"]);
const STATUSES = new Set<AuditStatus>(["OBSERVED","VALIDATED","PROPOSED","UNPROVEN","REJECTED","SUPERSEDED"]);
const CHANGE_CLASSES = new Set<ChangeClass>(["internal-code","external-integration","deployment","paid-inference","destructive"]);
const CHECK_RESULTS = new Set(["pass","fail","unknown"]);
const TRI_STATES = new Set(["pass","fail","unknown"]);
function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Deterministic fail-closed promotion gate. It never executes or promotes a change. */
export function runSelfAudit(input: SelfAuditInput): SelfAuditResult {
 const reasons: string[] = [], improvementPercent: Record<string, number> = {};
 const raw = input as unknown;
 if (!isRecord(raw)) {
  return { decision:"UNPROVEN",status:"UNPROVEN",circuitBreaker:false,improvementPercent,reasons:["Audit input must be an object."],nextAction:"Keep candidate inactive; correct the audit input and rerun." };
 }
 const value = raw as Record<string, unknown>;
 const objective = typeof value.objective === "string" ? value.objective : "";
 const changeClass = value.changeClass;
 const explicitApproval = value.explicitApproval === true;
 const comparableRetest = value.comparableRetest === true;
 const metrics = Array.isArray(value.metrics) ? value.metrics : [];
 const checks = Array.isArray(value.checks) ? value.checks : [];
 const evidence = Array.isArray(value.evidence) ? value.evidence : [];
 const challenge = value.independentChallenge;
 const regressionTests = value.regressionTests;
 const persistence = value.restartPersistence;
 const signatures = Array.isArray(value.recentFailureSignatures) ? value.recentFailureSignatures : [];
 const failureCount = value.consecutiveComparableRetestFailures;
 const malformed: string[] = [];
 if (typeof value.objective !== "string" || !objective.trim()) malformed.push("objective must be a non-empty string");
 if (typeof changeClass !== "string" || !CHANGE_CLASSES.has(changeClass as ChangeClass)) malformed.push("changeClass is invalid");
 if (typeof value.explicitApproval !== "boolean") malformed.push("explicitApproval must be boolean");
 if (typeof value.comparableRetest !== "boolean") malformed.push("comparableRetest must be boolean");
 if (!Array.isArray(value.metrics)) malformed.push("metrics must be an array");
 if (!Array.isArray(value.checks)) malformed.push("checks must be an array");
 if (!Array.isArray(value.evidence)) malformed.push("evidence must be an array");
 if (!TRI_STATES.has(String(challenge))) malformed.push("independentChallenge is invalid");
 if (!TRI_STATES.has(String(regressionTests))) malformed.push("regressionTests is invalid");
 if (!new Set(["pass","fail","unknown","not-applicable"]).has(String(persistence))) malformed.push("restartPersistence is invalid");
 if (value.recentFailureSignatures !== undefined && (!Array.isArray(value.recentFailureSignatures) || signatures.some(s => typeof s !== "string" || !s.trim()))) malformed.push("recentFailureSignatures must contain non-empty strings");
 if (failureCount !== undefined && (!Number.isInteger(failureCount) || (failureCount as number) < 0)) malformed.push("consecutiveComparableRetestFailures must be a non-negative integer");
 const metricNames = new Set<string>();
 for (const item of metrics) {
  if (!isRecord(item)) { malformed.push("each metric must be an object"); continue; }
  const m = item as Record<string, unknown>;
  if (typeof m.name !== "string" || !m.name.trim() || metricNames.has(m.name)) malformed.push("metric names must be non-empty and unique");
  else metricNames.add(m.name);
  if (typeof m.baseline !== "number" || !Number.isFinite(m.baseline) || typeof m.candidate !== "number" || !Number.isFinite(m.candidate)) malformed.push("metric values must be finite numbers");
  if (m.direction !== "higher" && m.direction !== "lower") malformed.push("metric direction must be higher or lower");
  if (m.minimumImprovement !== undefined && (typeof m.minimumImprovement !== "number" || !Number.isFinite(m.minimumImprovement) || m.minimumImprovement < 0)) malformed.push("minimumImprovement must be a finite non-negative number");
 }
 for (const item of checks) {
  if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim() || !CHECK_RESULTS.has(String(item.result))) malformed.push("each check needs a non-empty name and pass/fail/unknown result");
 }
 for (const item of evidence) {
  if (!isRecord(item) || typeof item.claim !== "string" || !item.claim.trim() || typeof item.status !== "string" || !STATUSES.has(item.status as AuditStatus) || (item.source !== undefined && typeof item.source !== "string")) malformed.push("each evidence item needs a claim, valid status, and optional string source");
 }
 const uniqueSignatures = new Set(signatures as string[]);
 const circuitBreaker = uniqueSignatures.size < signatures.length || (typeof failureCount === "number" && failureCount >= 2);
 if (malformed.length) {
  return { decision:"UNPROVEN",status:"UNPROVEN",circuitBreaker,improvementPercent,reasons:[...new Set(malformed)],nextAction:circuitBreaker ? "STOP retries. Preserve last known-good state and investigate a materially different hypothesis." : "Keep candidate inactive; correct malformed input and rerun validation." };
 }
 if (circuitBreaker) reasons.push("Circuit breaker: repeated failure signature or two consecutive comparable retests failed.");
 if (APPROVAL_REQUIRED.has(changeClass as ChangeClass) && !explicitApproval) reasons.push("Explicit approval is required for this change class.");
 if (!comparableRetest) reasons.push("Comparable baseline/retest missing.");
 if (metrics.length === 0) reasons.push("No measurable metrics supplied.");
 let improvement = false, regression = false;
 for (const item of metrics as Record<string, unknown>[]) {
  const name = item.name as string;
  const baseline = item.baseline as number, candidate = item.candidate as number;
  const delta = item.direction === "higher" ? candidate - baseline : baseline - candidate;
  const pct = baseline === 0 ? (delta > 0 ? 100 : delta < 0 ? -100 : 0) : delta / Math.abs(baseline);
  improvementPercent[name] = Math.round(pct * 10000) / 100;
  if (delta < 0) regression = true;
  const threshold = item.minimumImprovement === undefined ? 0 : item.minimumImprovement as number;
  if (delta > 0 && pct >= threshold) improvement = true;
 }
 if (regression) reasons.push("At least one metric regressed against baseline.");
 if (!improvement) reasons.push("No metric demonstrated a strict improvement meeting its threshold.");
 const failed = (checks as Record<string, unknown>[]).filter(c => c.result === "fail");
 const unknown = (checks as Record<string, unknown>[]).filter(c => c.result === "unknown");
 if (failed.length) reasons.push("Failed checks: " + failed.map(c => c.name).join(", ") + ".");
 if (unknown.length) reasons.push("Unknown checks: " + unknown.map(c => c.name).join(", ") + ".");
 if (checks.length === 0) reasons.push("No required checks supplied.");
 if (challenge === "fail") reasons.push("Independent challenge failed.");
 else if (challenge === "unknown") reasons.push("Independent challenge unverified.");
 if (regressionTests === "fail") reasons.push("Regression tests failed.");
 else if (regressionTests === "unknown") reasons.push("Regression tests unverified.");
 if (persistence === "fail") reasons.push("Persistence after restart failed.");
 else if (persistence === "unknown") reasons.push("Persistence after restart unverified.");
 if (persistence === "not-applicable" && /memory|sync|persist/i.test(objective)) reasons.push("Memory/sync work cannot waive persistence verification.");
 if (!(evidence as Record<string, unknown>[]).some(e => (e.status === "OBSERVED" || e.status === "VALIDATED") && typeof e.source === "string" && Boolean((e.source as string).trim()))) reasons.push("No sourced OBSERVED/VALIDATED evidence.");
 const hardReject = regression || failed.length > 0 || challenge === "fail" || regressionTests === "fail" || persistence === "fail";
 if (hardReject) return { decision:"REJECT",status:"REJECTED",circuitBreaker,improvementPercent,reasons,nextAction:"Do not promote. Preserve last known-good version; isolate the failure and require a changed intervention plus independent retest." };
 if (reasons.length) return { decision:"UNPROVEN",status:"UNPROVEN",circuitBreaker,improvementPercent,reasons,nextAction:circuitBreaker ? "STOP retries. Record OUTCOME_UNKNOWN for ambiguous side effects, capture a redacted failure packet, and test a different hypothesis." : "Keep candidate inactive. Fill evidence gaps and rerun frozen benchmark, regression, and persistence checks." };
 return { decision:"KEEP",status:"VALIDATED",circuitBreaker:false,improvementPercent,reasons:["All gates passed; measurable improvement and sourced evidence were observed."],nextAction:"Keep as the new candidate baseline, save the evidence packet, and monitor regressions." };
}
