# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### ✨ Added

- **Compare over time** — a Trend page charts one model's speed across its history. The verdict is judged against *that model's own run-to-run spread*, so a 5% dip on a steady model is reported and a 23% dip on a jumpy one is not: it says "regression" only when the change exceeds the noise it already shows, with a 5% floor so three near-identical runs can't make anything look significant
- **Inter-token latency** — the gap between consecutive tokens is recorded during streaming and reported as a median plus a 95th percentile. TPS averages the whole run, so a model that starts fast and then crawls still looks healthy; the p95 is what exposes it, and a column whose p95 is more than 2× its median now shows a marker. Stored in the history DB (schema v5), so it survives a reload and a backup round-trip
- **127K context sweep** — the sweep now offers 128K alongside 2K…64K for long-context models. It stays out of the default set: it is slow, and most local models cannot hold it
- **KoboldCpp and Jan detection** — both are found by the automatic scan (KoboldCpp on 5001 under its `/api/v1` OpenAI layer, Jan on 1337). Probed after Ollama, LM Studio and llama.cpp, so an unreachable extra never delays the servers most people run
- **Sound effects and desktop notifications** — short synthesised cues mark a run starting and finishing (a suite gets its own three-note resolve, an all-error run gets a falling tone), and a desktop notification fires when a long run ends while the window is in the background. Cues are generated with the Web Audio API rather than shipped as audio files, so there are no assets to load and nothing breaks if a webview refuses to start an `AudioContext`. New "Sound & alerts" section in Settings, with a volume slider that previews the real cue
- **Race view** — a live timing board above the columns: one lane per model, ranked by tok/s as the run streams, with TTFT split times and the model's own color. Bars encode *speed*, not characters written, so a model that rambles for 800 tokens doesn't outrank one that answers in 80. Toggled with the Race button in the results toolbar
- **Share card (PNG)** — saves a run as a fixed-size card (prompt, per-model speed bars, TTFT, token counts, cloud cost) for posting. Renders on a fixed dark ground so the image looks the same regardless of the sender's theme
- **One color per model, everywhere** — the columns, results chart, Test Suite scoreboard and history chips now derive a model's color from its name instead of its position, so adding a column or shuffling for blind mode no longer repaints the comparison. Colors are assigned collision-free within a run
- **Per-model generation parameters** — any Bench column can override temperature, top-p and max output tokens from the column header (a dot marks overridden columns; unset fields still inherit the global Advanced settings), so one model can be compared against itself at different temperatures
- **Re-run from History** — a run can be started again straight from its history card, restoring the prompt, columns, global sampling settings and per-model overrides that produced it
- **JSON Schema checks** for Test Suite outputs (alongside exact/contains/regex/JSON), with path-level errors and a compact validator covering `type`, `required`, `properties`, `items`, `enum`, `const`, bounds and `allOf`/`anyOf`/`oneOf`/`not`
- **Context sweep** — runs one model against the same prompt at 2K…64K context windows (neutral filler, fixed 256-token answers) and charts tok/s and TTFT against window size, with the percentage drop versus the smallest window
- **Cloud spend dashboard** — new Spend page with total cost, average per run, a 30-day cost trend, and per-provider / per-model breakdowns built from the cost frozen into each run (local runs and runs without exact tokens stay out)
- **Bundled fonts** — Inter (UI), JetBrains Mono (metrics) and Vazirmatn (Persian) now ship with the app instead of relying on whatever the OS has installed, so typography and Persian rendering are identical on every machine
- **Low-sample badge and Wilson bound on the leaderboard** — a model with fewer than 5 successful runs is flagged instead of letting a 1/1 record top the board, and each win rate now shows its Wilson 95% lower bound next to the raw percentage

### 🐛 Fixed

