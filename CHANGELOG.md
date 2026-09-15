# Changelog

All notable changes to this project will be documented in this file.

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
