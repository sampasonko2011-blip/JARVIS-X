const MAX_INPUT_ITEMS = 64;
const MAX_TOOL_ARGUMENT_CHARS = 16_000;
const MAX_TOOL_OUTPUT_CHARS = 20_000;
const MAX_MODEL_CALLS = 2;
const MAX_TOOL_CALLS = 1;

function fail(code) { throw new TypeError(code); }

function extractText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

function normalizeToolOutput(receipt) {
  const safe = { status: receipt?.status ?? "rejected", code: receipt?.code ?? null };
  if (receipt?.status === "succeeded") safe.result = receipt.result;
  const output = JSON.stringify(safe);
  return output.length <= MAX_TOOL_OUTPUT_CHARS
    ? output
    : JSON.stringify({ status: "failed", code: "tool_output_too_large" });
}

/** Bounded Responses function-call loop. All tool execution is delegated to a sealed registry. */
export async function executeResponsesToolLoop(options = {}) {
  const { invokeResponse, registry, initialInput, instructions, context } = options;
  if (typeof invokeResponse !== "function") fail("responses_tool_invoke_missing");
  if (!registry || typeof registry.toOpenAITools !== "function" ||
      typeof registry.resolveToolName !== "function" || typeof registry.execute !== "function") fail("responses_tool_registry_invalid");
  if (typeof instructions !== "string" || !instructions.trim()) fail("responses_tool_instructions_invalid");
  let input = typeof initialInput === "string" ? [{ role: "user", content: initialInput }]
    : Array.isArray(initialInput) ? [...initialInput] : null;
  if (!input || input.length < 1 || input.length > MAX_INPUT_ITEMS) fail("responses_tool_input_invalid");
  const tools = registry.toOpenAITools();
  if (!Array.isArray(tools) || tools.length > 16) fail("responses_tool_registry_too_large");
  let modelCalls = 0;
  let toolCalls = 0;
  const capabilitiesUsed = [];
  while (modelCalls < MAX_MODEL_CALLS) {
    const canCallTool = tools.length > 0 && toolCalls < MAX_TOOL_CALLS && modelCalls === 0;
    const response = await invokeResponse({
      instructions, input, tools: canCallTool ? tools : [],
      parallel_tool_calls: false, store: false
    });
    modelCalls++;
    if (!response || response.status !== "completed") fail("responses_tool_model_incomplete");
    const output = Array.isArray(response.output) ? response.output : [];
    const calls = output.filter(item => item?.type === "function_call");
    if (calls.length === 0) {
      const answer = extractText(response);
      if (!answer) fail("responses_tool_final_output_empty");
      return Object.freeze({ answer, modelCalls, toolCalls, capabilitiesUsed: Object.freeze([...capabilitiesUsed]) });
    }
    const outputs = [];
    for (const call of calls) {
      const callId = typeof call.call_id === "string" && call.call_id.length > 0 && call.call_id.length <= 200 ? call.call_id : "";
      if (!callId) fail("responses_tool_call_id_invalid");
      let receipt;
      if (calls.length !== 1) {
        receipt = { status: "rejected", code: "parallel_tool_calls_not_supported" };
      } else if (!canCallTool || modelCalls >= MAX_MODEL_CALLS || toolCalls >= MAX_TOOL_CALLS) {
        receipt = { status: "rejected", code: "tool_call_limit_exceeded" };
      } else {
        toolCalls++;
        const capabilityName = registry.resolveToolName(call.name);
        if (!capabilityName) {
          receipt = { status: "rejected", code: "capability_not_registered" };
        } else if (typeof call.arguments !== "string" || call.arguments.length > MAX_TOOL_ARGUMENT_CHARS) {
          receipt = { status: "rejected", code: "tool_arguments_invalid" };
        } else {
          let args;
          try { args = JSON.parse(call.arguments); }
          catch { receipt = { status: "rejected", code: "tool_arguments_invalid" }; }
          if (args !== undefined) {
            receipt = await registry.execute({ name: capabilityName, input: args, context });
            if (receipt?.status === "succeeded" && !capabilitiesUsed.includes(capabilityName)) capabilitiesUsed.push(capabilityName);
          }
        }
      }
      outputs.push({ type: "function_call_output", call_id: callId, output: normalizeToolOutput(receipt) });
    }
    input = [...input, ...output, ...outputs];
    if (input.length > MAX_INPUT_ITEMS) fail("responses_tool_input_limit_exceeded");
  }
  fail("responses_tool_loop_limit_exceeded");
}
