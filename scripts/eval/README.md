# Real-model eval

This directory is a manual, non-CI evaluation harness for OpenUI trigger quality and DSL correctness. It uses real providers; it is not a test suite and must not run in CI.

## Safety and isolation

- All Hosts use an isolated `DSH_HOME` under `.demo-home/eval/<run>` and `127.0.0.1`; the daily Host on port 53083 and `~/.dsh` writes are forbidden.
- `prepare.mjs` reads only provider/auth configuration from the source home:
  - `.credentials.yaml` and `.env` if present (copied with mode 0600, never printed);
  - top-level `llm-deepseek`, `llm-pi-ai`, `llm-deepseek-account` rows from `<source>/profiles/web/cordis.patch.yml`.
- It never copies `sessions/`, `storages/`, `attachments/`, `logs/`, `plugins/`, `prompts/`, or AGENTS.md.
- Credentials are written only into the ignored `.demo-home/eval/` tree. Do not commit the isolated home or any result that contains secrets.
- Browser/Host work must hold `.locks/demo.lock`:

```sh
flock .locks/demo.lock node scripts/eval/run-all.mjs
```

## Prerequisites

- `dsh` 0.2.1-rc.1 on PATH, Node 24, `zstd` on PATH.
- Playwright Chromium installed (`pnpm exec playwright install chromium`).
- `packages/dsh-openui/dist/{index.js,client.js,island.js,openui-skill.md}` built.
- Provider credentials already configured in the source home.
- No real model is called by `validate.mjs` or `prepare.mjs --check`.

## Commands

```sh
# 1. Validate the prompt set (no model, no Host)
node scripts/eval/validate.mjs

# 2. Check what would be copied (no writes, no credentials printed)
node scripts/eval/prepare.mjs --check

# 3. Full matrix: deepseek-official/deepseek-flash + klaude-openai/gpt-6.1-sol
flock .locks/demo.lock node scripts/eval/run-all.mjs

# 4. One model, or a subset
flock .locks/demo.lock node scripts/eval/run.mjs \
  --provider deepseek-official --model deepseek-flash --case ui-loan --case no-csv

# 5. Aggregate the JSONL into docs/evidence/eval-<date>.md
node scripts/eval/report.mjs --input docs/evidence/eval-<date>.jsonl
```

Useful flags: `--fresh` (remove the isolated home first), `--headed`, `--timeout <ms>`, `--out <jsonl>`, `--sourceHome <path>`. `run-all.mjs` accepts repeated `--model provider/model`; it defaults to the two models above.

## Prompt sets

`prompts.json` has 13 `should-ui` and 13 `should-not-ui` cases across finance, health, business, environment, transport, education, research, code, troubleshooting, ops, logs, database, networking, and ordinary Q&A. Prompts describe the user task only; they do not name a model, vendor, OpenUI, or the DSL, so the same set is used for every model.

- `should-ui`: interactive parameter explorer/calculator where local recomputation clearly helps.
- `should-not-ui`: prose, code, commands, logs, debugging, simple Q&A, and comparisons that do not need an interactive surface.

## Result format

`run.mjs` appends one JSON object per case to `docs/evidence/eval-<date>.jsonl`:

```json
{
  "run": { "provider": "deepseek-official", "model": "deepseek-flash", "startedAt": "...", "home": "..." },
  "case": { "id": "ui-loan", "group": "should-ui", "domain": "finance", "prompt": "..." },
  "session": { "id": "...", "file": "..." },
  "elapsedMs": 12345,
  "response": {
    "assistantMessages": 1,
    "turns": 1,
    "skillCalls": 1,
    "skillLoaded": true,
    "rawMarkdown": "truncated raw assistant text",
    "fences": [{ "language": "openui-lang", "body": "root = ..." }]
  },
  "dom": {
    "row": true,
    "streamingObserved": false,
    "codeBlocks": [{ "language": null, "body": "root = ..." }],
    "islands": [{ "shadow": true, "textChars": 120, "sliders": 3 }],
    "islandReactVersion": "19.x"
  },
  "interaction": { "available": true, "sliders": 3, "changed": true, "localRecompute": true },
  "errors": { "console": [], "page": [] },
  "scoring": { "triggered": true, "rendered": true, "localRecompute": true, "verdict": "pass" }
}
```

Scoring definitions:

- `triggered`: the raw assistant Markdown contains a closed `openui-lang` fence. This is independent of DOM language attributes and first-line markers.
- `skillLoaded`: the session log has a `tool/call` named `skill` whose arguments name `openui`.
- `rendered`: at least one `[data-dsh-openui-island]` host has an open shadow root with non-empty text; `__DSH_OPENUI_ISLAND__.reactVersion` starts with `19.`; no `[dsh-openui]` console error and no page error.
- `localRecompute`: a range input in the last island changed the shadow-root text and the session's `turn/start` count did not change.
- `verdict`: `should-ui` is `pass` when rendered, `partial` when triggered but not rendered, otherwise `fail`; `should-not-ui` is `pass` only when neither triggered nor rendered; execution failures are `error`.

The Markdown report contains per-model/group totals, per-case results, and up to 20 failure samples with truncated raw responses.

## Limits

- One run per case; a new Session per case so skill loading is observable. This is slower and does not model multi-turn UI refinement.
- Desktop 1280x900 Chromium only; mobile/WebKit is task-7.
- Provider rows are extracted textually from the top-level profile patch; a custom provider declared outside those rows must be added explicitly.
- The isolated home keeps provider config but may reference external key files; those files are not copied or printed.
- This harness does not assert model quality; it records observable behavior for human review.
