# ReqBridge Local API — R1 Benchmark, Funnel Audit & Monetization Strategy

> **Date:** 2026-11-26  
> **Scope:** Requirement R1 (Competitive Benchmarking, Baseline Gap Audit, Payment/Licensing Feasibility, and Prioritized Execution Strategy)  
> **Workspace Baseline:** `C:\Users\27197\.gemini\antigravity\scratch\p0_unbundling_launch\`  
> **Target Product:** `ReqBridge Local API` (`soulkey-tools.reqbridge-local-api`, `$19` Personal / `$29` Team 5-Seat One-Time)  

---

## 1. Executive Summary

`ReqBridge Local API` already validated a clear market pain point—developers leaving Postman (`$9–$19/user/mo`, retired offline Scratch Pad) and Thunder Client (`v3.0.0` mandatory login + `50` requests/collection + `50` runner executions/mo caps)—and deployed a dark-mode landing page (`https://reqbridge-local-api.pages.dev/`) with 4 initial community posts. However, **current conversion readiness is near `0%`** because the workspace still enforces a Phase 0 zero-code rule (`0` lines of VS Code extension code, `0` `.vsix` package), two of the three interactive web demo tabs are client-side stubs (`setInterval` simulator and hardcoded `DIFF_DATA`), the converter only accepts Postman JSON despite advertising Bruno `.bru`, and both checkout pages terminate in `"$0 Charged Today"` + `mailto:`-only dead ends.

Live benchmarking across **10 competing developer tools** and **5 payment/MoR rails** (verified `2026-11-26`) establishes the highest-leverage path to first paying revenue:

1. **Product Wedge — Do Not Build Another Sidebar REST GUI:** `PostMate` (`5.00★`, `5,760` installs) already serves "free no-login Thunder Client GUI" refugees, while `REST Client` (`7.78M` installs, `4.91★`) proves huge demand for plain `.http` files—but lacks lossless multi-format migration, unlimited CSV data-driven batching with JUnit XML, and Staging-vs-Prod JSON schema-drift diffing. ReqBridge wins by owning the **Git-native `.http` + OpenAPI 3.1 + CSV Batch Runner + Schema-Drift Diff** workflow.
2. **Packaging & Rating Protection — Free Core + One-Time Pro Unlock:** `Thunder Client` (`2.35★`, `780` ratings) and `Console Ninja` (`2.90★`) prove that gating basic single-request execution or forcing mandatory login triggers severe Marketplace rating collapse. ReqBridge ships **unlimited single-request `.http` usage, unlimited format migration, and generous trial batching (`10` CSV rows, `3` batch runs/day, 1-endpoint diff) free**, gating only **unlimited CSV batching, collection-wide schema diff, standalone CI exporter, and optional BYOK script translation** behind a `$19` Personal / `$29` Team 5-Seat one-time license.
3. **Dual-Track Immediate Revenue Rail:** Because `Polar.sh` excludes Mainland China Stripe Connect and `Creem` permanently rejects `*.pages.dev` subdomains (requiring a custom domain `~$8–$12/yr` + `support@<domain>` before Live Review), ReqBridge pairs **Mianbaoduo (`mbd.pub`, `~3%`, personal KYC, no custom domain required, offline Ed25519 `RB1.` `卡密自动发货`)** for immediate domestic/early-bird delivery with **Creem (`3.9% + $0.40`, Alipay CNY direct, License API)** once a custom domain is attached, and **Gumroad (`10% + $0.50`)** as an optional same-day global PayPal bridge.

---

## 2. Current Baseline & Funnel Gap Audit

Direct inspection of `C:\Users\27197\.gemini\antigravity\scratch\p0_unbundling_launch\` reveals seven structural gaps preventing organic discovery, trust, and first-dollar conversion:

### 2.1 Zero Shipped Product (`README.md`, `phase0_checklist.md`, `phase1_outreach_log.md`)
- **`README.md:11-13` & `phase1_outreach_log.md:6`:** The baseline strictly prohibits shipping extension code (`manifest.json`, `package.json`, `.ts`, `.py` = `0`). Visitors arriving from Dev.to, Reddit, Juejin, or X cannot install any VS Code extension or CLI tool.
- **`phase0_checklist.md:32-34`:** Marketplace Publisher **`soulkey-tools`** (`SoulKey Tools`) is registered (`$0`, `0%` cut), and `0.1e` switched away from Chrome Web Store (`$5`) to VS Code (`$0`). However, `https://aex.dev.azure.com/me` has **no Azure DevOps organization yet**, and publishing must avoid Global PATs before Microsoft's **`2026-12-01` Global PAT retirement** (use Organization-Scoped PAT or `vsce publish --oidc`).

