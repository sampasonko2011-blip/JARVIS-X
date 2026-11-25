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
export function reviewResponse(text:string,domain:BehaviorDomain):BehavioralReview{const policy=POLICIES[domain],clean=text.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(),issues:string[]=[];if(!clean)issues.push("empty_response");const lower=clean.toLocaleLowerCase("fr");for(const phrase of policy.blockedPhrases)if(lower.includes(phrase))issues.push("robotic_tic:"+phrase);const sentences=clean.split(/[.!?]+(?:\s|$)/).filter(x=>x.trim()).length;if(sentences>policy.maxSentences)issues.push("too_many_sentences");if(/(\b.{18,}?\b)(?:\s+\1){2,}/i.test(clean))issues.push("repeated_phrase");return{accepted:issues.length===0,text:clean,domain,issues};}
export function applyBehavioralPolicy(text:string,domain:BehaviorDomain):BehavioralReview{const review=reviewResponse(text,domain);if(!review.accepted)return review;return review;}
