# Changelog

All notable changes to this project will be documented in this file.

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