### 2.2 Broken / Stubbed Interactive Web Experience (`landing/index.html`, `landing/demo.js`)
- **Tab 1 Format Gap (`landing/index.html:40,261,333` vs `landing/demo.js:215-220`):** The hero copy and compare table promise Postman v2.1 + Bruno `.bru` conversion, yet `parsePostmanCollection()` throws unless `Array.isArray(col.item)`—failing on Bruno `.bru`, Thunder Client JSON, and `.http` inputs.
- **Tab 1 Body, Query, Auth & OpenAPI Bugs (`landing/demo.js:257-262, 307, 321-350`):**
  - Body parsing ignores `formdata`; `.http` serialization relies on `url.raw` without reconstructing structured query params; `apikey` auth ignores `in: "query"` vs `"header"`.
  - **Non-adjacent OpenAPI path bug (`landing/demo.js:330-341`):**
    ```js
    if (!seenPaths.has(normalized)) {
      seenPaths.set(normalized, true);
      yamlLines.push(`  ${normalized}:`);
    }
    yamlLines.push(`    ${m}:`);
    ```
    When requests appear as `/v2/orders`, `/v2/users`, `/v2/orders`, the second `/v2/orders` method is emitted indented under `/v2/users:`, producing invalid OpenAPI YAML.
  - **Stubbed OpenAPI output (`landing/demo.js:321-350`):** Omits `parameters` (path/query/header), `requestBody` schemas, `components.securitySchemes`, and status codes inferred from `pm.test()`.
- **Tab 2 Fake Batch Runner (`landing/demo.js:441-471`):** Uses `setInterval(..., 150)` with canned log lines (`31 + ((step * 7) % 19) ms`) instead of real CSV parsing, `fetch()` execution, and downloadable JUnit XML / Markdown artifacts.
- **Tab 3 Fake Diff Viewer (`landing/demo.js:479-556`):** Displays a static 3-entry `DIFF_DATA` lookup instead of recursively comparing arbitrary user-pasted or live-fetched Staging vs. Production JSON responses.

### 2.3 Funnel, Pricing Copy & SEO Gaps (`landing/`)
- **Checkout Dead End (`landing/checkout-personal.html:26,34,48`, `landing/checkout-team.html:26,34,48`):** Both pages display `"$0 Charged Today"` and only offer a `mailto:soulkey529@gmail.com` link—causing severe drop-off for visitors ready to buy or install immediately.
- **Copy Accuracy Discrepancy (`landing/index.html:241` — Flagged for M3):** The comparison table currently states `Bruno (OSS): Free OSS (Pro $19/user/mo)`, whereas `usebruno.com/pricing` verified on `2026-11-26` lists **Bruno Pro at `$6/user/mo`** (with higher Ultimate/Enterprise tiers at `$11–$18+`). M3 must correct `landing/index.html:241` so competitor pricing remains strictly factual.
- **Missing SEO & Share Assets:** `landing/` lacks `robots.txt`, `sitemap.xml`, `favicon.svg`, and Open Graph / Twitter / canonical `<meta>` tags, weakening organic search and social link previews.

---

## 3. Competitive Landscape & Benchmark Matrix (Verified `2026-11-26`)

All figures below were retrieved and verified live on **`2026-11-26`** via the VS Code Marketplace Gallery API, GitHub REST API, and official vendor pricing/documentation pages (every URL returned **`HTTP 200`**).

