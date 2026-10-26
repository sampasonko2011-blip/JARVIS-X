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
export function runSelfAudit(input: SelfAuditInput): SelfAuditResult {
 const reasons: string[] = [], improvementPercent: Record<string,number> = {};
 const signatures=input.recentFailureSignatures??[];
 const circuitBreaker=new Set(signatures).size<signatures.length||(input.consecutiveComparableRetestFailures??0)>=2;
 if(!input.objective.trim()) reasons.push("Missing objective.");
 if(circuitBreaker) reasons.push("Circuit breaker: repeated failure signature or two consecutive comparable retests failed.");
 if(APPROVAL_REQUIRED.has(input.changeClass)&&!input.explicitApproval) reasons.push("Explicit approval is required for this change class.");
 if(!input.comparableRetest) reasons.push("Comparable baseline/retest missing.");
 if(!input.metrics.length) reasons.push("No measurable metrics supplied.");
 const names=new Set<string>(); let improvement=false, regression=false;
 for(const m of input.metrics){
  if(!m.name.trim()||names.has(m.name)){reasons.push("Metric names must be non-empty and unique.");continue;} names.add(m.name);
  if(!Number.isFinite(m.baseline)||!Number.isFinite(m.candidate)){reasons.push("Non-finite metric: "+m.name);continue;}
  const delta=m.direction==="higher"?m.candidate-m.baseline:m.baseline-m.candidate;
  const pct=delta/Math.max(Math.abs(m.baseline),1e-9);
  improvementPercent[m.name]=Math.round(pct*10000)/100;
  if(delta<0) regression=true;
  if(delta>0&&pct>=Math.max(0,m.minimumImprovement??0)) improvement=true;
 }
 if(regression) reasons.push("At least one metric regressed against baseline.");
 if(!improvement) reasons.push("No metric demonstrated a strict improvement meeting its threshold.");
 const failed=input.checks.filter(c=>c.result==="fail"), unknown=input.checks.filter(c=>c.result==="unknown");
 if(failed.length) reasons.push("Failed checks: "+failed.map(c=>c.name).join(", ")+".");
 if(unknown.length) reasons.push("Unknown checks: "+unknown.map(c=>c.name).join(", ")+".");
 if(!input.checks.length) reasons.push("No required checks supplied.");
 if(input.independentChallenge==="fail") reasons.push("Independent challenge failed."); else if(input.independentChallenge==="unknown") reasons.push("Independent challenge unverified.");
 if(input.regressionTests==="fail") reasons.push("Regression tests failed."); else if(input.regressionTests==="unknown") reasons.push("Regression tests unverified.");
 if(input.restartPersistence==="fail") reasons.push("Persistence after restart failed."); else if(input.restartPersistence==="unknown") reasons.push("Persistence after restart unverified.");
 if(input.restartPersistence==="not-applicable"&&/memory|sync|persist/i.test(input.objective)) reasons.push("Memory/sync work cannot waive persistence verification.");
 if(!input.evidence.some(e=>(e.status==="OBSERVED"||e.status==="VALIDATED")&&Boolean(e.source?.trim()))) reasons.push("No sourced OBSERVED/VALIDATED evidence.");
 const hardReject=regression||failed.length>0||input.independentChallenge==="fail"||input.regressionTests==="fail"||input.restartPersistence==="fail";
 if(hardReject) return {decision:"REJECT",status:"REJECTED",circuitBreaker,improvementPercent,reasons,nextAction:"Do not promote. Preserve last known-good version; isolate the failure and require a changed intervention plus independent retest."};
 if(reasons.length) return {decision:"UNPROVEN",status:"UNPROVEN",circuitBreaker,improvementPercent,reasons,nextAction:circuitBreaker?"STOP retries. Record OUTCOME_UNKNOWN for ambiguous side effects, capture a redacted failure packet, and test a different hypothesis.":"Keep candidate inactive. Fill evidence gaps and rerun frozen benchmark, regression, and persistence checks."};
 return {decision:"KEEP",status:"VALIDATED",circuitBreaker:false,improvementPercent,reasons:["All gates passed; measurable improvement and sourced evidence were observed."],nextAction:"Keep as the new candidate baseline, save the evidence packet, and monitor regressions."};
}
