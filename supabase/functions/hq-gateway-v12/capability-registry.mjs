const NAME_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
const SAFE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_DEPTH = 8;
const MAX_NODES = 2_000;
const MAX_STRING_CHARS = 12_000;
const MAX_RESULT_CHARS = 24_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CONSEQUENCE_LEVELS = new Set(["read", "reversible", "consequential"]);

function fail(code) {
  throw new TypeError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateDataTree(value, options = {}) {
  const { maxDepth = MAX_DEPTH, maxNodes = MAX_NODES, maxStringChars = MAX_STRING_CHARS } = options;
  let nodes = 0;
  const seen = new Set();
  function visit(item, depth) {
    nodes++;
    if (nodes > maxNodes) fail("capability_data_too_complex");
    if (depth > maxDepth) fail("capability_data_too_deep");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") {
      if (item.length > maxStringChars) fail("capability_string_too_large");
      return;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("capability_number_invalid");
      return;
    }
    if (typeof item !== "object") fail("capability_data_type_invalid");
    if (seen.has(item)) fail("capability_circular_data");
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
    } else {
      if (!isPlainObject(item)) fail("capability_object_prototype_invalid");
      for (const [key, child] of Object.entries(item)) {
        if (!SAFE_KEY_PATTERN.test(key) || DANGEROUS_KEYS.has(key)) fail("capability_object_key_invalid");
        visit(child, depth + 1);
      }
    }
    seen.delete(item);
  }
  visit(value, 0);
}

function normalizeSchema(schema, depth = 0) {
  if (depth > 6 || !isPlainObject(schema)) fail("capability_schema_invalid");
  const allowed = new Set(["type", "required", "properties", "items", "enum", "additionalProperties", "maxLength", "maxItems", "minimum", "maximum"]);
  for (const key of Object.keys(schema)) if (!allowed.has(key)) fail("capability_schema_keyword_unsupported");
  if (!["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type)) fail("capability_schema_type_invalid");
  if (schema.type === "object") {
    if (!isPlainObject(schema.properties ?? {})) fail("capability_schema_properties_invalid");
    const properties = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!SAFE_KEY_PATTERN.test(key) || DANGEROUS_KEYS.has(key)) fail("capability_schema_key_invalid");
      properties[key] = normalizeSchema(child, depth + 1);
    }
    const required = schema.required ?? [];
    if (!Array.isArray(required) || required.some(key => typeof key !== "string" || !Object.hasOwn(properties, key))) fail("capability_schema_required_invalid");
    if (new Set(required).size !== Object.keys(properties).length) fail("capability_schema_all_properties_must_be_required");
    if (schema.additionalProperties !== false) fail("capability_schema_must_be_closed");
    return Object.freeze({ type: "object", properties: Object.freeze(properties), required: Object.freeze([...new Set(required)]), additionalProperties: false });
  }
  if (schema.type === "array") {
    if (!Number.isInteger(schema.maxItems) || schema.maxItems < 0 || schema.maxItems > 500) fail("capability_schema_array_limit_invalid");
    return Object.freeze({ type: "array", items: normalizeSchema(schema.items, depth + 1), maxItems: schema.maxItems });
  }
  const normalized = { type: schema.type };
  if (schema.type === "string") {
    if (schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || schema.maxLength < 0 || schema.maxLength > MAX_STRING_CHARS)) fail("capability_schema_string_limit_invalid");
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.some(v => typeof v !== "string"))) fail("capability_schema_enum_invalid");
    if (schema.maxLength !== undefined) normalized.maxLength = schema.maxLength;
    if (schema.enum !== undefined) normalized.enum = Object.freeze([...new Set(schema.enum)]);
  } else if (schema.type === "number" || schema.type === "integer") {
    if (schema.minimum !== undefined && !Number.isFinite(schema.minimum)) fail("capability_schema_minimum_invalid");
    if (schema.maximum !== undefined && !Number.isFinite(schema.maximum)) fail("capability_schema_maximum_invalid");
    if (schema.minimum !== undefined && schema.maximum !== undefined && schema.minimum > schema.maximum) fail("capability_schema_range_invalid");
    if (schema.minimum !== undefined) normalized.minimum = schema.minimum;
    if (schema.maximum !== undefined) normalized.maximum = schema.maximum;
  }
  return Object.freeze(normalized);
}

