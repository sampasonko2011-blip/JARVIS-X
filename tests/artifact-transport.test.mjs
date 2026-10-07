import test from "node:test";
import assert from "node:assert/strict";
import { verifyManifest, verifyArtifactBytes, planImport } from "../dist/transport/artifact.js";

const base = {
  schemaVersion: 1,
  artifactId: "jx-verification-pass",
  source: "freebuff",
  branch: "feature/verification-pass",
  commitSha: "fd86fe9da90b5a3e2c6013a2ccfddbd42865bf11",
  parentShas: ["633d42f000000000000000000000000000000000", "c30d8fe000000000000000000000000000000000"],
  createdAt: "2026-10-07T00:00:00Z",
  sizeBytes: 4,
  sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cdd15d6c15b0f00a"
};

test("valid manifest", () => assert.equal(verifyManifest(base).valid, true));
test("reject malformed commit", () => assert.equal(verifyManifest({...base, commitSha:"bad"}).valid, false));
test("verify bytes", () => assert.equal(verifyArtifactBytes(new TextEncoder().encode("test"), base.sha256, 4).valid, true));
test("reject tampered bytes", () => assert.equal(verifyArtifactBytes(new TextEncoder().encode("TEST"), base.sha256, 4).valid, false));
test("safe branch plan", () => assert.equal(planImport(base, "sampasonko2011-blip/JARVIS-X").action, "CREATE_BRANCH"));
test("never force push", () => assert.equal(planImport(base, "sampasonko2011-blip/JARVIS-X", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").forcePush, false));
