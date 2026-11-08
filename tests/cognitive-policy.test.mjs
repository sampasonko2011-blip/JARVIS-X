import test from "node:test";
import assert from "node:assert/strict";
import { selectSampling } from "../hq/cognitive-policy.js";

test("precision cues work in English and French, including accents", () => {
  for (const input of [
    "Debug this code",
    "Il y a une erreur dans mon script",
    "Vérifie la sécurité",
    "Fais un audit",
    "Peux-tu tester cette architecture ?"
  ]) {
    assert.equal(selectSampling(input).mode, "precision", input);
  }
});

test("creative cues work in English and French, including accents", () => {
  for (const input of [
    "Imagine a new story",
    "J'ai une idée de design",
    "Écris un concept créatif",
    "Invente une histoire"
  ]) {
    assert.equal(selectSampling(input).mode, "creative", input);
  }
});

test("precision takes priority for mixed creative and technical requests", () => {
  assert.equal(selectSampling("Imagine and design a new script, then test it").mode, "precision");
});

test("ordinary conversation uses balanced sampling", () => {
  assert.equal(selectSampling("Tell me about your day").mode, "balanced");
});
