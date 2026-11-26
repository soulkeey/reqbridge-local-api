# Changelog

All notable changes to **ReqBridge Local API** will be documented in this file.

## [0.1.0] - 2026-11-26

### Added
- Multi-format local parsers for Postman v2.1 JSON, Thunder Client JSON, Bruno `.bru` (single file and directory inheritance), and `.http` files.
- Secret-safe transpiler emitting Git-native `.http`, `.env.example`, and OpenAPI 3.1.0 YAML with non-adjacent path merging and YAML 1.1/1.2 edge-case escaping.
- `.http` / `.rest` CodeLens provider (`Send Request`, `Diff Staging vs Prod`, `Run CSV Batch`).
- Local CSV/JSON batch execution engine with concurrency/timeout settings, `p50`/`p95` latency metrics, JUnit XML and Markdown reports.
- Staging vs Production schema-drift diff engine and CSP-hardened Webview report panels.
- Dual-track licensing (`RB1.` Ed25519 offline keys bound via `vscode.env.machineId` + Creem/Gumroad API verification in `SecretStorage`), Free Core daily trial limits, Pro CI exporter, and optional BYOK script translation.