- **Backup restore was lossy**: importing a history backup dropped each result's `reasoning` trail, and would have dropped inter-token latency too. A round-trip now preserves every field the app can store
- **Phantom servers in the detection scan**: a service answering `200` with unrelated JSON was reported as a local server with an empty model list. With five ports now probed, that was much likelier to happen; a candidate must return at least one model to count as detected
- **AMOLED flattened every translucent panel**: the theme matched compiled utility classes with `[class*='dark:bg-slate-900'] { … !important }`, which also caught `bg-slate-900/60` and forced it solid — 38 translucent surfaces (cards, drawers, headers) lost their opacity in AMOLED. The theme now remaps Tailwind's own `--color-slate-*` variables, so `color-mix()` keeps working, no `!important` is involved, and new components theme correctly without knowing AMOLED exists. Chrome colour is unchanged: pure black canvas, same surface steps
- **Overscroll "slack" at the window edges**: dragging with a touchpad or touchscreen bounced/slid the whole page and revealed a gap behind the app. WebView2 swipe-navigation and elastic overscroll are now disabled, the document can no longer scroll, and inner panes contain their own overscroll
- **Settings panel never animated**: it used `animate-in` / `slide-in-from-right`, which come from `tw-animate-css` — a package this project doesn't install, so the classes silently did nothing. Replaced with a real keyframe that also mirrors under RTL
- **Delete button inside a button in Quick Prompts**: user presets wrapped a delete button in the preset button, which is invalid HTML and left the delete action unreachable by keyboard. The pill is now a container with two sibling buttons
- **Untranslated updater dialog and model picker**: `updater.*` and `bench.selectModel` were referenced in code but existed in no locale, so those strings fell back to English in all six languages

### 🔧 Changed

- **Heavy views are code-split**: History, Leaderboard, Settings, Diff, Test Suite, Cloud, Spend, the context sweep and the results chart now load on demand — the startup bundle dropped from ~1.1 MB to ~275 KB, so the Bench paints sooner on launch

- **Accessibility pass**: 37 icon-only controls now carry a translated `aria-label` (up from 13, several of them hardcoded English), vote and favourites toggles expose `aria-pressed`, and the toast stack is an `aria-live` region so screen readers announce results instead of missing them
- **Contrast fixes measured against WCAG AA**: `slate-400` on light surfaces was 2.56:1 and the inverted pair `text-slate-400 dark:text-slate-500` failed in *both* themes (2.56 / 3.07) — both now resolve to `text-slate-500 dark:text-slate-400`. Accent text (emerald, cyan, amber, rose) moved to the `-700` step on light with an explicit dark twin, taking metric rows from 3.2–3.9:1 to 5:1+
- **Documented micro type scale**: `text-micro` (11px) and `text-nano` (10px) replace 95 arbitrary `text-[11px]` / `text-[10px]` utilities. Nothing renders below 10px any more (8px and 9px outliers removed, 10px prose promoted to 11px), and 10px is reserved for uppercase mono labels and badges

- **Tauri version gate moved from CI to the release workflow**: Dependabot still opens the npm and Rust halves of a Tauri bump as separate PRs, so gating every PR made both halves permanently red and mutually blocked. A mismatch now only fails at tag time — which is where `tauri build` would actually break
- **Dependabot back to per-ecosystem `groups`**: the 1.5.0 `multi-ecosystem-groups` setup did not consolidate the two halves in practice and stopped opening the Rust half at all; per-ecosystem groups keep both ecosystems updating

### 📦 Dependencies

- Tauri `2.12.3` → `2.12.4` and `tauri-build` `2.7.2` → `2.7.4` (npm `@tauri-apps/api` `2.12.3` → `2.12.4`), `@tauri-apps/plugin-updater` / `tauri-plugin-updater` `2.13.3` → `2.14.0`, `@tauri-apps/plugin-sql` / `tauri-plugin-sql` `2.5.0` → `2.6.0`, `@tauri-apps/plugin-opener` / `tauri-plugin-opener` `2.7.1` → `2.7.2`, `@tauri-apps/plugin-process` `2.4.0`

