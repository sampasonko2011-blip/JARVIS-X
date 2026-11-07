import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalRuntimeEnvironment,
  parseInstalledModelNames,
  parseLocalRunnerArgs,
  runLocalOllama,
  validateLocalModelName
} from "../src/forge/local-ollama-runner.mjs";

test("local runner accepts ordinary installed model identifiers and rejects shell syntax", () => {
  assert.equal(validateLocalModelName("qwen2.5:3b"), true);
  assert.equal(validateLocalModelName("mistral:7b-instruct"), true);
  assert.equal(validateLocalModelName("model; rm -rf /"), false);
  assert.equal(validateLocalModelName("../secret"), false);
});

test("local runner bounds timeouts and rejects unknown arguments", () => {
  assert.deepEqual(parseLocalRunnerArgs(["--model", "qwen2.5:3b"]), {
    model: "qwen2.5:3b", timeoutMs: 60_000, help: false
  });
  assert.throws(() => parseLocalRunnerArgs(["--model", "qwen2.5:3b", "--timeout-ms", "999999"]), /between 1000 and 180000/);
  assert.throws(() => parseLocalRunnerArgs(["--model", "qwen2.5:3b", "--unknown"]), /Unknown argument/);
});

test("child runtime environment drops arbitrary secrets and forces local no-cloud mode", () => {
  const env = buildLocalRuntimeEnvironment({ PATH: "/bin", HOME: "/tmp/home", OPENAI_API_KEY: "must-not-pass", OTHER_SECRET: "must-not-pass" });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OTHER_SECRET, undefined);
  assert.equal(env.OLLAMA_HOST, "127.0.0.1:11434");
  assert.equal(env.OLLAMA_NO_CLOUD, "1");
});

test("installed-model parser ignores header and malformed model names", () => {
  assert.deepEqual(parseInstalledModelNames("NAME ID SIZE MODIFIED AT\nqwen2.5:3b abc 2GB 1 day ago\n../bad x 1GB now\nmistral:7b xyz 4GB now\n"), ["qwen2.5:3b", "mistral:7b"]);
});

test("runner refuses to download missing models and never invokes inference for absent model", () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push({ command, args });
    return { status: 0, stdout: "NAME ID SIZE MODIFIED\nother:1b abc 1GB now\n", stderr: "" };
  };
  assert.throws(() => runLocalOllama({ model: "qwen2.5:3b", prompt: "test", spawn }), /will not download it/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["list"]);
});

test("runner passes prompt as stdin and invokes no shell when the model is already installed", () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "list") return { status: 0, stdout: "NAME ID SIZE MODIFIED\nqwen2.5:3b abc 2GB now\n", stderr: "" };
    return { status: 0, stdout: "local response", stderr: "" };
  };
  const result = runLocalOllama({ model: "qwen2.5:3b", prompt: "hello", spawn });
  assert.equal(result.output, "local response");
  assert.equal(result.verified, false);
  assert.equal(calls[1].command, "ollama");
  assert.deepEqual(calls[1].args, ["run", "qwen2.5:3b"]);
  assert.equal(calls[1].options.input, "hello");
  assert.equal(calls[1].options.shell, undefined);
  assert.equal(calls[1].options.env.OPENAI_API_KEY, undefined);
});

test("runner rejects blank and oversized prompts before starting a process", () => {
  let calls = 0;
  const spawn = () => { calls++; return { status: 0, stdout: "" }; };
  assert.throws(() => runLocalOllama({ model: "qwen2.5:3b", prompt: "  ", spawn }), /must not be empty/);
  assert.throws(() => runLocalOllama({ model: "qwen2.5:3b", prompt: "x".repeat(12001), spawn }), /character limit/);
  assert.equal(calls, 0);
});

import { createLocalVegitoRuntime } from "../hq/local-vegito-runtime.mjs";

function localRegistryFixture() {
  return { agents: [{
    id: "local-engineer", kind: "local-specialist", roles: ["engineering"],
    activation: "ENABLED", status: "VALIDATED", independenceGroup: "local-engineering",
    allowedTools: ["local_model_inference"], dataAccessScope: "task-fixture-only"
  }] };
}

test("local Vegito adapter uses installed local Ollama and one independently verified synthesis", async () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "list") return { status: 0, stdout: "NAME ID SIZE MODIFIED\\nqwen2.5:3b abc 2GB now\\n", stderr: "" };
    return { status: 0, stdout: "one executive answer", stderr: "" };
  };
  const runtime = createLocalVegitoRuntime({
    model: "qwen2.5:3b", registry: localRegistryFixture(), spawn,
    authorize: async () => true,
    verify: async result => typeof result?.output?.text === "string",
    verifySynthesis: async answer => answer === "one executive answer"
  });
  const result = await runtime.run({
    objective: "Inspect a harmless fixture",
    stages: [{ id: "engineering", agentId: "local-engineer", role: "engineering", tool: "local_model_inference" }]
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.specialistRuns, 1);
  assert.equal(result.executive.synthesisCount, 1);
  assert.equal(calls.filter(call => call.args[0] === "run").length, 2);
  assert.equal(calls.every(call => call.options.env.OLLAMA_NO_CLOUD === "1"), true);
  assert.equal(calls.every(call => call.options.env.OPENAI_API_KEY === undefined), true);
});

test("local Vegito adapter refuses to download a missing model", async () => {
  const calls = [];
  const runtime = createLocalVegitoRuntime({
    model: "qwen2.5:3b", registry: localRegistryFixture(),
    spawn: (command, args) => {
      calls.push(args);
      return { status: 0, stdout: "NAME ID SIZE MODIFIED\\nother:1b abc 1GB now\\n", stderr: "" };
    },
    authorize: async () => true, verify: async () => true, verifySynthesis: async () => true
  });
  const result = await runtime.run({
    objective: "Do not download models",
    stages: [{ id: "engineering", agentId: "local-engineer", role: "engineering", tool: "local_model_inference" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["list"]);
});

test("local Vegito adapter requires independent host authorization and verifiers", () => {
  assert.throws(() => createLocalVegitoRuntime({ model: "qwen2.5:3b" }), /authorization and independent/);
});
