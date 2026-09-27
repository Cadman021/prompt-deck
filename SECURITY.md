# Security Policy

PromptDeck is a local-first app that stores benchmark history, settings, and
(optionally) cloud provider API keys on the user's own machine. We take that
trust seriously — thank you for reporting issues responsibly.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

Only the latest minor release receives security fixes. Please upgrade before
reporting.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, use GitHub's **private vulnerability reporting**:

1. Go to the repository's **Security** tab → **Advisories** → **Report a vulnerability privately**
2. Describe the issue, affected versions, and steps to reproduce if possible

If private reporting is unavailable, contact the maintainer via
[https://github.com/Cadman021](https://github.com/Cadman021) and ask for a
private channel.

We aim to acknowledge reports within **7 days**. As a solo-maintainer project
this is best-effort, but security reports jump to the front of the queue.

## Scope

Particularly in scope:

* **API key handling** — cloud provider keys must never leave the device except
  to the configured provider, must never be logged, and must never appear in
  exports, history, or console output
* **Tauri IPC / capabilities** — overly broad permissions, command injection,
  unvalidated input crossing the frontend↔Rust boundary
* **Supply chain** — compromised or typosquatted dependencies (`npm`, `cargo`)
* **Local data exposure** — SQLite history or settings readable by other origins
  or processes beyond normal OS user-data access

Out of scope:

* Upstream provider outages, rate limits, or geo-blocking (e.g. sanctioned
  regions) — these are network realities, not app vulnerabilities
* Social engineering against users (e.g. tricking someone into pasting a key
  somewhere) — though UX improvements that prevent this are welcome as regular
  issues
* Vulnerabilities in bundled third-party models or servers (Ollama, LM Studio…)

## Known Limitation (not a vulnerability, but be aware)

Cloud API keys are currently stored in the app's local persisted store in
plaintext. This matches the trust level of a single-user local app, but OS
keychain migration (`tauri-plugin-keyring`) is on the roadmap. If you work in
a shared-machine environment, keep that in mind.