| Tool | Channel / Category | Live Installs / Stars (`2026-11-26`) | Rating (`Count`) | License | Free vs. Paid Boundary | Strategic Lesson for ReqBridge |
|---|---|---|---|---|---|---|
| **REST Client** (`humao.rest-client`) | VS Code Ext (`.http`) | `7,784,055` installs · `6,064` ★ | `4.91★` (388) | `MIT` | 100% Free `.http` runner | Proves massive `.http` demand; weak on Postman/Bruno migration, CSV batching, JUnit XML & schema diff. |
| **Thunder Client** (`rangav.vscode-thunder-client`) | VS Code Ext (GUI) | `7,734,429` installs · `3,715` ★ | `2.35★` (780) | Proprietary (`NOASSERTION`) | Free: mandatory login (`v3.0.0`), 10 collections, 50 req/col, 50 runs/mo. Paid: `$3` Starter / `$7` Business / `$16` Ent `/user/mo` (CSV, Git Sync, CLI/CI, WSL paywalled) | **Primary displacement source** & **cautionary tale**: mandatory login + 50-run/CSV paywalls tanked rating to `2.35★`. |
| **httpYac** (`anweber.vscode-httpyac`) | VS Code Ext + CLI | `143,951` installs · `896` ★ | `4.96★` (27) | `MIT` | 100% Free OSS | Power-user `.http` + JS scripting engine, but no visual Postman/Thunder/Bruno converter, no GUI schema-drift diff, steep learning curve. |
| **PostMate Client** (`PostMate-lab.postmate`) | VS Code Ext (GUI) | `5,760` installs | `5.00★` (4) | Free | 100% Free, no login, unlimited local | Absorbs "free Thunder Client GUI" refugees (`5.00★`). Competing on a sidebar GUI clone is a losing battle—differentiate on `.http` + OpenAPI + CSV + Diff. |
| **Console Ninja** (`WallabyJs.console-ninja`) | VS Code Ext (DevTool) | `1,511,474` installs | `2.90★` (93) | Commercial | Strict freemium license gating | Confirms aggressive core-feature locks drive `2.9★` backlash even on useful tools. |
| **GitLens** (`eamodio.gitlens`) | VS Code Ext (Git) | `54,139,504` installs | `3.37★` (947) | Open-Core | Free core Git features + paid Pro collaboration/visuals | Winning monetization model: keep core daily utility genuinely free; charge for workflow accelerators & team packs. |
| **Postman** (`postman.com/pricing/`) | Desktop / Cloud SaaS | Market incumbent | — | Proprietary | Free: 25 runner runs/mo, cloud account required. Paid: `$9/mo` Solo, `$19/user/mo` Team | High per-seat recurring cost (`$1,140/yr` for 5 seats) + cloud lock-in creates strong willingness to pay `$19–$29` one-time. |
| **Bruno** (`usebruno/bruno`) | Desktop / CLI (`.bru`) | `48,576` ★ | — | `MIT` + Commercial | Free OSS + `$6/user/mo` Pro / `$11–$18+` Ultimate/Ent | Validates local-first Git-friendly API tooling; Issue `#7365` shows OpenAPI export pain, and `.bru` requires another desktop app outside VS Code. |
| **Yaak** (`mountain-loop/yaak`) | Desktop (Tauri/Rust) | `19,549` ★ | — | `MIT` + Commercial | Free personal + `$79/yr` Ind, `$149/yr` Biz, `$349` Lifetime | Public indie proof (`yaak.app/blog`): grew from `$160` to **`$1,900 MRR`** by solving Postman frustration cleanly with fair pricing. |
| **Hoppscotch & HTTPie** | Web / Self-Host / CLI | `80,982` ★ (Hoppscotch) | — | `MIT` / OSS | Free OSS self-hosted/CLI + paid team cloud | Strong OSS funnel precedent: free local/web utility feeds paid team workflows. |

---

## 4. Payment, Licensing & China Individual MoR Analysis

### 4.1 Merchant-of-Record (MoR) Comparison for a China-Based Solo Developer

