# JARVIS-X Model Scout

## Purpose

Model Scout checks official public model-catalog pages for Google Gemini, Anthropic Claude, and DeepSeek. It compares discovered model identifiers against `evaluation/model-candidates.json` and reports new identifiers or lifecycle changes for review.

## Run manually

```sh
npm install
npm run scout:models
npm test
```

The GitHub Actions workflow runs daily and can also be started with **Actions → Model Scout → Run workflow**. Its summary lists new IDs, lifecycle changes, and source errors.

## Safety and truth boundaries

- Discovery is **proposal-only**. It never edits the registry, installs model weights, calls a model API, changes routing, or promotes a candidate.
- Catalog text can include legacy IDs, aliases, examples, or deprecated models. All newly discovered IDs are unclassified and require lifecycle confirmation.
- An observed ID does not prove API credentials, quotas, free access, performance, or model weights are available.
- OpenRouter is excluded by project policy.
- Current model quality is established only by the fixed benchmark and comparable holdout retest, not by vendor claims or registry presence.
- The scout currently watches Google, Anthropic, and DeepSeek public documentation only. It does not yet poll every provider or create/merge code changes automatically.
