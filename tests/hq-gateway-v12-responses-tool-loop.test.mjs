import test from "node:test";
import assert from "node:assert/strict";
import { executeResponsesToolLoop } from "../supabase/functions/hq-gateway-v12/responses-tool-loop.mjs";
import { createDefaultCapabilityRegistry } from "../supabase/functions/hq-gateway-v12/default-capabilities.mjs";

const context = { userId: "allowlisted-user-fixture", requestId: "request-fixture" };
const instructions = "You are JARVIS-X. Use local tools only when helpful.";

test("Responses loop executes one approved local tool then returns one executive answer", async () => {
  const registry = createDefaultCapabilityRegistry({ enabled: true });
  const requests = [];
  const result = await executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Count the words in: Hi there. Good day.",
    invokeResponse: async request => {
      requests.push(request);
      if (requests.length === 1) return {
        status: "completed", model: "configured-openai-model",
        output: [{
          type: "function_call", call_id: "call-text-1", name: "text_analyze",
          arguments: JSON.stringify({ text: "Hi there. Good day." })
        }]
      };
      return { status: "completed", model: "configured-openai-model", output_text: "The text has 4 words and 2 sentences.", output: [] };
    }
  });
  assert.equal(result.answer, "The text has 4 words and 2 sentences.");
  assert.equal(result.model, "configured-openai-model");
  assert.equal(result.modelCalls, 2);
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(result.capabilitiesUsed, ["text.analyze"]);
  assert.equal(requests[0].tools.length, 1);
  assert.equal(requests[0].parallel_tool_calls, false);
  assert.equal(requests[0].store, false);
  assert.deepEqual(requests[1].tools, []);
  const toolOutput = requests[1].input.at(-1);
  assert.equal(toolOutput.type, "function_call_output");
  assert.equal(toolOutput.call_id, "call-text-1");
  const receipt = JSON.parse(toolOutput.output);
  assert.equal(receipt.status, "succeeded");
  assert.deepEqual(receipt.result, { characters: 19, words: 4, sentences: 2, paragraphs: 1 });
});

test("unregistered function names fail closed and are not executed", async () => {
  const registry = createDefaultCapabilityRegistry({ enabled: true });
  const requests = [];
  const result = await executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Do something",
    invokeResponse: async request => {
      requests.push(request);
      if (requests.length === 1) return {
        status: "completed", model: "configured-openai-model",
        output: [{ type: "function_call", call_id: "call-unknown", name: "delete_everything", arguments: "{}" }]
      };
      return { status: "completed", model: "configured-openai-model", output_text: "I could not run that capability.", output: [] };
    }
  });
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(result.capabilitiesUsed, []);
  assert.deepEqual(JSON.parse(requests[1].input.at(-1).output), {
    status: "rejected", code: "capability_not_registered"
  });
});

test("parallel tool calls are rejected and never dispatched", async () => {
  const registry = createDefaultCapabilityRegistry({ enabled: true });
  let secondCall;
  const result = await executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Analyze text",
    invokeResponse: async request => {
      if (request.tools.length) return {
        status: "completed", model: "configured-openai-model",
        output: [
          { type: "function_call", call_id: "a", name: "text_analyze", arguments: JSON.stringify({ text: "A" }) },
          { type: "function_call", call_id: "b", name: "text_analyze", arguments: JSON.stringify({ text: "B" }) }
        ]
      };
      secondCall = request;
      return { status: "completed", model: "configured-openai-model", output_text: "Parallel calls were rejected.", output: [] };
    }
  });
  assert.equal(result.toolCalls, 0);
  assert.deepEqual(result.capabilitiesUsed, []);
  assert.equal(JSON.parse(secondCall.input.at(-2).output).code, "parallel_tool_calls_not_supported");
  assert.equal(JSON.parse(secondCall.input.at(-1).output).code, "parallel_tool_calls_not_supported");
});

test("loop rejects malformed arguments without dispatching and rejects incomplete model responses", async () => {
  const registry = createDefaultCapabilityRegistry({ enabled: true });
  let secondRequest;
  const result = await executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Analyze",
    invokeResponse: async request => {
      if (request.tools.length) return {
        status: "completed", model: "configured-openai-model",
        output: [{ type: "function_call", call_id: "x", name: "text_analyze", arguments: "{" }]
      };
      secondRequest = request;
      return { status: "completed", model: "configured-openai-model", output_text: "Rejected malformed arguments.", output: [] };
    }
  });
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(result.capabilitiesUsed, []);
  assert.deepEqual(JSON.parse(secondRequest.input.at(-1).output), {
    status: "rejected", code: "tool_arguments_invalid"
  });
  await assert.rejects(executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Analyze",
    invokeResponse: async () => ({ status: "in_progress", model: "configured-openai-model", output: [] })
  }), /responses_tool_model_incomplete/);
});

test("loop rejects missing model identity and empty final output", async () => {
  const registry = createDefaultCapabilityRegistry({ enabled: true });
  await assert.rejects(executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Hi",
    invokeResponse: async () => ({ status: "completed", output_text: "No identity", output: [] })
  }), /responses_tool_model_identity_missing/);
  await assert.rejects(executeResponsesToolLoop({
    registry, context, instructions, initialInput: "Hi",
    invokeResponse: async () => ({ status: "completed", model: "configured-openai-model", output: [] })
  }), /responses_tool_final_output_empty/);
});

test("default capability registry exposes no tools unless explicitly enabled", () => {
  const disabled = createDefaultCapabilityRegistry();
  assert.deepEqual(disabled.describe(), []);
  assert.deepEqual(disabled.toOpenAITools(), []);
  const enabled = createDefaultCapabilityRegistry({ enabled: true });
  assert.deepEqual(enabled.describe().map(item => item.name), ["text.analyze"]);
});
