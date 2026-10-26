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