## [1.5.0] - 2026-10-17

Polish & reliability release: clearer first-run and streaming feedback, shareable
test suites, sharper benchmark tables, and a roomier history panel.

### ✨ Added

- **Auto-detect local servers** — scans Ollama (`11434`), LM Studio (`1234`), and llama.cpp (`8080`) with one-click connect chips in Settings
- **First-run onboarding card** (Bench) when no local or cloud model is available: live scan results plus one-click install links for Ollama / LM Studio
- **Shareable test suites** — export a suite (prompts + auto-checks + selected models) to JSON and import it back (`suiteFile` format, versioned) so benchmarks are reproducible across machines
- **Live streaming feedback** in each column: a phase strip (Preparing → Generating) with a running elapsed timer, a live `~tok/s` estimate, and a typing caret, so a slow first token never looks like a hang
- **Bench verdict bar** — fastest / lowest-TTFT / cheapest model at a glance, plus the slowest model's deficit as a percentage
- **Unified toast notifications** for copy, import, and export feedback (replaces the per-component "Copied!" states)
- **Test Suite scoreboard upgrades** — heat-coloring by relative per-test speed, explicit `tok/s` units, and a 👑 fastest-per-test marker
- **Highlighted code blocks** — language label plus a one-click copy button on every fenced block

### 🔧 Changed

- **History sidebar redesigned**: wider panel, roomier cards with wrapping model chips (no truncation), and Copy JSON / Export CSV / full-database backup & restore moved into the panel header
- Result toolbar now holds per-run actions only (Copy Report, PDF, Diff); JSON/CSV export lives in the history panel
- RTL-correct logical positions in the leaderboard and history panels (`start`/`end` with `border-s`/`border-e`)
- Durations under a second now render in milliseconds; TTFT and total duration share one formatter
- Tabular (fixed-width) numerals across metrics, leaderboard, history, and scoreboard so digits no longer jitter
- Syntax highlighting is code-split and only runs after a stream finishes (and for blocks under 20k chars), so it never competes with local inference
- Dependabot now uses a Tauri **multi-ecosystem group**, so the npm and Rust halves of a Tauri bump arrive as one PR that satisfies the version gate instead of two PRs that each fail it

### 🐛 Fixed

- Cloud results were briefly overwritten by a trailing animation frame — pending `requestAnimationFrame` writes are now cancelled on completion, so a finished cell can no longer flip back to "running"
- `keyring` 4 renamed `delete_password` → `delete_credential` (build fix)

### 📦 Dependencies

- Added `react-syntax-highlighter` (lazy-loaded) for code highlighting
- lucide-react `1.39` → `1.56`, i18next `26.4.3` → `26.4.4`, postcss `8.5.26` → `8.5.30`, TypeScript `5.8.3` → `5.9.3`, keyring `2` → `4`, serde_json `1.0.152` → `1.0.154`

## [1.4.0] - 2026-10-16

Quality-evaluation release: blind voting that actually works, automatic suite
checks, an LLM judge, OS-keychain secrets, and Elo rankings.

### ✨ Added

- Blind voting mode: toggle in the footer (before running), auto-shuffle of columns on every blind run, identities masked everywhere, auto-reveal on vote
- Test Suite automatic checks (contains/regex/exact/valid-JSON) with per-cell verdicts, detail badges, and pass-rate summary
- LLM-as-judge panel: blind scoring against a fixed rubric (accuracy/completeness/clarity), deterministic settings, defensive JSON parsing, advisory pick badge that never auto-votes
- OS-keychain storage for API keys (`keyring` crate + 3 Tauri commands): auto-migration, in-memory cache, silent fallback; secrets centralized in `services/secrets.ts`
- Leaderboard Elo ratings from pairwise vote outcomes (a 4-model win moves more points than head-to-head)
- Thinking traces persist (`reasoning` DB column, schema v4) and appear in suite detail, Markdown/PDF exports, and history reloads