function validateAgainstSchema(value, schema, path = "input") {
  if (schema.type === "object") {
    if (!isPlainObject(value)) fail("capability_schema_object_expected_" + path);
    for (const required of schema.required) if (!Object.hasOwn(value, required)) fail("capability_schema_required_" + path + "_" + required);
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) fail("capability_schema_additional_property_" + path + "_" + key);
      validateAgainstSchema(child, schema.properties[key], path + "_" + key);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > schema.maxItems) fail("capability_schema_array_invalid_" + path);
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, path + "_" + index));
    return;
  }
  if (schema.type === "null") {
    if (value !== null) fail("capability_schema_null_expected_" + path);
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string" || (schema.maxLength !== undefined && value.length > schema.maxLength)) fail("capability_schema_string_invalid_" + path);
    if (schema.enum && !schema.enum.includes(value)) fail("capability_schema_enum_mismatch_" + path);
    return;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") fail("capability_schema_boolean_invalid_" + path);
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value)) ||
      (schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) {
    fail("capability_schema_numeric_invalid_" + path);
  }
}

function boundedJson(value, maxChars, code) {
  validateDataTree(value);
  const json = JSON.stringify(value);
  if (json.length > maxChars) fail(code);
  return json;
}

function freezeDefinition(definition) {
  if (!isPlainObject(definition)) fail("capability_definition_invalid");
  const { name, description, inputSchema, permission, consequence, timeoutMs, handler } = definition;
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) fail("capability_name_invalid");
  if (typeof description !== "string" || !description.trim() || description.length > 240) fail("capability_description_invalid");
  if (typeof permission !== "string" || !NAME_PATTERN.test(permission)) fail("capability_permission_invalid");
  if (!CONSEQUENCE_LEVELS.has(consequence)) fail("capability_consequence_invalid");
  if (typeof handler !== "function") fail("capability_handler_missing");
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > MAX_TIMEOUT_MS) fail("capability_timeout_invalid");
  return Object.freeze({
    name,
    description: description.trim(),
    inputSchema: normalizeSchema(inputSchema),
    permission,
    consequence,
    timeoutMs: timeout,
    handler
  });
}

function makeReceipt(fields) {
  return Object.freeze({
    receiptVersion: 1,
    ...fields
  });
}

/**
 * Explicit, in-memory capability registry.
 * It does not discover tools, grant permissions, persist state, or call a network.
 */