| Rail / Platform | Fee Structure | Mainland China Individual KYC | Payout Method & Cadence | Built-in License Keys | Critical Constraints & Decision |
|---|---|---|---|---|---|
| **Creem** (`creem.io`) | **`3.9% + $0.40`** / tx (`$0/mo`) | **Supported** (ID card, no business license) | Matching **Alipay CNY direct** (`$50` min, 1st & 15th, 7–12d hold, `$25` CB fee) | **Yes** (`/v1/licenses/{activate,validate,deactivate}`) | **Primary Global MoR**—but **strictly requires custom domain** (`*.pages.dev` rejected; `Rejected` status is permanent). Test Mode first; Live Review only after custom domain + `support@<domain>`. |
| **Mianbaoduo** (`mbd.pub`) | **`~3%`** (`¥0.1 + 2%` std) | **Supported** (Personal KYC, no business license) | **Alipay / WeChat Pay** | **Yes** (Native static batch `卡密自动发货`) | **Primary China / Immediate Rail**: Zero custom domain barrier; delivers offline Ed25519-signed `RB1.` license keys immediately after KYC. |
| **Gumroad** (`gumroad.com`) | **`10% + $0.50`** / tx | **Supported** (via PayPal payout) | PayPal | **Yes** (`POST /v2/licenses/verify`) | **Optional Global Bridge**: Higher fee (`~12.6%` at `$19`), useful only as a temporary global PayPal bridge if custom domain purchase lags. |
| **Dodo Payments** | **`6.0% + $0.40`** / tx | Via Payoneer | Payoneer | Yes | **Hot Backup**: Standby if MRR > `$200` or Creem triggers manual compliance review. |
| **Polar.sh** | `4% + $0.40` | **Disqualified** | Stripe Connect | Yes | **Rejected**: Stripe Connect payouts do not support Mainland China individuals. |

### 4.2 Model A Unit Economics (`> ¥1,000/mo` Target)
Baseline assumptions from workspace ledger (`pain_points_5_candidates.md:25-37,86-93`): `FX = 7.20 RMB/USD`, `Infra = $10/mo (¥72/mo)`, refund reserve `r_refund = 3%`, Alipay FX spread `f_fx = 2.0%`. Stress scenario: `FX = 7.10`, `f_fx = 3.5%`.

| SKU / Rail | Gross Price | Gateway Fee | Effective Fee % | Net per Sale (Base) | Sales Needed for `> ¥1,000/mo` Net (After `¥72` Infra) |
|---|---|---|---|---|---|
| **Creem Personal (One-Time)** | **`$19.00`** | `$1.141` | `6.01%` | **`$16.97` (`¥122.15`)** | **`9` sales/mo** (`¥1,027.33`); **`10` sales/mo** under stress (`9` stress = `¥996.47`) |
| **Creem Team 5-Seat (One-Time)** | **`$29.00`** | `$1.531` | `5.28%` | **`$26.10` (`¥187.92`)** | **`6` sales/mo** (`¥1,055.53` base; `¥1,023.85` stress) |
| **Creem Alt Subscription** | `$15.00` | `$0.985` | `6.57%` | `$13.31` (`¥95.84`) | `12` sales/mo (`¥1,078.06`) |
| **Mianbaoduo Personal (`卡密`)** | **`¥139`** | `~3%` | `~3.0%` | **`¥130.79`** (after 3% reserve) | **`9` sales/mo** (`¥1,105.07`) |
| **Mianbaoduo Team 5-Seat (`卡密`)** | **`¥199`** | `~3%` | `~3.0%` | **`¥187.24`** | **`6` sales/mo** (`¥1,051.44`) |

- **Pricing Floor Justification (`>= $12–$15`):** A `$5` ticket suffers `11.90%` Creem fee drag (`$0.40` fixed fee) and requires `~36` sales/mo—increasing support overhead and chargeback risk (`$25/case`). `$19` / `$29` keeps fees at `5.3%–6.0%` and reaches the `> ¥1,000/mo` goal in **6–10 sales/month**.
- **5-Seat Team ROI Anchor:** At **`$29` one-time**, a 5-developer team saves **`97.5%` in Year 1** compared to Postman Team (`$19 × 5 × 12 = $1,140/yr`) and **`93.1%` in Year 1** compared to Thunder Client Business (`$7 × 5 × 12 = $420/yr`).

---

## 5. Strategic Diagnosis & Wedge Selection

### 5.1 Why This Wedge Wins
- **Avoid the GUI Clone Trap:** Building a Postman/Thunder sidebar clone puts ReqBridge head-to-head against free `PostMate` (`5.00★`) and `Bruno` (`48.6k ★`).
- **Own the Migration + Batch + Diff Workflow:** Developers adopting Git-native `.http` files (`REST Client` `7.78M` installs / `httpYac` `144k` installs) lack:
  1. **Lossless 4-format parsing** (Postman v2.1, Thunder Client JSON, Bruno `.bru` directories, `.http`) preserving folder auth inheritance, query/path params, bodies, and `pm.test` assertions into `.http` + `.env.example` + **bug-free OpenAPI 3.1 YAML**;
  2. **Unlimited local CSV/JSON batch execution** via Node `fetch` with concurrency control, `p50`/`p95` latency metrics, JUnit XML & Markdown reports;
  3. **Staging-vs-Prod structural schema-drift diffing** (`type_shift`, `missing_key`, `status_drift`, latency delta) ready for PR comments;
  4. **Zero-lock-in CI export** (standalone Node `.mjs` runner + GitHub Actions `.yml`).

