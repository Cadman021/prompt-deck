# Changelog

All notable changes to this project will be documented in this file.

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