export function createCapabilityRegistry(options = {}) {
  const definitions = new Map();
  const permissionCheck = options.permissionCheck ?? (() => false);
  const approvalCheck = options.approvalCheck ?? (() => false);
  const clock = options.clock ?? (() => Date.now());
  const maxConcurrent = options.maxConcurrent ?? 4;
  if (typeof permissionCheck !== "function" || typeof approvalCheck !== "function" || typeof clock !== "function") fail("capability_policy_invalid");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 32) fail("capability_concurrency_invalid");
  let active = 0;
  let sealed = false;

  return Object.freeze({
    register(definition) {
      if (sealed) fail("capability_registry_sealed");
      const normalized = freezeDefinition(definition);
      if (definitions.has(normalized.name)) fail("capability_duplicate_name");
      definitions.set(normalized.name, normalized);
      return Object.freeze({ name: normalized.name, permission: normalized.permission, consequence: normalized.consequence });
    },
    seal() {
      sealed = true;
      return Object.freeze({ sealed: true, capabilityCount: definitions.size });
    },
    describe() {
      return Object.freeze([...definitions.values()].map(item => Object.freeze({
        name: item.name,
        description: item.description,
        permission: item.permission,
        consequence: item.consequence,
        timeoutMs: item.timeoutMs,
        inputSchema: item.inputSchema
      })));
    },
    toOpenAITools() {
      const names = new Set();
      return Object.freeze([...definitions.values()].map(item => {
        // Responses function names use a conservative portable identifier.
        const toolName = item.name.replaceAll(".", "_");
        if (names.has(toolName)) fail("capability_tool_name_collision");
        names.add(toolName);
        return Object.freeze({
          type: "function",
          name: toolName,
          description: item.description,
          parameters: item.inputSchema,
          strict: true
        });
      }));
    },
    resolveToolName(toolName) {
      if (typeof toolName !== "string") return null;
      const matches = [...definitions.values()].filter(item => item.name.replaceAll(".", "_") === toolName);
      return matches.length === 1 ? matches[0].name : null;
    },
    async execute(request) {
      const startedAt = clock();
      const base = { capability: request?.name ?? null, startedAt };
      if (!sealed) return makeReceipt({ ...base, status: "rejected", code: "capability_registry_not_sealed" });
      if (!isPlainObject(request) || typeof request.name !== "string" || !NAME_PATTERN.test(request.name)) {
        return makeReceipt({ ...base, status: "rejected", code: "capability_request_invalid" });
      }
      const definition = definitions.get(request.name);
      if (!definition) return makeReceipt({ ...base, status: "rejected", code: "capability_not_registered" });
      if (active >= maxConcurrent) return makeReceipt({ ...base, status: "rejected", code: "capability_concurrency_limit" });
      try {
        boundedJson(request.input, 32_000, "capability_input_too_large");
        validateAgainstSchema(request.input, definition.inputSchema);
      } catch (error) {
        return makeReceipt({ ...base, status: "rejected", code: error instanceof Error ? error.message : "capability_input_invalid" });
      }
      const context = isPlainObject(request.context) ? request.context : {};
      if (typeof context.userId !== "string" || !context.userId.trim() || typeof context.requestId !== "string" || !context.requestId.trim()) {
        return makeReceipt({ ...base, status: "rejected", code: "capability_execution_context_missing" });
      }
      let permitted = false;
      try {
        permitted = await permissionCheck({ userId: context.userId, permission: definition.permission, capability: definition.name, consequence: definition.consequence });
      } catch {
        return makeReceipt({ ...base, status: "rejected", code: "capability_permission_check_failed" });
      }
      if (permitted !== true) return makeReceipt({ ...base, status: "rejected", code: "capability_permission_denied" });
      if (definition.consequence === "consequential") {
        if (typeof request.approvalToken !== "string" || !request.approvalToken.trim()) {
          return makeReceipt({ ...base, status: "approval_required", code: "capability_explicit_approval_required" });
        }
        let approved = false;
        try {
          approved = await approvalCheck({
            approvalToken: request.approvalToken,
            userId: context.userId,
            requestId: context.requestId,
            capability: definition.name,
            input: request.input
          });
        } catch {
          return makeReceipt({ ...base, status: "rejected", code: "capability_approval_check_failed" });
        }
        if (approved !== true) return makeReceipt({ ...base, status: "rejected", code: "capability_approval_invalid" });
      }
      // Recheck after async policy evaluation to prevent concurrent requests
      // from racing past the configured active-handler limit.
      if (active >= maxConcurrent) return makeReceipt({ ...base, status: "rejected", code: "capability_concurrency_limit" });
      active++;
      let timer;
      const controller = new AbortController();
      try {
        const handlerExecution = Promise.resolve().then(() => definition.handler(Object.freeze({
        input: request.input,
        userId: context.userId,
        requestId: context.requestId,
        signal: controller.signal
      })));
      // Keep the concurrency slot occupied until the handler actually settles,
      // even if it ignores AbortSignal after the deadline.
      const trackedExecution = handlerExecution.finally(() => { active--; });
      const result = await Promise.race([
        trackedExecution,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("capability_timeout"));
          }, definition.timeoutMs);
        })
      ]);
        boundedJson(result, MAX_RESULT_CHARS, "capability_result_too_large");
        return makeReceipt({
          ...base,
          status: "succeeded",
          result,
          finishedAt: clock(),
          durationMs: Math.max(0, clock() - startedAt)
        });
      } catch (error) {
        const code = error instanceof Error && error.message === "capability_timeout"
          ? "capability_timeout"
          : error instanceof Error && /^capability_[a-z0-9_]+$/.test(error.message)
          ? error.message
          : "capability_execution_failed";
        return makeReceipt({ ...base, status: "failed", code, finishedAt: clock() });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  });
}