### 5.2 Free Core vs. Paid Pro Boundary (`license.ts`)
To earn `4.8★+` Marketplace trust while driving `$19`/`$29` upgrades:
- **Free Core (`tier: 'free'`):**
  - Unlimited migration & transpilation (Postman v2.1 / Thunder Client / Bruno `.bru` / `.http` → `.http`, `.env.example`, OpenAPI 3.1).
  - Unlimited single-request execution and single-endpoint Staging-vs-Prod diff.
  - Built-in batch trial allowance: up to **`10` CSV rows per run** and **`3` batch runs per UTC day**.
- **Paid Pro (`$19` Personal `1 seat / 3 devices`; `$29` Team `5 seats / 15 devices`):**
  - **Unlimited** CSV/JSON batch rows and daily runs.
  - **Collection-wide** Staging-vs-Prod schema diffing.
  - **Standalone CI Bundle Export** (`reqbridge-ci.mjs` + GitHub Actions workflow).
  - **Optional BYOK AI Script Translation** (OpenAI / OpenAI-compatible / Gemini via `x-goog-api-key`, zero embedded keys).
- **Offline + Online Verification:** Offline Ed25519-signed `RB1.<payloadB64Url>.<sigB64Url>` keys (for Mianbaoduo `卡密` and air-gapped teams) + Creem (`/v1/licenses/{activate,validate}`) and Gumroad (`/v2/licenses/verify`) APIs.

---

## 6. Prioritized Roadmap & Milestone Allocation (M1–M5)

| Milestone | Features | Deliverables & Key Actions | Priority Rationale |
|---|---|---|---|
| **M1 (Current)** | F1–F6 | `BENCHMARK_AND_STRATEGY.md` + `extension/` pure-TS zero-`vscode` core (`12` modules `<= 300` lines each) + `6` `node:test` suites with live `node:http` & Ed25519 verification | Establishes shared deterministic engine (`parsers`, `transpiler`, `runner`, `diff`, `ci-exporter`, `license`, `byok`) before UI/web integration. |
| **M2** | F7 | `extension/src/vscode/*` (`.http` CodeLens, Command Palette, `SecretStorage` + `machineId` licensing, CSP-safe Webview reports), `esbuild` bundle, examples, icon, valid `.vsix` | Turns the core engine into an installable VS Code extension (`soulkey-tools.reqbridge-local-api`). |
| **M3** | F8–F9 | Upgrade `landing/demo.js` & HTML: 4-format Tab 1 converter (fixing `seenPaths` & omitting stubs), real browser `fetch` CSV batch runner + JUnit/MD export in Tab 2, real live JSON diff in Tab 3, fix `index.html:241` Bruno `$6` copy, add `robots.txt`/`sitemap.xml`/`favicon.svg`/OG tags, replace `mailto:` dead-ends with `.vsix` CTA + live/ready checkout hooks | Fixes the 0%-conversion landing page and aligns web UX with the real extension. |
| **M4** | F10 | Independent opaque-box E2E suite (`e2e/` Tiers 1–4 + Tier 5 adversarial hardening) & whole-project audit | Guarantees zero stubbed controls, accurate specs, and regression safety before public distribution. |
| **M5** | F11 | GitHub repo + `.vsix` release, Cloudflare Pages live deploy + HTTP 200 verification, VS Code Marketplace publish (`vsce publish --oidc` or Org-Scoped PAT), high-intent developer distribution, `OPERATIONS_LOG.md` & `HUMAN_BLOCKERS.md` | Converts verified software into live installs and first paying revenue while isolating KYC/domain human actions cleanly. |

---

## 7. Verified Citation Table (All 19 Rows / 23+ URLs — Verified `2026-11-26`)

