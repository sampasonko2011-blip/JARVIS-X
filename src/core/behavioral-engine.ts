export type BehaviorDomain="football"|"academic"|"engineering"|"general";
export interface BehavioralPolicy{domain:BehaviorDomain;maxSentences:number;style:"tactical"|"pedagogical"|"precise"|"neutral";blockedPhrases:string[];}
export interface BehavioralReview{accepted:boolean;text:string;domain:BehaviorDomain;issues:string[];}
const POLICIES:Record<BehaviorDomain,BehavioralPolicy>={
 football:{domain:"football",maxSentences:5,style:"tactical",blockedPhrases:["en tant qu'IA","en tant que modèle de langage","je suis ravi de"]},
 academic:{domain:"academic",maxSentences:12,style:"pedagogical",blockedPhrases:["en tant qu'IA","en tant que modèle de langage"]},
 engineering:{domain:"engineering",maxSentences:10,style:"precise",blockedPhrases:["en tant qu'IA","en tant que modèle de langage","je suis ravi de"]},
 general:{domain:"general",maxSentences:10,style:"neutral",blockedPhrases:["en tant qu'IA","en tant que modèle de langage"]}
};
export function resolveBehaviorDomain(input:{explicitDomain?:BehaviorDomain;context?:string}):BehaviorDomain{if(input.explicitDomain)return input.explicitDomain;const t=(input.context??"").toLowerCase();if(/football|entraînement|match|terrain|tactique/.test(t))return"football";if(/pronote|devoir|contrôle|cours|révision|académique/.test(t))return"academic";if(/code|typescript|swift|architecture|pull request|ci/.test(t))return"engineering";return"general";}
export function reviewResponse(text:string,domain:BehaviorDomain):BehavioralReview{const policy=POLICIES[domain],clean=text.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(),issues:string[]=[];if(!clean)issues.push("empty_response");const lower=clean.toLocaleLowerCase("fr");for(const phrase of policy.blockedPhrases){const normalizedPhrase=phrase.toLocaleLowerCase("fr");if(lower.includes(normalizedPhrase))issues.push("robotic_tic:"+phrase);}const sentences=clean.split(/[.!?]+(?:\s|$)/).filter(x=>x.trim()).length;if(sentences>policy.maxSentences)issues.push("too_many_sentences");if(/(\b.{18,}?\b)(?:\s+\1){2,}/i.test(clean))issues.push("repeated_phrase");return{accepted:issues.length===0,text:clean,domain,issues};}
export function applyBehavioralPolicy(text:string,domain:BehaviorDomain):BehavioralReview{const review=reviewResponse(text,domain);if(!review.accepted)return review;return review;}

export type ExplicitUserState = "normal" | "focus" | "tired" | "stressed";
export interface BehavioralSignals {
  explicitState?: ExplicitUserState;
  deletionEvents?: number;
  observationWindowMinutes?: number;
  academicDeadlinesNext24h?: number;
  trainingSessionsNext24h?: number;
  latestTrainingEndHourLocal?: number;
  importedAt?: string;
  importSource?: string;
}
export interface BehavioralAdaptation {
  mode: "normal" | "focused" | "calm-stepwise";
  reasons: string[];
  workloadEvidence: "not-provided" | "fresh-import" | "stale-or-untrusted";
}
/**
 * Uses only explicit user state and observable interaction/import signals.
 * It never infers a medical or biometric condition.
 */
export function assessBehavioralAdaptation(input: BehavioralSignals): BehavioralAdaptation {
  const reasons: string[] = [];
  const state = input.explicitState ?? "normal";
  if (state === "tired" || state === "stressed") reasons.push("user_selected_" + state);
  const frictionObserved = Number.isInteger(input.deletionEvents)
    && (input.deletionEvents ?? 0) >= 4
    && Number.isFinite(input.observationWindowMinutes)
    && (input.observationWindowMinutes ?? Infinity) <= 20;
  if (frictionObserved) reasons.push("repeated_deletion_interaction_observed");
  let workloadEvidence: BehavioralAdaptation["workloadEvidence"] = "not-provided";
  const hasWorkload = input.academicDeadlinesNext24h !== undefined
    || input.trainingSessionsNext24h !== undefined
    || input.latestTrainingEndHourLocal !== undefined
    || input.importedAt !== undefined
    || input.importSource !== undefined;
  if (hasWorkload) {
    const importedTime = input.importedAt ? Date.parse(input.importedAt) : NaN;
    const fresh = input.importSource === "pronote+football-import"
      && Number.isFinite(importedTime)
      && importedTime <= Date.now() + 5 * 60_000
      && Date.now() - importedTime <= 24 * 60 * 60_000;
    if (!fresh) workloadEvidence = "stale-or-untrusted";
    else {
      workloadEvidence = "fresh-import";
      const deadlineCount = input.academicDeadlinesNext24h;
      const sessionCount = input.trainingSessionsNext24h;
      const lateTraining = Number.isFinite(input.latestTrainingEndHourLocal)
        && (input.latestTrainingEndHourLocal ?? 0) >= 19;
      if (Number.isInteger(deadlineCount) && Number.isInteger(sessionCount)
        && deadlineCount! >= 1 && sessionCount! >= 1 && lateTraining) {
        reasons.push("verified_deadline_and_late_training_overlap");
      }
    }
  }
  const calm = state === "tired" || state === "stressed"
    || frictionObserved || reasons.includes("verified_deadline_and_late_training_overlap");
  return {
    mode: calm ? "calm-stepwise" : state === "focus" ? "focused" : "normal",
    reasons,
    workloadEvidence
  };
}
