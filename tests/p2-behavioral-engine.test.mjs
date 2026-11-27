import test from "node:test";import assert from "node:assert/strict";import{resolveBehaviorDomain,reviewResponse}from"../dist/core/behavioral-engine.js";
test("behavioral engine routes domains without overriding explicit choice",()=>{assert.equal(resolveBehaviorDomain({context:"Demain entraînement football"}),"football");assert.equal(resolveBehaviorDomain({context:"Contrôle Pronote"}),"academic");assert.equal(resolveBehaviorDomain({explicitDomain:"engineering",context:"match"}),"engineering");});
test("pre-display review detects robotic tics and excessive length",()=>{assert.ok(!reviewResponse("En tant qu'IA, voici la réponse.", "football").accepted);assert.ok(!reviewResponse(Array(7).fill("Phrase utile.").join(" "),"football").accepted);assert.ok(reviewResponse("Travaille la prise d'information avant contrôle. Puis accélère après ton premier toucher.","football").accepted);});
test("blocked phrase detection is case-insensitive for French text",()=>{for(const text of ["EN TANT QU'IA, voici la réponse.","En Tant Qu'IA, voici la réponse.","JE SUIS RAVI DE vous aider."]){assert.ok(!reviewResponse(text,"football").accepted,`Expected blocked phrase to be detected: ${text}`);}});

import { assessBehavioralAdaptation } from "../dist/core/behavioral-engine.js";
test("behavioral adaptation responds to explicit state without diagnosing the user", () => {
  assert.equal(assessBehavioralAdaptation({ explicitState: "stressed" }).mode, "calm-stepwise");
  assert.equal(assessBehavioralAdaptation({ explicitState: "focus" }).mode, "focused");
  assert.deepEqual(assessBehavioralAdaptation({ explicitState: "normal" }).reasons, []);
});
test("behavioral adaptation detects only a bounded repeated-deletion signal", () => {
  assert.equal(assessBehavioralAdaptation({ deletionEvents: 4, observationWindowMinutes: 20 }).mode, "calm-stepwise");
  assert.equal(assessBehavioralAdaptation({ deletionEvents: 3, observationWindowMinutes: 20 }).mode, "normal");
  assert.equal(assessBehavioralAdaptation({ deletionEvents: 8, observationWindowMinutes: 90 }).mode, "normal");
});
test("workload overlap requires fresh PRONOTE plus football import evidence", () => {
  const importedAt = new Date().toISOString();
  const trusted = { importSource: "pronote+football-import", importedAt, academicDeadlinesNext24h: 1, trainingSessionsNext24h: 1, latestTrainingEndHourLocal: 20 };
  assert.equal(assessBehavioralAdaptation(trusted).mode, "calm-stepwise");
  assert.equal(assessBehavioralAdaptation({ ...trusted, importSource: "manual-unverified" }).mode, "normal");
  assert.equal(assessBehavioralAdaptation({ ...trusted, importedAt: "2020-01-01T00:00:00.000Z" }).workloadEvidence, "stale-or-untrusted");
});
