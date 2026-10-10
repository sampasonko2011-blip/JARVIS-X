# Capability Scout: Composio, App Atlas, and Providers

## Objective

Avoid defaulting to the tools already visible in a conversation. Discover the best available capability for the actual task, then verify it can be used before planning around it.

## Scout order

1. **Classify the need:** repository/code, web research, knowledge retrieval, document editing, communications, calendar, analytics, image/video, memory, or deployment.
2. **Inspect first-party and installed tools:** prefer a dedicated connector when it directly supports the user's requested resource or action.
3. **Search Composio:** query the specific use case and relevant toolkit; use the returned tool slugs and schemas only. Never fabricate slugs, parameters, or connection status.
4. **Inspect App Atlas:** search the relevant category/keywords for complementary ChatGPT/Claude apps. An app directory listing is discovery evidence, not proof the app is installed or authenticated.
5. **Check connection and permission state:** discover whether the toolkit has an active connection and whether the selected action has the required scope.
6. **Inspect exact schemas:** retrieve tool schemas for unfamiliar actions before execution. For multi-step operations, identify prerequisites and dependent outputs.
7. **Choose a minimal capability graph:** include only capabilities that add a distinct function. Avoid tool sprawl and duplicate calls.
8. **Execute and verify:** capture the action response, inspect resulting state, and distinguish errors from empty results.
9. **Fallback:** if a tool is missing or disconnected, state the precise blocker; only then offer a connection request or manual alternative.
10. **Record the result:** tool used, reason selected, observed result, failure, and whether an independent state check confirmed it.

## Tool-state vocabulary

- `DISCOVERED`: catalog/search returned the capability.
- `CONNECTED`: account or toolkit connection reports active.
- `AUTHORIZED`: required scope/permission is available.
- `INVOKED`: action call was made.
- `EXECUTED`: provider reports the action ran.
- `VERIFIED`: independent read-back or test confirms the intended state.
- `BLOCKED`: missing permission, connection, schema, or service.
- `UNPROVEN`: no sufficient verification evidence.

Never collapse these states into a single “available” label.

## Composio usage rules

- Use `COMPOSIO_SEARCH_TOOLS` before calling a Composio tool for a new use case.
- Supply `queries` as an array of concise, complete English use cases and always follow the returned session instructions.
- Use only exact tool slugs returned by search; fetch their schemas with `COMPOSIO_GET_TOOL_SCHEMAS` before executing unfamiliar tools.
- Use multi-execute only for independent operations; preserve dependencies in sequential calls.
- If a result is unexpectedly empty or incorrect, verify arguments and connection state; use the available feedback action when the failure is actionable.
- Do not leak credentials or private identifiers into search descriptions, memory, logs, or repository files.
- For actions that create, send, delete, publish, merge, purchase, or otherwise change external state, verify the user's authorization covers the exact action.

## App Atlas usage rules

- Search the most relevant category and terms rather than making a broad, unbounded catalog query.
- Record app name, stated function, platform, and whether the app is merely listed or actually connected.
- If no result is returned, report “no match found in this query,” not “no app exists.”
- Do not install/connect apps without the user's explicit action.

## Provider/model routing

A model is a candidate until its task-specific performance is measured. Track separate scores for reasoning, coding, research, critique, multimodal work, cost, latency, availability, and failure rate. Avoid a single universal score when evidence is task-specific. Keep baseline and candidate evaluations blind where practical and retest on held-out tasks.

## Privacy and memory boundaries

- Persist only durable, useful context and safe metadata.
- Prefer pointers and provenance over copying full sensitive documents.
- Respect each source's permissions and terms; do not assume a connector grants universal access.
- No automatic ingestion of all connected accounts should be enabled without a specific, scoped design and user authorization.