| # | Source / Tool | Verified URL | HTTP | Verified Metric / Claim (`2026-11-26`) |
|---|---|---|---|---|
| 1 | REST Client (Marketplace) | https://marketplace.visualstudio.com/items?itemName=humao.rest-client | 200 | `v0.25.1`, `7,784,055` installs, `4.91★` (`388` ratings); free `.http` runner |
| 2 | REST Client (GitHub) | https://github.com/Huachao/vscode-restclient | 200 | `6,064` stars, `MIT` license |
| 3 | Thunder Client (Marketplace) | https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client | 200 | `v3.2.7`, `7,734,429` installs, `2.35★` (`780` ratings) |
| 4 | Thunder Client Pricing | https://www.thunderclient.com/pricing | 200 | Starter `$3` / Business `$7` / Enterprise `$16`/user/mo; Data-Driven CSV, Git Sync, CLI/CI, WSL paywalled; `50` req/collection, `50` runs/mo free cap |
| 5 | Thunder Client `v3.0.0` | https://github.com/thunderclient/thunder-client-support/discussions/1772 | 200 | Mandatory free account login (`v3.0.0`), `10` collections / `50` req cap (`3,715` repo stars) |
| 6 | Thunder Client `2024-11` | https://github.com/thunderclient/thunder-client-support/discussions/1648 | 200 | Historical free-tier restriction backlash |
| 7 | httpYac (Marketplace & GitHub) | https://marketplace.visualstudio.com/items?itemName=anweber.vscode-httpyac <br> https://github.com/AnWeber/httpyac | 200 | `v6.16.7`, `143,951` installs, `4.96★` (`27`), `896` GitHub stars (`MIT`) |
| 8 | PostMate Client | https://marketplace.visualstudio.com/items?itemName=PostMate-lab.postmate <br> https://postmateclient.com/ | 200 | `v2.8.3`, `5,760` installs, `5.00★` (`4`); free no-login Thunder Client refugee GUI |
| 9 | Console Ninja | https://marketplace.visualstudio.com/items?itemName=WallabyJs.console-ninja | 200 | `v1.0.549`, `1,511,474` installs, `2.90★` (`93`); strict freemium license gating |
| 10 | GitLens | https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens | 200 | `v2026.11.260409`, `54,139,504` installs, `3.37★` (`947`); open-core freemium |
| 11 | Postman Pricing | https://www.postman.com/pricing/ | 200 | Solo `$9/mo`, Team `$19/user/mo`, Enterprise custom |
| 12 | Bruno Pricing & GitHub | https://www.usebruno.com/pricing <br> https://github.com/usebruno/bruno | 200 | `48,576` stars (`MIT`); Free OSS + `$6/user/mo` Pro / `$11–$18+` Ultimate/Ent |
| 13 | Bruno OpenAPI Export Bug | https://github.com/usebruno/bruno/issues/7365 | 200 | OpenAPI export stack-trace failure |
| 14 | Yaak Pricing, Blog & GitHub | https://yaak.app/pricing <br> https://yaak.app/blog <br> https://github.com/mountain-loop/yaak | 200 | `19,549` stars (`MIT`); `$79/yr` Ind, `$149/yr` Biz, `$349` Lifetime; `$160`→`$1,900 MRR` |
| 15 | Hoppscotch Pricing & GitHub | https://hoppscotch.com/pricing <br> https://github.com/hoppscotch/hoppscotch | 200 | `80,982` stars (`MIT`); Free self-hosted + Business/Enterprise per-seat |
| 16 | HTTPie | https://httpie.io/ | 200 | Free OSS CLI funnel + Web/Desktop beta |
| 17 | Creem Pricing & Review Docs | https://www.creem.io/pricing <br> https://docs.creem.io/merchant-of-record/account-reviews <br> https://docs.creem.io/merchant-of-record/account-reviews/rejected-accounts <br> https://docs.creem.io/api-reference/endpoint/activate-license | 200 | `3.9% + $0.40`, Alipay CNY direct, custom domain mandatory (`*.pages.dev` rejected; `Rejected` permanent), License API |
| 18 | Mianbaoduo | https://mbd.pub/ | 200 | China individual KYC (no business license), Alipay/WeChat, `卡密自动发货` |
| 19 | Gumroad | https://gumroad.com | 200 | `~10% + $0.50` MoR, License Verify API, PayPal bridge |
