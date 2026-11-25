# P2 — Tool Registry, calendars, Workspace and response policy

## Current scope
- Tool Registry: explicit tool registration, bounded schema validation, zero estimated cost, mandatory invocation consent, separate L3 approval, L4 rejected, in-memory EvidenceLedger records.
- Calendar parser: local `.ics` text only, line unfolding, DTSTART/DTEND/SUMMARY, TZID normalization using IANA Intl time zones, floating times default to Africa/Dakar, UTC Z timestamps, and bounded weekly RRULE expansion.
- Workspace: local file picker for PRONOTE and football ICS, local chronology and advisory conflict display. No file upload/network request is made by this view.
- BehavioralEngine: standalone domain resolver and response quality review for football, academic and engineering contexts.
- Gemini cascade alias: `JARVIS_X_GEMINI_API_KEY` fallback when `GEMINI_API_KEY` is absent; global and per-provider flags remain mandatory.

## Explicit limitations
- RFC 5545 support is a constrained subset, not a full-compliance implementation. No VTIMEZONE parsing, EXDATE/RDATE, BYSETPOS, monthly rules, recurrence overrides, attendee/organizer semantics, or recurrence expansion for non-weekly rules.
- RRULE expansion is bounded and intended for simple weekly schedules. Validate complex exports before relying on them.
- The browser Workspace import is local and read-only; it currently handles one event set per file and provides conflict display, not durable calendar sync.
- No remote PRONOTE URL fetching, session scraping, `pronotepy` automation, ENT credential collection, or server-side account access is implemented.
- Conflict alerts are advisory. No calendar edits or automatic schedule changes occur.
- BehavioralEngine is a standalone policy module and is not yet wired as a mandatory response gate across every local/cloud response or TTS path.
- Suggested study-slot generation and a real L3 approval workflow remain future work.
- ToolRegistry's schema validator is a deliberately small JSON-schema subset; it does not claim full JSON Schema compatibility.

## Provider inventory from source (names only)
- Cascade providers currently defined: Gemini, Groq, Cerebras, NVIDIA, SambaNova, Mistral, GitHub Models.
- Global gate: `JX_ENABLE_PROVIDER_CASCADE=true`.
- Provider gates: `JX_PROVIDER_GEMINI_ENABLED`, `JX_PROVIDER_GROQ_ENABLED`, `JX_PROVIDER_CEREBRAS_ENABLED`, `JX_PROVIDER_NVIDIA_ENABLED`, `JX_PROVIDER_SAMBANOVA_ENABLED`, `JX_PROVIDER_MISTRAL_ENABLED`, `JX_PROVIDER_GITHUB_MODELS_ENABLED`.
- Runtime additionally requires `LIVE_INFERENCE_ENABLED=true`, authorized identity, request consent, and the gateway's budget/rate-limit gates. Keep the financial budget disabled while preserving 0 EUR spend.
- OpenAI is the primary v12 path, separate from this provider cascade.
- Hugging Face, Together and ElevenLabs are not defined as providers in this cascade source. Their secret-name presence alone does not provide integration.
- OpenRouter is not in the provider list and must remain excluded.
- No secret values were read or printed; no Supabase environment or budget setting was changed.

## Validation
Synthetic unit and browser fixtures do not establish correctness against a live PRONOTE export, the user's actual calendar, a live provider quota, or a physical iPad. CI must pass before this work is considered validated.