### 🔧 Changed

- ESLint (type-aware + react-hooks) + Prettier configs, zero warnings/errors enforced in CI
- Release workflow: code-signing scaffolding (commented, awaiting certificates)
- History cards use explicit `source`/`provider_id` columns (local `openai/*` models no longer misread as cloud)
- TypeScript major updates ignored by Dependabot (incompatible with typescript-eslint 8)
- jsPDF/html2canvas load lazily on export (main chunk 1.49MB → 1.06MB)
- Release notes drafted from CHANGELOG via `scripts/extract-notes.cjs`

### 🐛 Fixed

- Keychain service namespace fixed in Rust; secret-storage badge (OS keychain vs local) in Cloud header

## [1.3.0] - 2026-10-13

Correctness, benchmark credibility, and community release — with our first
external contributors on board. Welcome [@AyanJaved](https://github.com/AyanJaved),
[@lb1192176991-lab](https://github.com/lb1192176991-lab), and
[@afifm561](https://github.com/afifm561)! 🎉

### ✨ Added

- N-repeat runs (1–5, medians reported) with mean±stdev tooltips; exact Ollama load/prompt timings; defensive llama.cpp/LM Studio rate parsing
- Thinking-trace display for reasoning models (`reasoning_content` collapsible)
- Sequential/Parallel run mode (sequential default: uncontaminated local TPS)
- Server-defaults toggle + seed/max-tokens controls (Ollama `num_predict` mapped)
- Script-aware token heuristic (CJK ≈ 1.5, Arabic-script ≈ 2.5 chars/token)
- Test Suite "fastest" wording; run-config snapshot (`run_config` column) with card tooltip
- SQL-side history search + pagination with "Show more"; full-DB JSON backup/export-import
- Shared `runTarget` streaming core; Test Suite survives page switches and saves runs to history; bench retry updates its history row
- Leaderboard Wilson ranking over successful runs only; `ConfirmModal` replaces native dialogs; JSON copy empty-state
- Text-based PDF (selectable, paginated) with image fallback for non-Latin scripts
- Signed in-app updates (`tauri-plugin-updater`): startup check against GitHub releases with consent dialog, progress, and relaunch; release workflow signs artifacts
- Secrets centralized in `services/secrets.ts` (documented OS-keychain swap plan)
- Community features by contributors: relative timestamps on history cards ([@AyanJaved](https://github.com/AyanJaved)), winners-only filter, reset-to-defaults ([@lb1192176991-lab](https://github.com/lb1192176991-lab)), Ctrl+K prompt focus ([@lb1192176991-lab](https://github.com/lb1192176991-lab)), Test Suite retry-failed ([@afifm561](https://github.com/afifm561))

### 🔧 Changed

- Explicit `cloud:` model prefix + `source`/`provider_id` history columns (no more local/cloud name collisions)
- Versioned DB migrations (`PRAGMA user_version`); transactional saves; single-JOIN history; `run_id` index
- Markdown `img` is click-to-load and links open externally; restrictive Tauri CSP
- CSV: BOM, formula-injection guard, full (unlimited) export
- CI runs unit tests (`npm test`, 56 tests), ESLint, and the Tauri version gate; clippy `-D warnings` enforced, `cargo fmt` no longer best-effort; `npm audit` clean (0 vulnerabilities)
- `.gitattributes`/`.editorconfig`, Dependabot, `SECURITY.md` versions, Cargo metadata
- Missing `de` history keys + code-default-only cloud keys added to all locales
- Remaining hardcoded UI strings moved to i18n (stop marker, add-model button, PDF error, print report, provider form)
- Thinking traces persist (`reasoning` DB column, schema v4) and appear in suite detail, Markdown/PDF exports, and history reloads
- OS-keychain storage for API keys (`keyring` crate + 3 Tauri commands, auto-migration, in-memory cache); code-signing scaffolding commented in release workflow

### 🐛 Fixed

- Stream finalize without `[DONE]` (llmService + ollamaService); mid-stream Ollama errors surfaced; JSON error bodies on HTTP failures
- `loadModels` preserves cloud slots; Ctrl+Enter gated to Bench; `saveHistory` returns `lastInsertId` (vote race removed)

## [1.2.0] - 2026-09-27

Nine new cloud providers (19 total), three new locales, GPL-3.0, and community
files — plus robustness fixes for providers with non-standard APIs.

### ✨ Added

- **9 new cloud providers**: Kilo Gateway, Bazaarlink, BytePlus ModelArk, Poolside, Agnes, Xiaomi MiMo, Mistral, B.AI, and Anthropic (via its official OpenAI SDK compatibility layer, Bearer auth) — each with brand icon, info banner, suggested models, and a direct API-key link
- **Real API-key links everywhere**: the "Where to get an API key" button now points at each provider's actual key-creation page and opens it in the system browser via the Tauri opener plugin (new `openExternal` helper; plugin registered in `lib.rs`)
- **Support for providers without a `/models` endpoint** (e.g. Poolside): key test falls back to a key-only probe, reports `modelsListed: false`, and the detail page shows a hint to add model ids manually instead of an error
- **Actionable network errors**: DNS/reset/region-blocked failures now explain themselves ("check connection/VPN — some providers block certain regions") instead of a bare `Failed to fetch`
- **3 new locales**: French, Simplified Chinese, and Russian — 6 languages total (EN, FA, DE, FR, ZH, RU) with a 6-tile language picker
- **Community files**: `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (supported versions, private reporting, scope, key-storage limitation), CONTRIBUTING links to both
- **Credits**: "Powered by Sina Cadman" footer in the sidebar and settings panel, linking to GitHub
- **Backdrop dim** for History and Leaderboard panels (same as Settings), click-to-close

### 🔄 Changed

- **License: MIT → GPL-3.0-only** (`LICENSE`, `package.json`, README)
- Settings provider form restacked vertically for the panel layout

### 🐛 Fixed

- Local model picker stuck on the first model: `decodeValue` returned the raw JSON option value instead of the parsed model name for local sources (cloud sources were unaffected)
- Provider icon fallback tile rendered white-on-white (invisible initials) after a styling change — brand color restored, white backdrop kept only behind raster icons

---

## [1.1.0] - 2026-09-19

Cloud release: manage cloud LLM providers 9Router-style and benchmark their models side-by-side with local ones — in both Bench and Test Suite.

### ✨ Added

- **Cloud Providers page** (new sidebar entry): Custom Providers section (user-added OpenAI-compatible endpoints) plus a curated catalog split into **Free Tier Providers** and **API Key Providers**, with search, per-section Test All, and per-card connection status
- **10 providers in the catalog**: OpenRouter, DeepSeek, Groq, Together AI, OpenAI, xAI (Grok), Kimi (Moonshot), NVIDIA NIM, Ollama Cloud, and Gemini (via Google's OpenAI-compatibility endpoint) — each with docs link, info banner, suggested models, and a 128px brand icon (`public/providers/`, graceful initials-tile fallback)
- **Provider detail page**: named API-key connections (add / test / edit / delete / enable-toggle), an **Available Models** section that fetches the real `/models` list, model search, per-model enable toggles, **per-model 1-token probe test** (green check / red X with latency or error), copy-id, remove, manual add, suggested-model chips, and enable/disable-all
- **Cloud models in Bench**: grouped model picker (Local + ☁ per-provider groups) with a cloud badge on cloud columns; runs use the stored key via `Authorization: Bearer` header. Cloud models are stored as qualified names (`providerId/model`), so history, leaderboard, votes, charts, diff, and all exports work with **no database migration**
- **Cloud models in Test Suite**: per-provider cloud checkboxes (mixable with local models in one suite); suites run without any local model installed
- `LLMService.testCloudConnection` now also returns the model id list; new `probeCloudModel` for single-model reachability checks

### 🔄 Changed

- Cloud store migrated to v2 (multiple named keys per provider, `enabledModels`, `knownModels`) with automatic non-destructive migration of v1 connections
- Add-model button no longer depends on local models — with cloud-only sources it adds the first enabled cloud model instead of staying disabled
- Removed obsolete `nav.soon` / `*Soon` i18n keys (Cloud and Tests are real pages now); full EN + FA + DE coverage for all new UI

### 🐛 Fixed

- Missing `X` icon import in `ProviderDetailPage` that broke `tsc` (probe-error state)
- Test Suite Run stayed disabled when only cloud models were selected (leftover local-models guard)

---

## [1.0.0] - 2026-09-17

First stable release. The headline changes are a full **App Shell redesign** that frees up space for new workflows, a brand-new **Test Suite** page for batch benchmarking, an **AMOLED Dark** theme, and a proper **language picker** — plus German locale coverage and CI updates.

### ✨ Added

- **Test Suite (batch execution)**: run a list of 1–10 test prompts across all selected models sequentially, with a live progress bar and Stop support. Results land in a **scoreboard matrix** (one row per test, one column per model) showing TPS per cell, a 👑 crown for the fastest model on each test, an average-TPS + wins summary row, click-to-read full-output detail modal, Markdown report copy, and CSV download. The suite definition persists in `localStorage`
- **AMOLED Dark theme**: pure-black (`#000000`) canvas with neon glows on primary actions, status dots, and focus rings. Builds on top of dark mode, so every `dark:` style keeps working; persisted in settings (store migrated to v2, old `dark`/`light` values carry over untouched)
- **Language picker modal**: grid-style popup (region code + native name tiles, e.g. US/English, DE/Deutsch, IR/فارسی) with selected-state highlight, `Esc`/backdrop close, and support for future locales — opened from both the header and the settings panel
- **Appearance section in settings**: explicit Light / Dark / AMOLED picker alongside the header's three-state theme cycle button
- **German (Deutsch) locale**: full UI coverage in English, Persian (Farsi, RTL), and German
- **App Shell navigation**: icon-rail sidebar (Bench, Tests, History, Board, Config) with a reserved "Cloud — Soon" slot for the upcoming cloud-input feature; History, Leaderboard, and Settings now open as sidebar-driven overlay panels instead of crowding the header

### 🔄 Changed

- **Header decluttered**: the old 10+-button wrapping header is now a slim 48px `TopBar` (title + version, provider connection pill with status dot and model count, language, theme, refresh, settings). All result actions (Copy Report, PDF, Diff, Copy JSON, Export CSV) moved to a contextual `ResultToolbar` that only appears when there are results
- **Settings live in a slide-over panel**: provider/connection, appearance, language, and advanced model controls (system prompt, temperature, top-p, context length) moved out of the stacked inline layout, giving model outputs the maximum vertical space
- **Prompt dock restyled**: floating-card prompt box with `Ctrl+Enter` hint and a dedicated Run/Stop button
- **Test Suite owns its page**: the sidebar `Tests` entry is now a real page (bench prompt dock and result toolbar are hidden while it is active)
- CI and release workflows now build with **Node.js 24** (was 20)
- Version centralized as before (`src/version.ts` ↔ `package.json` ↔ `tauri.conf.json` ↔ `Cargo.toml`), now at `1.0.0`

### 🐛 Fixed

- Language modal opened from the header rendered clipped inside the header bar (missing backdrop and title). Root cause: the header's `backdrop-blur` creates a containing block for `fixed` descendants — the modal now renders via a React portal to `document.body`, so it always covers the viewport
- Test Suite worker cell updates could target the wrong cell under concurrent callbacks — cell execution now carries its test index explicitly instead of a shared mutable ref

---

## [0.3.0] - 2026-09-15

### ✨ Added

- **Side-by-side diff view**: compare any two model outputs line-by-line, with similarity percentage, added/removed line counts, pair picker (for 3–4 model runs), and a toggle to hide unchanged lines — no new dependencies (custom LCS-based diff)
- **Winner votes**: crown the best answer per run with a per-column vote button; the winner gets a highlighted column, a badge, and is remembered in history
- **Model leaderboard**: aggregated per-model stats (run count, average TPS, win count, win rate) in a sortable sidebar panel, persisted in SQLite
- **CSV export**: download the full benchmark history as CSV (one row per model result: run id, date, prompt, model, TPS, estimated flag, TTFT, winner, output)
- **Keyboard shortcuts**: `Ctrl+Enter` (or `Cmd+Enter`) to run, `Esc` to stop generation or close panels

### 🔄 Changed

- **Unified TPS definition**: TPS now measures the generation phase only (excluding time-to-first-token) on every provider, matching the meaning of Ollama's `eval_count`/`eval_duration`. When a server doesn't report token usage (some LM Studio / llama.cpp setups), TPS is estimated from output length and clearly marked with `~` in columns, charts, history, and Markdown/PDF exports
- **Settings now persist**: theme, language, provider, base URL, and advanced controls (system prompt, temperature, top-p, context length) survive app restarts via persisted store
- **Database schema extended** (non-destructive, auto-migrated on launch): new `winner_model` column on `benchmark_runs`, plus `tps_estimated` and `token_source` on `benchmark_results`. Databases from v0.2.0 open without data loss
- Version is now centralized in `src/version.ts` (kept in sync with `package.json`, `tauri.conf.json`, and `Cargo.toml`); app window title and default size updated (1280×800, min 1024×640)

### 🐛 Fixed

- Run button could get stuck in the "running" state forever when any single model column errored — completion is now tracked per-slot (success, error, or stop), partial runs are always saved to history, and failed/stopped columns get a dedicated **Retry** button that re-runs only that slot
- Switching providers no longer wipes a manually edited server URL unless the provider actually changed
- `JSON.parse` on Ollama NDJSON streams is now guarded — a single malformed line no longer kills the whole stream
- Removed unused i18n key (`app.version`) that showed a stale hardcoded version in the header

---

## [0.2.0] - 2026-09-05

### ✨ Added

- **Multi-provider support**: connect to [LM Studio](https://lmstudio.ai) or any `llama.cpp` server (OpenAI-compatible API) in addition to Ollama, with a provider/base-URL switcher in the header
- **Compare 3–4 models simultaneously** (previously limited to 2), with dynamic add/remove model columns
- **User-savable prompt presets**: save your own prompts alongside the built-in quick presets, with delete support
- **TPS / TTFT comparison chart**: visual bar charts comparing tokens/sec and time-to-first-token across all running models
- **Rich PDF export**: generate a fully-formatted PDF report (with Markdown rendering, tables, and code blocks preserved) of any benchmark run
- Full English + Persian (Farsi) i18n coverage across the entire UI, including the history sidebar and export dialogs

### 🔄 Changed

- **Database schema redesigned** to support an arbitrary number of models per run (`benchmark_runs` + `benchmark_results` tables replace the old fixed `model1`/`model2` `history` table). Existing history is automatically migrated on first launch.
- History sidebar now respects the active light/dark theme (previously always dark)
- Benchmark chart tooltips are now readable in all theme combinations

### 🐛 Fixed

- Run/Stop button could get stuck in the "running" state after a completed or failed generation
- Division-by-zero when calculating tokens/sec for near-instant responses
- PDF export now shows clear loading and success feedback, preventing accidental duplicate downloads

---

## [0.1.0] - 2026-09-04

- Initial release: side-by-side Ollama model benchmarking, streaming output, TPS/TTFT metrics, local SQLite history, Markdown rendering, dark/light theme, basic prompt presets
