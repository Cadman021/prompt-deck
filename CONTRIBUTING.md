# Contributing to PromptDeck

Thanks for your interest in contributing! 🎉

## Getting Started

1. Fork the repository and clone it locally
2. Install dependencies: `npm install`
3. Run in dev mode: `npm run tauri dev`
4. Make sure [Ollama](https://ollama.com) is running locally with at least one model pulled

## Before Opening a PR

- Run `npx tsc --noEmit` to make sure there are no type errors
- Run `npm run build` to confirm the frontend builds
- If you touched Rust code, run `cargo fmt` and `cargo check` inside `src-tauri/`
- Keep PRs focused — one feature/fix per PR is easier to review

## Reporting Bugs

Please include:
- Your OS and Ollama version
- Steps to reproduce
- Expected vs actual behavior
- Console/terminal errors if any

## Suggesting Features

Open an issue describing the use case before submitting a large PR — this helps avoid wasted effort if the feature doesn't fit the project's direction.

## Code Style

- TypeScript/React: follow the existing patterns in the codebase (functional components, hooks)
- Keep UI strings in the i18n JSON files (`src/i18n/locales/en.json` and `fa.json`) — avoid hardcoding text in components
- Rust: standard `rustfmt` formatting

Thanks again for helping improve PromptDeck! ⭐
