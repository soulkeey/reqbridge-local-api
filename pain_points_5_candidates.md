# P0 Unbundling 5 大高付费意愿痛点候选与 Phase 1 验证方案（含 #6–#7 止损轮换备份）

> **定位与用途**：唯一 P0 收敛方向（US A 轮 / 成熟垂直 SaaS **Unbundling** × **Zero-AI-Cost / BYOK** 扩展）的选品拍板决策文档，服务 **`HAP-05`（用户 5 选 1 最终拍板）** 与 **`HAP-06`（Phase 1 `<7 天` Smoke Test 外发授权）**。  
> **基准日期**：2026-11-26（UTC+8）。  
> **Phase 0 零产品代码铁律声明**：本文档仅包含痛点分析、模块化规划、财务模型、Smoke Test 方案与着陆页槽位映射；**在 Phase 0 链路门禁与 Phase 1 Day-10 绿灯通过前，工作区 `p0_unbundling_launch\` 内严禁生成任何扩展产品业务逻辑代码**（零 `manifest.json`、零 `extension.ts`、零 `background.js`/`content.js`、零解析器或验签代码）。

---

## 一、总览与 `HAP-05` 拍板对比矩阵

下表按**商业变现潜力 × 平台冷启动风控对冲度（`VS Code Marketplace $0` 规避招行借记卡 `$5` 预授权风险 vs `Chrome Web Store $5`）× 痛点紧迫度**对 5 个**彼此严格独立、零赛道重叠**的主候选进行排序：

| 排名 | 候选名称（建议代号） | 目标平台（`$0` vs `$5`） | 拆解的臃肿 SaaS 与价格锚点 | 建议定价（Creem + 面包多） | 口径 A (`FX=7.20`, `Infra=$10`) 越线 `>¥1,000/月` 所需月销量 | P0 三线过滤 (`F1 / F2 / F3`) | 排序核心理由 |
|---|---|---|---|---|---|---|---|
| **#1** | **Local-First API Collection Runner, Diff & Lossless Converter**<br>*(暂定名：LocalHTTP / ReqBridge)* | **VS Code Marketplace (`$0`)**<br>*(0% 平台抽成，零卡费风险)* | **Postman** (`$9` Solo / `$19` Team / `Contact sales` Ent；Scratch Pad 淘汰、强制云登录)<br>**Thunder Client** (`$3/$7/$16`/人/月；`v3.0.0` 强制免费账号登录，限 50 请求/集合与 50 次/月 Runner，Data-Driven/Git Sync/CLI·CI/WSL 付费锁死) | **`$19` 买断** 或 **`$15/年`** Pro（团队 5 席 **`$29`**）<br>面包多：`¥99–¥139` | **`9` 单/月** @ `$19` (`$171`)<br>或 **`12` 新年单/月** @ `$15/年` (`$180`)<br>*(FX 极端压力下 `$19` 建议 `10` 单安全垫)* | **PASS / PASS / PASS** | 平台 `$0` 零门槛 + 真实迁徙潮（Postman 强云登录 + Thunder Client `v3.0.0` 强登录/配额锁 + Bruno OpenAPI 导出报错）+ 开发者检索意图最集中 |
| **#2** | **SQL Migration Safety, Schema Drift Guard & `U__rollback.sql` Generator**<br>*(暂定名：SafeMigrate / DriftGuard)* | **VS Code Marketplace (`$0`)**<br>*(0% 平台抽成，紧贴 ORM/SQL 文件)* | **Redgate Flyway Teams/Enterprise**（按人头年付报价；Community 版阉割 `undo` 回滚与漂移检测）<br>**Prisma / Drizzle**（改列名变 `DROP+ADD` 丢数据陷阱） | **`$24` 买断** 或 **`$15/月`** Team Pro（年付 **`$59/年`**）<br>面包多：`¥129–¥169` | **`7` 单/月** @ `$24` (`$168`)<br>或 **`12` 订户** @ `$15/月` (`$180`)<br>*(FX 极端压力下 `$24` 建议 `8` 单安全垫)* | **PASS / PASS / PASS** | “防生产库删列丢数据 + 解锁 Flyway 回滚脚本”属极高 WTP 刚需痛点，纯本地 DDL AST + 只读 `INFORMATION_SCHEMA` 对比 |
| **#3** | **Local Browser CRM / Stripe CSV Preflight Validator & Schema Mapper**<br>*(暂定名：CleanSheet / PreflightCSV)* | **Chrome Web Store (`$5`)**<br>*(兜底：若 CWS `$5` 拒付，同架构零代码改动切至 Cloudflare Pages `$0` 纯本地 Web 版 + Creem Key)* | **Flatfile** (`~$799+/月` 企业起步)<br>**OneSchema** (`$20–$200+/人/月`)<br>**CSVbox** (`$19+/月`) | **`$19/月`** 或 **`$29/年`**（买断 **`$39`**）<br>面包多：`¥139–¥199` | **`9` 订户** @ `$19/月` (`$171`)<br>或 **`6` 新单/月** @ `$29/年` (`$174`)<br>*(FX 极端压力下 `$19` 建议 `10` 户安全垫)* | **PASS / PASS / PASS** | 对标价格锚点最高（`$799+/mo`），RevOps/CRM 管理员有公司报销预算；仅因需过 `$5` CWS 卡验证且非 IDE 内生搜索池，排 #3 |
| **#4** | **Figma Dev Mode Unbundler — Design Token to Tailwind v4/CSS & WCAG Contrast Diff**<br>*(暂定名：TokenSync / DevFree)* | **VS Code Marketplace (`$0`)**<br>*(0% 平台抽成)* | **Figma Dev Mode** (`$12` Pro / `$25` Org / `$35` Ent 每开发者/月；Full 席 `$16–$90/月`) | **`$19` 买断** 或 **`$15/年`**（团队包 **`$49`**）<br>面包多：`¥99–¥139` | **`9` 单/月** @ `$19` (`$171`)<br>或 **`12` 新年单/月** @ `$15/年` (`$180`)<br>*(FX 极端压力下 `$19` 建议 `10` 单安全垫)* | **PASS / PASS / PASS** | 直击前端团队抵制 Figma Dev Mode 按席收税痛点，以本地 W3C DTCG `.tokens.json` + 免费 PAT File/Styles REST API（及可选伴随插件）编译 Tailwind v4 `@theme`，避开企业版独占 Variables API |
| **#5** | **Notion & Airtable Relational Snapshot, 2h-Attachment Mirror & Clean MD/PDF Bundler**<br>*(暂定名：VaultSnap / BaseArchive)* | **Chrome Web Store (`$5`)**<br>*(技术向 PKM 用户可并行/切至 VS Code `$0` 或 Cloudflare Pages `$0` 本地 ZIP 方案)* | **Notion Backups** (`$6/$11/$28/$89`/月)<br>**ProBackup** (`$25–$31`/月)<br>**Whalesync** (`$16–$39+`/月) | **`$19` 买断** 或 **`$15/年`**（双平台 Pro **`$29`**）<br>面包多：`¥99–¥139` | **`9` 单/月** @ `$19` (`$171`)<br>或 **`12` 新年单/月** @ `$15/年` (`$180`)<br>*(FX 极端压力下 `$19` 建议 `10` 单安全垫)* | **PASS / PASS / PASS** | 精准解决 Airtable 附件 URL 2 小时过期与 Notion 大库导出卡死/UUID 破链接/PDF 截断痛点；打印需在独立扩展标签页执行且 Web 兜底仅限本地 ZIP 模式 |

---

## 二、统一财务口径与 `landing/index.html` 接口映射契约

### 2.1 收敛报告口径 A 统一计算公式（Python 精算核验）
严格遵循 `side_income_2026_convergence_report.md` §1.3 公式（无服务端 AI 账单 `c_API = 0%`，`GM = 100%`；自然人在读 `≤60,000 RMB/年` 实际个税 `0%`；`W-8BEN = 0%` 非美 MoR 直提）：
- **基准参数**：`FX = 7.20 RMB/USD`、`Infra = $10/月`（`= ¥72.00/月`，注：Phase 0/1 使用 Cloudflare Pages `$0` 实际基建为 `$0`，口径 A 仍按保守 `$10` 计入，即每月总净贡献须 **`> ¥1,072.00`** 方可实现净赚 **`> ¥1,000/月`**）、退款率 `r_refund = 3%`、支付宝人民币提现隐含汇兑点差 `f_fx = 2.0%`、**Creem 费率 `3.9% + $0.40/笔`**、**面包多费率 `3.0%`（或 Pay `2.0% + ¥0.10`）**。
- **海外 Creem 单笔净贡献公式**：
  $$u_{\text{RMB}}(P) = \Big[\big(P \cdot (1 - 0.03) \cdot (1 - 0.039) - 0.40\big) \cdot (1 - 0.02)\Big] \times 7.20$$
  简化校验系数：$(1 - 0.03)(1 - 0.039) = 0.93217$，$(1 - 0.02) \times 7.20 = 7.056$，即 $u_{\text{RMB}}(P) = (0.93217 P - 0.40) \times 7.056$。
- **买断制与年付制 vs 月度订阅制口径铁律**（防误判）：
  - 若定价为 **`$15/月` 或 `$19/月` 月度订阅**：维持 `12` 名（@ `$15/月`）或 `9` 名（@ `$19/月`）活跃留存订户，即可每月持续净赚 **`¥1,078.06`** / **`¥1,027.33`**（`> ¥1,000`）；
  - 若定价为 **`$19` / `$24` / `$29` 一次性买断**，或 **`$15/年` / `$29/年` 年度订阅**：**年付计划的当月现金流特征与一次性买断完全相同**——“越线门槛”均指**每月必须持续新增成交 `N` 笔年付/买断订单**（即 **`$15/年` 需每月新增 `12` 单、`$19` 需 `9` 单、`$24` 需 `7` 单、`$29/年` 或买断需 `6` 单**），**严禁**将 `$15/年` 折算为 `$1.25/月` MRR 或把“累计 9 位客户”误当成每月持续收益。
- **FX 汇率与点差压力敏感度（`FX = 7.10`, `f_fx = 3.5%`, `Infra = $10 = ¥71.00/月`）**：
  - 在汇率回落且汇兑点差扩大至 `3.5%` 的压力情景下（系数 `(1 - 0.035) × 7.10 = 6.8515`）：`12` 单 @ `$15` 净赚 **`¥1,045.73/月`**、`6` 单 @ `$29` 净赚 **`¥1,023.85/月`**、`5` 单 @ `$39` 净赚 **`¥1,160.72/月`**（均仍过线）；但 **`9` 单 @ `$19` 仅得 `¥996.47/月`（`$16.97` 基准折为 `¥118.61/单`）**、**`7` 单 @ `$24` 仅得 `¥982.79/月`（`¥150.54/单`）**，略低于 `¥1,000` 红线。
  - **运营安全垫建议**：对 `$19` 档位执行 **`+1` 安全垫（目标 `10` 单/月 → 压力情景 `¥1,115.08/月`）**，对 `$24` 档位执行 **`+1` 安全垫（目标 `8` 单/月 → 压力情景 `¥1,133.33/月`）**。
- **国内面包多补充轨**：`u_MBD(P_RMB) = P_RMB × 0.97 × 0.97 = 0.9409 × P_RMB`（标准 3% 扣除 3% 退款预留）；在 `¥99 / ¥129 / ¥139 / ¥169` 档位下，若单独计算（含 `¥72` 基建折算）分别需 `12 / 9 / 9 / 7` 单/月，实操中作为海外主线的中文激活码增量补充轨，直接复用同套扩展与静态卡密/License 体系。

### 2.2 与 `landing/index.html` 着陆页骨架的 1:1 槽位映射（供 `HAP-05` 选定后直接替换）

| 候选排名 | `[PRODUCT_NAME]` 建议槽位 | `[ONE_LINE_PAIN_SOLUTION]` 建议槽位 | `#pricing` 硬定价区槽位 |
|---|---|---|---|
| **#1** | `ReqBridge Local API` | Lossless Postman/Bruno/`.http` converter + unlimited local data-driven runner in VS Code—no cloud login, no 50-request/50-run cap. | **`$19` One-time** (or **`$15/yr`** Pro / `$29` Team 5-pack) |
| **#2** | `SafeMigrate Guard` | Catch Prisma/Drizzle `DROP+ADD` rename data loss & generate Flyway-style `U__rollback.sql` scripts locally in VS Code. | **`$24` One-time** (or **`$15/mo`** Team Pro) |
| **#3** | `PreflightCSV Local` | 100% browser-local HubSpot/Salesforce/Stripe CSV validator & FK mapper—catch date, encoding & duplicate bugs before upload. | **`$19/mo`** (or **`$29/yr`** / `$39` Lifetime) |
| **#4** | `TokenSync Tailwind` | Compile local W3C DTCG `.tokens.json` & Figma Styles to Tailwind v4 `@theme` CSS + WCAG dark-mode contrast diff in VS Code—zero `$12–$35/mo` Dev Mode seats. | **`$19` One-time** (or **`$15/yr`** Pro) |
| **#5** | `BaseVault Snapshot` | Mirror Airtable attachments before 2h expiry & scrub Notion export UUIDs into clean Obsidian Markdown + paginated PDF. | **`$19` One-time** (or **`$15/yr`** Pro) |

---

## 三、5 个独立高付费意愿 Unbundling 候选深度方案

---

### 候选 #1：Local-First API Collection Runner, Diff & Lossless Cross-Tool Converter

#### 1. 排名、目标平台与排序理由
- **排名**：**#1（首选推荐）**
- **目标平台**：**VS Code Marketplace（`$0` 注册、0% 平台抽成）**
- **排序理由**：
  1. **零出向卡阻断风险**：`$0` 注册费完全对冲招行万事达借记卡在 Google Payments `$5` 预授权被拒的风险；
  2. **三方竞品同时制造迁移潮**：Postman 淘汰离线 Scratch Pad 并强制云登录、Thunder Client 自 2024 年 11 月（`#1648`）大幅收紧后又在 2026 年 10 月 `v3.0.0`（`#1772`）强制登录免费账号并锁死高阶自动化与配额、开源 Bruno 虽火但 OpenAPI 导出存在崩溃报错（Issue `#7365`），开发者正处于强烈的“逃离云锁定、回归 Git 本地工作流”付费窗口；
  3. **极高自然搜索意图**：VS Code 扩展商店自带海量搜 `"Postman"` / `"REST Client"` / `"Thunder Client"` 的高意图流量。

#### 2. 臃肿竞品 SaaS 与精确价格锚点
- **Postman**：免费版仅限单人且强制云账号/工作区同步（离线 Scratch Pad 已退出主线并引流至云端）；实时官网定价为 **Solo `$9/月`、Team `$19/用户/月`（按年计费）、Enterprise `Contact sales`（定制报价）**。
- **Thunder Client**：2024 年 11 月曾在 Discussion `#1648` 宣布免费版仅限非商用并取消 OAuth 2 / Docs / WSL 支持；2026 年 10 月 **`v3.0.0`（Discussion `#1772`）及现行 `thunderclient.com/pricing` 改为允许免费版商用，但新增强制条件——必须注册并登录免费 Thunder Client 账号方可使用**，且免费版仍受 **每集合 50 请求上限（10 集合上限）与 Collection Runner 每月每用户 50 次上限** 制约，并将 **Data-Driven Testing、Git Sync、CLI/CI、Custom Scripting 与 VS Code Web/Remote/WSL** 全部锁在 **Starter `$3/用户/月`、Business `$7/用户/月`、Enterprise `$16/用户/月`**（按年计费）付费墙后。
- **对比锚点**：5 人开发团队使用 Postman Team 年付 **`$1,140/年`**，使用 Thunder Client Business 年付 **`$420/年`**；本扩展 `$19` 买断或 `$29` 团队 5 席包仅为竞品年费的 **1.7%–6.9%**。

#### 3. Unbundled 微工作流与 Pro 配额合规 MVP 范围
- **核心切口**：不做又一个大而全的 HTTP GUI 客户端，只做 **“零云端迁移转换器 + 无上限本地批跑器 + 环境响应 Diff 器”**。
- **模块化 MVP 拆解（5 个独立模块，单模块 `≤ 300` 行，总计 `~1,400` 行，Phase 0 零代码）**：
  1. `parser-postman-bru.ts`（`≤280` 行）：确定性解析 Postman Collection v2.1 JSON 与 Bruno `.bru` 文件，保留 Auth Header、环境变量与常见 `pm.test` 断言块。
  2. `transpiler-http-openapi.ts`（`≤280` 行）：双向无损转译为 VS Code `.http` 文本格式与 OpenAPI 3.1 YAML/JSON，修复常见导出 schema 断裂。
  3. `local-batch-runner.ts`（`≤290` 行）：基于 Node 内置 `undici` 本地直连执行 `.http` / `.bru` / Postman JSON 集合，支持 CSV/JSON 参数化迭代（零 Postman 25 次/月与 Thunder Client 50 次/月限制），导出 JUnit XML 与 Markdown 报告。
  4. `env-response-diff.ts`（`≤250` 行）：并排对比 `staging` vs `prod` 响应 JSON Schema 与延迟变化（Git 友好快照）。
  5. `license-creem-gate.ts`（`≤220` 行）：本地试用限额门控（如免费试跑 3 次转换 / 限 10 条请求，无永久免费白嫖层）+ Creem / 面包多激活码离线/API 校验。
- **Pro 配额护栏合规**：核心 1–4 模块纯确定性逻辑，可用 `Flash/Hydrogen` 分会话单模块生成（周副业配额消耗 **`≤ 30%–40%`**）；仅第 5 模块 Creem License 校验调用高阶模型（`Neon/Opus`）；稳态周维护 **`1–2h/周`**。

#### 4. 三条 P0 结构过滤线核查（F1 / F2 / F3）
- **F1（Zero-AI-Cost / BYOK）— PASS**：全流程采用确定性 JSON/YAML/AST 词法解析与 Node `undici` HTTP 执行，服务端 AI 成本 `$0`（毛利 100%）；可选提供 **BYOK 槽位**（用户自带 OpenAI/Gemini Key 辅助翻译非标复杂 `pm.test()` JS 脚本）。
- **F2（跨工具流转或多步批处理）— PASS**：打通 `Postman <-> Bruno (.bru) <-> REST Client (.http) <-> OpenAPI 3.1` 跨工具格式流转 + CSV 数据驱动批跑 + 双环境响应 Diff 多步闭环；不是单一 UI 按钮补丁，6 个月内极难被 VS Code 原生内置 Sherlocking。
- **F3（零高频 DOM 逆向爬虫）— PASS**：100% 基于本地文件系统（`.json`/`.bru`/`.http`/`.yaml`）与官方 VS Code Extension API，完全不依赖任何网页 DOM 逆向抓取。

#### 5. 定价与单位经济精算（Creem + 面包多，口径 A）
- **定价**：**`$19` 买断**（或 **`$15/年`** Pro；5 席团队包 **`$29`**）；国内面包多 **`¥139` 买断**（或 `¥99/年`）。
- **Creem (`3.9% + $0.40`) 净利拆解**：
  - `@ $19`：总手续费 `3.9% × 19 + $0.40 = $1.141`（**有效费率 `6.01%`**）；扣除 3% 退款预留及 2% 支付宝汇差后，单笔净贡献 **`$16.97`（`¥122.15` @ 7.20）**。
  - `@ $15`：总手续费 `$0.985`（**有效费率 `6.57%`**），单笔净贡献 **`$13.31`（`¥95.84` @ 7.20）**。
- **口径 A（`FX=7.20`, `Infra=$10=¥72`, 净赚 `>¥1,000` 即总贡献 `>¥1,072`）越线销量**：
  - 按 **`$19` 买断**：每月需稳定新增 **`9` 单/月**（流水 `$171/月`，税前净利 **`¥1,027.33/月`**；在 `FX=7.10, f_fx=3.5%` 压力情景下 `9` 单仅 `¥996.47/月`，建议按 **`10` 单/月** 安全垫运营）；
  - 按 **`$15/年` 年付（同买断现金流口径）或 `$15/月` 订阅**：需 **`12` 新年单/月**（或留存 `12` 名月订户，流水 `$180/月`，净利 **`¥1,078.06/月`**，不可按月均 `$1.25/月` 分摊误判）；
  - 面包多国内补充轨（`~3%`）：`@ ¥139` 单笔净入 **`¥130.79`**（`¥99` 为 `¥93.15`），可作为中文区高毛利增量。

#### 6. Phase 1 `<7 天` Smoke Test 方案
- **精准无垃圾群发 ICP 导流渠道（目标 `≥ 100–150` UV）**：
  1. 在 `r/vscode`、`r/sysadmin`、`r/opensource` 关于 Postman 强登录 / Thunder Client 收费的现存讨论与新提问下提供干货迁移指南回复（附带 Smoke Test 工具页链接）；
  2. 在 Dev.to / Hashnode 发布 1 篇实操对比文（*"Escaping Postman Cloud Lock-In & Thunder Client Paywalls: Lossless Migration to Git-Native `.http`"*）；
  3. 针对 GitHub `usebruno/bruno` 等公开讨论中遇到 OpenAPI 导出转换报错的开发者提供解决思路与早鸟页入口。
- **Day-10 Kill-Switch 门禁**：
  - **🟢 绿灯（进 Phase 2）**：`≥ 100–150` 定向 UV 下结账按钮 CTR **`≥ 2%–5%`**（`≥ 3–5` 次真实点击）**或**获得 **`≥ 1–2` 笔**真实早鸟预购；
  - **🟡 黄灯（限 1 次 3 天微调）**：CTR `1%–2%` 且收到具体功能追问 → 微调 1 次痛点 GIF 文案或定价展示，第 13 天终判；
  - **🔴 红灯（立即 Kill 止损）**：`≥ 150` 定向 UV 下结账 CTR **`< 1%` 且 `0` 预购** → 第 10 天立即止损，轮换至候选 #2 或备选。
- **⚠️ 外发授权硬门禁（`HAP-06`）**：**在用户明确批准外发账号与具体发帖文案前（`HAP-06`），严禁向任何 Reddit/Dev.to/GitHub 社区自动或手动发出任何帖子或评论。**

#### 7. Live Verified 实证链接（全部 `HTTP 200` 实测可达）
1. **[Plans & Pricing | Postman API Platform](https://www.postman.com/pricing/)** (`HTTP 200`) — 实测锚定 Postman 付费阶梯（Solo `$9/mo`、Team `$19/user/mo`、Enterprise `Contact sales for pricing`，Free 仅限单用户）。
2. **[Build and send requests offline using the Scratch Pad | Postman Docs](https://learning.postman.com/docs/getting-started/basics/using-scratch-pad)** (`HTTP 200`) — 官方文档记录离线 Scratch Pad 被边缘化并引导用户迁往云端账户体系的背景。
3. **[Pricing - Thunder Client](https://www.thunderclient.com/pricing)** (`HTTP 200`) — 实测确认免费版允许个人与商用（*"Yes. The free version is available for both personal and commercial use"*），但限制每集合 50 请求、Collection Runner 50 次/人/月，并将 Data-Driven Testing、Git Sync、CLI & CI/CD、VS Code Web/Remote/WSL 锁在 Starter `$3` / Business `$7` / Enterprise `$16` 每人每月档位后。
4. **[v3.0.0 - Improved Free Plan · thunderclient/thunder-client-support · Discussion #1772 · GitHub](https://github.com/thunderclient/thunder-client-support/discussions/1772)** (`HTTP 200`) — 证实 2026 年 10 月 `v3.0.0` 将免费版改为“必须注册并登录免费 Thunder Client 账号”方可使用（*"A free Thunder Client account is now required to use the Free Plan"*），并限制最多 10 collections / 50 requests per collection。
5. **[Changes to the Free Version · thunderclient/thunder-client-support · Discussion #1648 · GitHub](https://github.com/thunderclient/thunder-client-support/discussions/1648)** (`HTTP 200`) — 记录 2024 年 11 月历史政策转折（曾限制非商用及取消免登录/OAuth 2/Docs/WSL 支持并引发强烈开发者不满），与 `v3.0.0` 强登录转型共同形成长期迁移痛点。
6. **[OpenAPI Specification Export Failed - Shows Stack Trace of error · Issue #7365 · usebruno/bruno · GitHub](https://github.com/usebruno/bruno/issues/7365)** (`HTTP 200`) — 原文摘要：*"This bug is: making Bruno unusable for me / slowing me down"*，实证开源替代品在跨格式导出链路存在真实工程痛点。
7. **[Reddit `r/vscode` — Alternative for Thunder Client in VS Code](https://www.reddit.com/r/vscode/comments/169c293/alternative_for_thunder_client_in_vscode/)** (`HTTP 200`, 页面 SSR 壳标题 `Reddit`) — 社区讨论“先免费后收费”与寻找纯本地 VS Code API 客户端替代。
8. **[Reddit `r/sysadmin` — What's the best Postman alternative that works](https://www.reddit.com/r/sysadmin/comments/1nbgelb/whats_the_best_postman_alternative_that_works/)** (`HTTP 200`, 页面 SSR 壳标题 `Reddit`) — 吐槽 Postman 强制登录与高内存占用。

---

### 候选 #2：SQL Migration Safety, Schema Drift Guard & Rollback SQL Generator

#### 1. 排名、目标平台与排序理由
- **排名**：**#2**
- **目标平台**：**VS Code Marketplace（`$0` 注册、0% 平台抽成）**
- **排序理由**：
  1. **痛点后果极端严重（生产库丢数据）**：误把改名编译为 `DROP COLUMN + ADD COLUMN` 或缺少 Flyway 回滚脚本会导致直接线上事故，开发者对此类“防事故保险工具”付费意愿极高；
  2. **平台零费率且开发栈高度契合**：`$0` 规避招行卡风险，扩展直接驻留在 `prisma/schema.prisma`、`drizzle/*.sql` 与 `flyway/sql/V*.sql` 旁；
  3. 仅因检索高频词略偏架构/后端团队（略窄于 API 测试日常频次）排在 #1 之后。

#### 2. 臃肿竞品 SaaS 与精确价格锚点
- **Redgate Flyway Teams / Enterprise**：按年按开发者人头销售商业报价；开源免费的 **Community 版明确阉割 `flyway undo` 回滚迁移脚本与自动化 Schema 漂移检测**，逼迫中小团队购买昂贵企业授权。
- **Prisma Migrate & Drizzle-Kit**：声明式 diff 均存在经典致命缺陷——在 `schema.prisma` 或 Drizzle schema 中重命名字段时，自动生成 **`DROP COLUMN` + `ADD COLUMN`**（Prisma Issue `#4694`：*"It loses the data"*；Prisma 官方文档明确要求手工 `--create-only` 修改 SQL；Drizzle Issue `#2047` 同样触发 `WARNING DATA LOSS`）。

#### 3. Unbundled 微工作流与 Pro 配额合规 MVP 范围
- **核心切口**：不做完整数据库 GUI（不抢 DBeaver/DataGrip 饭碗），专注 **“迁移脚本上线前安全审计 + 一键安全改名重写 + Flyway 风格 `U__rollback.sql` 逆向脚本生成 + 只读库漂移对比”**。
- **模块化 MVP 拆解（5 个独立模块，单模块 `≤ 300` 行，总计 `~1,350` 行，Phase 0 零代码）**：
  1. `sql-danger-linter.ts`（`≤270` 行）：确定性 SQL DDL / Prisma / Drizzle 迁移文件扫描器，标红 `DROP+ADD` 假性改名、无 `USING` 强转、隐式锁表 `ALTER TABLE` 与丢失索引。
  2. `safe-rename-rewriter.ts`（`≤260` 行）：一键将危险 `DROP+ADD` 重写为安全 `RENAME COLUMN` 或三步 Expand-and-Contract SQL。
  3. `rollback-sql-generator.ts`（`≤290` 行）：基于正向 `V<ver>__*.sql` 或 ORM 迁移文件自动合成逆向补偿脚本 `U<ver>__rollback.sql`（填补 Flyway Community 空白）。
  4. `schema-drift-readonly.ts`（`≤280` 行）：使用只读连接查询 Postgres `pg_catalog` / MySQL `INFORMATION_SCHEMA` / SQLite `sqlite_master`，对比真实库与本地迁移文件夹的漂移差异。
  5. `license-creem-gate.ts`（`≤220` 行）：前 2 次本地文件审计免费试用 + Creem / 面包多 License Key 解锁批量生成与实时库漂移检查。
- **Pro 配额护栏合规**：全部采用 `node-sql-parser` / 确定性规则 AST 与标准只读 SQL 元数据查询，85%+ 代码可由 `Flash/Hydrogen` 生成，周配额消耗 **`≤ 35%`**，维护 **`1–2h/周`**。

#### 4. 三条 P0 结构过滤线核查（F1 / F2 / F3）
- **F1（Zero-AI-Cost / BYOK）— PASS**：纯确定性 DDL AST 解析与数据库系统表对比，0 运行时 AI 成本，100% 毛利；不可靠的 AI 幻觉反而不适合生成生产 SQL。
- **F2（跨工具流转或多步批处理）— PASS**：串联 `Prisma/Drizzle/Flyway 迁移文件` → 危险操作与锁表审计 → 安全改名重写 → `U__rollback.sql` 逆向脚本生成 → 真实数据库只读 Schema 漂移对比。
- **F3（零高频 DOM 逆向爬虫）— PASS**：只读取本地工作区迁移文件与用户自主配置的只读数据库连接（`INFORMATION_SCHEMA`），零任何网页 DOM 抓取。

#### 5. 定价与单位经济精算（Creem + 面包多，口径 A）
- **定价**：**`$24` 买断**（个人/独立开发者）或 **`$15/月`** Team Pro（年付 **`$59/年`**）；国内面包多 **`¥169` 买断**（或 `¥108/年`）。
- **Creem (`3.9% + $0.40`) 净利拆解**：
  - `@ $24`：总手续费 `3.9% × 24 + $0.40 = $1.336`（**有效费率 `5.57%`**），单笔净贡献 **`$21.53`（`¥155.03` @ 7.20）**。
  - `@ $15/月`：总手续费 `$0.985`（**有效费率 `6.57%`**），单笔净贡献 **`$13.31`（`¥95.84` @ 7.20）**。
- **口径 A（`FX=7.20`, `Infra=$10=¥72`, 净赚 `>¥1,000`）越线销量**：
  - 按 **`$24` 买断**：每月需稳定新增 **`7` 单/月**（流水 `$168/月`，净利 **`¥1,013.24/月`**；在 `FX=7.10, f_fx=3.5%` 压力情景下 `7` 单仅 `¥982.79/月`，建议按 **`8` 单/月** 安全垫运营）；
  - 按 **`$15/月` 订阅**：留存 **`12` 名月订户**（MRR `$180/月`，净利 **`¥1,078.06/月`**）；
  - 面包多国内补充轨（`~3%`）：`@ ¥169` 单笔净入 **`¥159.01`**，仅 `7` 单即超 `¥1,000`。

#### 6. Phase 1 `<7 天` Smoke Test 方案
- **精准无垃圾群发 ICP 导流渠道（目标 `≥ 100–150` UV）**：
  1. 在 `r/PostgreSQL`、`r/Backend`、`r/node` 发布高干货技术拆解帖（*"Why Prisma/Drizzle Turn Column Renames into DROP+ADD Data Loss — and How to Generate Safe Expand-Contract & Rollback SQL Locally"*）；
  2. 在 Dev.to / Stack Overflow/GitHub 讨论中针对 `"flyway undo community alternative"` 与 `"prisma rename column safely"` 搜索需求作答并附早鸟着陆页；
  3. 定向联系最近在 Prisma/Drizzle Issues 中反馈数据丢失痛点的活跃开发者（仅限公开合规渠道礼貌分享）。
- **Day-10 Kill-Switch 门禁**：
  - **🟢 绿灯**：`≥ 100–150` UV 下 CTR **`≥ 2%–5%`** 或 `≥ 1–2` 笔预购 → 进 Phase 2；
  - **🟡 黄灯**：CTR `1%–2%` → 仅 1 次文案/定价微调，第 13 天终判；
  - **🔴 红灯**：`≥ 150` UV 下 CTR **`< 1%` 且 `0` 预购** → 第 10 天立即 Kill 止损并切换候选。
- **⚠️ 外发授权硬门禁（`HAP-06`）**：**未经用户明确授权外发账号与具体发帖内容（`HAP-06`），不得向外发出任何社区帖或私信。**

#### 7. Live Verified 实证链接（全部 `HTTP 200` 实测可达）
1. **[Flyway: Pricing & Free Tier (2026) - DevGems](https://www.devgems.io/item/flyway)** (`HTTP 200`) — 明确记录 Redgate Flyway 将 `undo` 回滚迁移与 Schema 漂移治理锁定在商业版/企业版报价阶梯。
2. **[Undoing to previous major version · Issue #3464 · flyway/flyway · GitHub](https://github.com/flyway/flyway/issues/3464)** (`HTTP 200`) — 原文记录 *"Which version and edition of Flyway are you using? Teams 8.4.2 (trial)"*，直接佐证 `undo` 功能仅存在于付费 Teams/Enterprise 试用版及以上。
3. **[Rename table's column · Issue #4694 · prisma/orm · GitHub](https://github.com/prisma/orm/issues/4694)** (`HTTP 200`) — 原文实证：*"After renaming a column in schema.prisma, Prisma Migrate executes the following steps: 1 - ALTER TABLE ... DROP COLUMN 2 - ADD COLUMN ... It loses the data."*
4. **[Customizing migrations (Prisma ORM v6) | Prisma Documentation](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations)** (`HTTP 200`) — 官方文档标题与摘要证实：*"How to edit a migration file before applying it to avoid data loss in production."*（需人工介入改写）。
5. **[[BUG]: Modifying a column causes WARNING DATA LOSS · Issue #2047 · drizzle-team/drizzle-orm · GitHub](https://github.com/drizzle-team/drizzle-orm/issues/2047)** (`HTTP 200`) — 实证 Drizzle 变更列定义同样会触发破坏性 `WARNING DATA LOSS` 行为。
6. **[Reddit `r/java` — Flyway in 2024](https://www.reddit.com/r/java/comments/1b8pykc/flyway_in_2024/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 开发者讨论 Flyway 将自动化回滚等关键能力锁进商业收费版。
7. **[Reddit `r/Backend` — Backend devs what do you use for database](https://www.reddit.com/r/Backend/comments/1p0bsc2/backend_devs_what_do_you_use_for_database/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 后端开发者吐槽声明式 schema diff 删列重建风险。

---

### 候选 #3：Local Browser CRM / Stripe / Shopify CSV Preflight Validator & Schema Mapper

#### 1. 排名、目标平台与排序理由
- **排名**：**#3**
- **目标平台**：**Chrome Web Store（`$5` 一次性注册、0% 平台抽成）**  
  *(Phase 0 招行卡兜底方案：若招行万事达卡在 CWS `$5` 预授权失败，同一套前端纯本地代码 **0 业务逻辑改动**即可直接部署为 Cloudflare Pages `$0/月` 纯客户端 Web 工具 + Creem License Key，不受 CWS 阻断！)*
- **排序理由**：
  1. **竞品价格锚点最高（`$799+/mo`）且买方拥有企业报销预算**：RevOps、HubSpot/Salesforce 管理员与财务运营团队一旦导入脏 CSV 触发工作流群发或数千条重复记录，善后成本极高，`$19/mo` 或 `$29/yr` 极易获得批准；
  2. **“100% 本地不上传 PII”构成绝佳合规护城河**：大量中小公司禁止把客户邮箱/手机号/Stripe 账单上传到随机在线 CSV 工具；
  3. 仅因目标用户不在 VS Code 内、且首发需先验证 `$5` CWS 扣款（或走独立 Web 落地页冷启动），排在 #1–#2 之后。

#### 2. 臃肿竞品 SaaS 与精确价格锚点
- **Flatfile**：定位企业级嵌入式数据导入门户，Vendr 采购基准显示门槛高达 **`$799+/月`** 甚至更高，小团队与 RevOps 内部运营完全买不起也用不上 SDK 嵌入。
- **OneSchema**：起始入门 **`$20/月`**，进入数据运营与高容量清洗档位飙升至 **`$200+/用户/月`** 另加按文件计费。
- **CSVbox**：托管 SaaS 导入组件 **`$19+/月`** 起步（有行数/文件配额限制）。
- **手工痛点**：HubSpot 管理员在 `r/hubspot` 吐槽脏 CSV 导入（编码乱码、欧美日期混用、`N/A` 哨兵值、跨表关联失败）是引发数天手动合并去重的“静默杀手”。

#### 3. Unbundled 微工作流与 Pro 配额合规 MVP 范围
- **核心切口**：不做“需开发者写代码嵌入自己 SaaS 的 B2B SDK”，而是直接给 **CRM / 财务运营人员** 提供浏览器侧边栏/弹窗中的 **“零上传本地预检清洗与多表外键校验器”**（导入 HubSpot/Salesforce/Stripe 前最后一道本地安检门）。
- **模块化 MVP 拆解（5 个独立模块，单模块 `≤ 300` 行，总计 `~1,450` 行，Phase 0 零代码）**：
  1. `csv-encoding-locale.ts`（`≤260` 行）：纯浏览器内存解析（基于 `PapaParse`），自动识别修复 Windows-1252 / UTF-8 BOM 乱码、混杂的 `MM/DD` vs `DD/MM` 日期格式及 `"N/A"`/`"null"`/`"Unknown"` 哨兵脏值。
  2. `crm-schema-templates.ts`（`≤290` 行）：内置 **HubSpot（Contacts / Companies / Deals）**、**Salesforce**、**Stripe Customers/Invoices** 与 **Shopify Products** 严格字段规范模板（含必填列、枚举值与 `libphonenumber-js` E.164 手机号校验）。
  3. `relational-fk-checker.ts`（`≤280` 行）：支持同时拖入多张 CSV（如 `companies.csv` + `deals.csv`），在本地完成跨表外键关联完整性检查与邮箱/域名重复爆炸预警。
  4. `batch-autofix-exporter.ts`（`≤290` 行）：网格批量一键修复（去空格、统一大小写、日期标准化、正则批量替换），输出干净 UTF-8 CSV + 本地 JSON 审计日志（**零数据离开浏览器**）。
  5. `license-creem-gate.ts`（`≤220` 行）：免费预检前 100 行，超过 100 行或导出清洗后文件需 Creem / 面包多 License Key 激活。
- **Pro 配额护栏合规**：全部核心清洗逻辑为确定性 JS 数据处理（可由 `Flash/Hydrogen` 单模块生成，周配额 **`≤ 40%`**）；稳态周维护 **`1–2h/周`**。

#### 4. 三条 P0 结构过滤线核查（F1 / F2 / F3）
- **F1（Zero-AI-Cost / BYOK）— PASS**：确定性字符编码探测、日期正则启发式与手机号/Schema 校验，零 AI 推理成本（100% 毛利）；可选提供 **BYOK 槽位**（用户自带 OpenAI/Gemini Key 做混乱非标列名的智能映射推荐）。
- **F2（跨工具流转或多步批处理）— PASS**：多 CSV 同时摄取 → 编码与区域日期修复 → 跨表外键关联完整性核查 → 批量规则清洗 → 生成目标 CRM（HubSpot/Salesforce/Stripe/Shopify）零报错导入包。
- **F3（零高频 DOM 逆向爬虫）— PASS**：仅处理用户主动拖入扩展面板的本地 CSV/XLSX 文件，**绝不爬取或注入 HubSpot/Salesforce/Stripe 页面 DOM**。

#### 5. 定价与单位经济精算（Creem + 面包多，口径 A）
- **定价**：**`$19/月`** 订阅 或 **`$29/年`**（早鸟买断 **`$39`**）；国内面包多 **`¥139/年`** 或 **`¥199` 买断**（针对跨境 Shopify/Stripe 运营）。
- **Creem (`3.9% + $0.40`) 净利拆解**：
  - `@ $19/月`：有效费率 **`6.01%`**，单客净贡献 **`$16.97`（`¥122.15` @ 7.20）**；
  - `@ $29/年`：总手续费 `3.9% × 29 + $0.40 = $1.531`（**有效费率 `5.28%`**），单笔净贡献 **`$26.10`（`¥187.92` @ 7.20）**；
  - `@ $39` 买断：总手续费 `$1.921`（**有效费率 `4.93%`**），单笔净贡献 **`$35.24`（`¥253.70` @ 7.20）**。
- **口径 A（`FX=7.20`, `Infra=$10=¥72`, 净赚 `>¥1,000`）越线销量**：
  - 按 **`$19/月` 订阅**：留存 **`9` 名月订户**（MRR `$171/月`，净利 **`¥1,027.33/月`**；在 `FX=7.10, f_fx=3.5%` 压力情景下 `9` 户仅 `¥996.47/月`，建议留存 **`10` 名** 安全垫）；
  - 按 **`$29/年` 年付（同买断现金流口径）或 `$29` 单笔订单**：每月需稳定新增 **`6` 新单/月**（`$174/月`，净利 **`¥1,055.53/月`**，不可按月均分摊为 MRR）；
  - 按 **`$39` 买断**：每月仅需 **`5` 单/月**（`$195/月`，净利 **`¥1,196.48/月`**）。

#### 6. Phase 1 `<7 天` Smoke Test 方案
- **精准无垃圾群发 ICP 导流渠道（目标 `≥ 100–150` UV）**：
  1. 在 `r/hubspot`、`r/salesforce`、`r/RevOps`、`r/SaaS` 分享纯干货清单贴（*"Zero-Upload Local Preflight Checklist for HubSpot & Stripe CSV Imports: Catch EU Dates, `N/A` Traps & Broken Company-Deal Links Before Upload"*）；
  2. 在 HubSpot Community 论坛及 RevOps Slack/公开问答中，回复抱怨 Flatfile 太贵或不敢把客户 PII 传给在线 CSV 工具的用户；
  3. 附带 30 秒本地零上传 Before/After GIF 演示页。
- **Day-10 Kill-Switch 门禁**：
  - **🟢 绿灯**：`≥ 100–150` UV 下 CTR **`≥ 2%–5%`** 或 `≥ 1–2` 笔预购 → 进 Phase 2；
  - **🟡 黄灯**：CTR `1%–2%` → 仅 1 次文案/定价微调，第 13 天终判；
  - **🔴 红灯**：`≥ 150` UV 下 CTR **`< 1%` 且 `0` 预购** → 第 10 天立即 Kill 止损。
- **⚠️ 外发授权硬门禁（`HAP-06`）**：**须获得用户明确授权（`HAP-06`）后方可发出任何社区帖或私信。**

#### 7. Live Verified 实证链接（全部 `HTTP 200` 实测可达）
1. **[Flatfile Software Pricing & Plans 2025: See Your Cost | Vendr](https://www.vendr.com/marketplace/flatfile)** (`HTTP 200`) — 佐证 Flatfile 企业级数据导入的高昂采购门槛与价格不透明痛点。
2. **[OneSchema | Pricing](https://www.oneschema.co/pricing)** (`HTTP 200`) — 实证嵌入式 CSV 导入 SaaS 需按月/按团队阶梯付费（入门 `$20/mo` 跃升至 `$200+/mo` 数据运营档）。
3. **[CSVbox — The Fast CSV Importer for Modern SaaS Teams](https://csvbox.io/)** (`HTTP 200`) — 原文摘要：*"Drop a production-ready CSV, Excel, and PDF importer into your SaaS in minutes"*（`$19+/mo` 托管 SaaS 锚点，面向集成而非独立 RevOps 运维）。
4. **[Reddit `r/hubspot` — For RevOps / HubSpot admins: what import issues are...](https://www.reddit.com/r/hubspot/comments/1r8suow/for_revops_hubspot_admins_what_import_issues_are/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 集中反映 HubSpot 导入时的格式错乱、重复数据爆发与多日善后清理痛苦。
5. **[Reddit `r/SaaS` — I built a Flatfile alternative that doesn't cost...](https://www.reddit.com/r/SaaS/comments/1qkttqc/i_built_a_flatfile_alternative_that_doesnt_cost/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 明确针对 Flatfile 高企价格墙的市场反抗需求。
6. **[Reddit `r/webdev` — I built a free open source CSV importer](https://www.reddit.com/r/webdev/comments/1n4189u/i_built_a_free_open_source_csv_importer/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 实证客户端隐私本地校验与昂贵第三方托管导入器的痛点对立。

---

### 候选 #4：Figma Dev Mode Unbundler — Design Token to Tailwind v4/CSS & Contrast Diff Guard

#### 1. 排名、目标平台与排序理由
- **排名**：**#4**
- **目标平台**：**VS Code Marketplace（`$0` 注册、0% 平台抽成）**
- **排序理由**：
  1. **痛点情绪极强**：Figma 把 CSS 复制/交接锁进按开发者按月收费的 Dev Mode（`$12–$35/人/月`）在设计/前端圈引发大范围抵制，`$19` 买断性价比极度直观；
  2. **`$0` 注册费对冲招行卡风险**，且直插前端开发者的 VS Code 工作区；
  3. 排在 #4 是因为开源免费 Figma Token 插件较多，必须靠 **“Tailwind v4 `@theme` 精准编译 + Dark Mode WCAG 对比度断崖报警 + 变量破坏性 Diff”** 才能拉开付费差价，商业天花板略低于 #1–#3。

#### 2. 臃肿竞品 SaaS 与精确价格锚点
- **Figma Dev Mode**：**`$12/席/月`**（Professional）、**`$25/席/月`**（Organization）、**`$35/席/月`**（Enterprise，年付），对应年成本 **`$144–$420/开发者/年`**；若给开发开 Full 席更是高达 **`$16–$90/席/月`**。`r/FigmaDesign` 与 `r/UXDesign` 充斥大量吐槽（*"Figma Dev Mode is a scam"*）。

#### 3. Unbundled 微工作流与 Pro 配额合规 MVP 范围
- **核心切口**：不做 Figma 画布编辑器，只做 **“零 Dev Mode 席位摄取本地 W3C DTCG `.tokens.json` / Figma Variables JSON 导出（叠加免费层 File·Styles REST API 及可选轻量伴随 Figma 插件）→ 确定性编译 Tailwind v4 `@theme` / v3 / CSS 变量 → 覆盖前破坏性 Diff 与暗黑模式 WCAG 对比度守护”**。
- **⚠️ 架构红线避坑（Enterprise-Only Variables REST API 限制）**：官方 Figma REST API 文档明确规定 `GET /v1/files/:file_key/variables/local`（`file_variables:read` 权限）**仅限 Enterprise 组织 Full 席位调用**（*"To use this API, you must have a Full seat in an Enterprise org; guests cannot use the API"*），Starter / Professional / Organization 团队使用免费 PAT 调用该接口会直接返回 `403` 权限拒绝。因此本方案**主摄取路径不依赖 Variables REST API**。
- **模块化 MVP 拆解（5 个独立模块，单模块 `≤ 300` 行，总计 `~1,300` 行，Phase 0 零代码）**：
  1. `figma-token-fetcher.ts`（`≤260` 行）：**双路免费摄取引擎**——(a) **主路径**：直接读取用户通过免费社区导出插件或 Tokens Studio 导出的本地 **W3C DTCG `.tokens.json` / Figma Variables JSON**，并支持使用**免费 Figma PAT 调用非受限的官方 File/Styles REST API**（`GET /v1/files/:key`、`file_content:read` 拉取文本/效果/基础色板样式）；(b) **可选路径**：配合极轻量的伴随 Figma 插件（在 Starter/Pro 文件内通过 `figma.variables.getLocalVariablesAsync()` 直接导出本地 Variables JSON），彻底绕开 Enterprise 专属 REST 限制。
  2. `tailwind-v4-compiler.ts`（`≤290` 行）：规范化 Figma 斜杠命名（如 `Primary/Button BG` → `--color-primary-button-bg`），解析多主题（Light/Dark）别名引用，输出 **Tailwind v4 `@theme`**、**v3 `tailwind.config`** 及原生 CSS 变量。
  3. `token-breaking-diff.ts`（`≤250` 行）：覆写本地 `tokens.css` 前生成增量 Diff 报告，标红被重命名/删除且仍在工程代码被引用的变量（防 UI 样式静默崩溃）。
  4. `wcag-contrast-guard.ts`（`≤260` 行）：使用确定性相对亮度数学公式校验 Light/Dark 配对的 WCAG 2.1 AA（`4.5:1`）/ AAA 对比度回归风险。
  5. `license-creem-gate.ts`（`≤220` 行）：单次/单模式预览免费，多模式编译 + Diff 守卫 + WCAG 批量检查由 Creem / 面包多 License Key 解锁。
- **Pro 配额护栏合规**：全确定性 JSON 转换与数学公式计算，`Flash/Hydrogen` 即可完成 85%+ 编码，周配额 **`≤ 35%`**，维护 **`1–2h/周`**。

#### 4. 三条 P0 结构过滤线核查（F1 / F2 / F3）
- **F1（Zero-AI-Cost / BYOK）— PASS**：纯确定性 JSON AST 编译与 WCAG 相对亮度公式计算，零 AI API 成本（100% 毛利）。
- **F2（跨工具流转或多步批处理）— PASS**：打通 `本地 W3C DTCG .tokens.json / 免费层 Figma File·Styles REST API（及可选伴随插件导出 JSON）` → 变量别名多主题解析 → `Tailwind v4 @theme / v3 / CSS` 多目标编译 → 工程引用破坏性 Diff → WCAG 对比度守护。
- **F3（零高频 DOM 逆向爬虫）— PASS**：仅读取本地导出 W3C DTCG / Variables JSON（或可选轻量伴随插件通过官方 Plugin API `figma.variables.getLocalVariablesAsync()` 导出）及免费层官方 File/Styles REST API（`GET /v1/files/:key`），显式避开需 Enterprise Full 席位的 `/variables/local` 端点，零任何 Figma 网页 Canvas DOM 逆向抓取。

#### 5. 定价与单位经济精算（Creem + 面包多，口径 A）
- **定价**：**`$19` 买断** 或 **`$15/年`**（团队包 **`$49`**）；国内面包多 **`¥139` 买断** / `¥99/年`。
- **Creem (`3.9% + $0.40`) 净利拆解与口径 A 越线销量**：
  - `@ $19`：有效费率 `6.01%`，单笔净贡献 **`$16.97`（`¥122.15`）** → 口径 A 需 **`9` 单/月**（`$171/月`，净利 **`¥1,027.33/月`**；`FX=7.10, f_fx=3.5%` 压力情景下 `9` 单仅 `¥996.47/月`，建议按 **`10` 单/月** 安全垫运营）；
  - `@ $15/年`（年付同买断现金流口径）：有效费率 `6.57%`，单笔净贡献 **`$13.31`（`¥95.84`）** → 需每月新增 **`12` 新年单/月**（`$180/月`，净利 **`¥1,078.06/月`**，非月均分摊 MRR）。

#### 6. Phase 1 `<7 天` Smoke Test 方案
- **精准无垃圾群发 ICP 导流渠道（目标 `≥ 100–150` UV）**：
  1. 在 `r/tailwindcss`、`r/Frontend`、`r/webdev`、`r/FigmaDesign` 发布对比演示贴（*"Compile Local W3C DTCG Tokens & Figma Styles to Tailwind v4 `@theme` + Catch Dark-Mode Contrast Breaks in VS Code Without Paying $12–$35/mo Dev Mode Seats"*）；
  2. 在 Tailwind v4 Design Token 相关 GitHub Discussions（如 `#20626` 生态圈）及 Dev.to 前端工程博客参与实操讨论并提供工具着陆页；
  3. 重点展示“15 秒内将 DTCG JSON / Figma Styles 转为零报错 Tailwind v4 `@theme`”前后对比 GIF。
- **Day-10 Kill-Switch 门禁**：
  - **🟢 绿灯**：`≥ 100–150` UV 下 CTR **`≥ 2%–5%`** 或 `≥ 1–2` 笔预购 → 进 Phase 2；
  - **🟡 黄灯**：CTR `1%–2%` → 仅 1 次文案/定价微调，第 13 天终判；
  - **🔴 红灯**：`≥ 150` UV 下 CTR **`< 1%` 且 `0` 预购** → 第 10 天立即 Kill 止损。
- **⚠️ 外发授权硬门禁（`HAP-06`）**：**须获得用户明确授权（`HAP-06`）后方可发帖外发。**

#### 7. Live Verified 实证链接（全部 `HTTP 200` 实测可达）
1. **[Variables REST API | Figma Developer Docs](https://developers.figma.com/docs/rest-api/variables/)** (`HTTP 200`) — 官方文档明确限制 `GET /v1/files/:file_key/variables/local`（`file_variables:read`）仅限 *"Full seat in an Enterprise org; guests cannot use the API"*，证实 Starter/Pro/Org 开发者无法用免费 PAT 直连 Variables REST API。
2. **[File Endpoints (`GET /v1/files/:key`) | Figma Developer Docs](https://developers.figma.com/docs/rest-api/file-endpoints/)** (`HTTP 200`) — 证实通用文件与 Styles 元数据接口仅需 `file_content:read`（非 Enterprise 限定）。
3. **[getLocalVariablesAsync | Figma Plugin API Docs](https://www.figma.com/plugin-docs/api/properties/figma-variables-getlocalvariablesasync/)** (`HTTP 200`) — 证实可选轻量伴随 Figma 插件可在 Starter/Pro 文件内部直接读取本地变量并导出为 JSON。
4. **[Figma Dev Mode Pricing 2026: Dev Seat vs Full Seat Costs | OverlayQA](https://overlayqa.com/blog/figma-dev-mode-alternative/)** (`HTTP 200`) — 原文实证：*"Figma Dev seats cost $12 to $35 a month and Full seats $16 to $90."*
5. **[Figma Pricing in 2026: What You Really Pay | Awesomic](https://www.awesomic.com/blog/figma-pricing)** (`HTTP 200`) — 系统拆解 Full / Dev / Collab 席位按人头月费与年中加席计费痛点。
6. **[tailwind-dictionary: build a Tailwind CSS theme from design tokens (Figma variables, DTCG) · tailwindlabs/tailwindcss · Discussion #20626](https://github.com/tailwindlabs/tailwindcss/discussions/20626)** (`HTTP 200`) — 直接证实 Tailwind v4 社区对 Figma Variables / DTCG 自动化生成主题的高度需求。
7. **[Reddit `r/FigmaDesign` — Figma Dev Mode is a scam](https://www.reddit.com/r/FigmaDesign/comments/1ail6cc/figma_dev_mode_is_a_scam/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 前端与设计团队对 Dev Mode 剥离免费 CSS 检视功能的强烈抵制。
8. **[Reddit `r/UXDesign` — Figma pay walling core features is ridiculous](https://www.reddit.com/r/UXDesign/comments/1l1zwko/figma_pay_walling_core_features_is_ridiculous/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 围绕席位付费墙的长期怨言。

---

### 候选 #5：Notion & Airtable Relational Snapshot, Attachment Mirror & Clean Markdown/PDF Bundler

#### 1. 排名、目标平台与排序理由
- **排名**：**#5**
- **目标平台**：**Chrome Web Store（`$5` 一次性注册、0% 平台抽成）** *(面向非编程 Notion/Airtable 运营者；若目标偏向技术向 Obsidian/Git 用户或避开 CWS `$5` 卡阻断，可转 **VS Code Marketplace `$0`** 或 **Cloudflare Pages `$0` 本地 Web 工具**；注意 **Cloudflare Pages `$0` 纯静态 Web 兜底版严格运行在本地 Notion `.zip` / 导出 JSON 模式**，由于 `api.notion.com` 缺少浏览器 CORS 响应头，Web 兜底版**零直接浏览器直连 `api.notion.com` 请求**)*。
- **排序理由**：
  1. **硬痛点真实且长期存在**：Airtable 官方附件下载链接 **约 2 小时后自动过期**（导致传统备份表内的图片/PDF 变成死链），Notion 导出大库频繁卡死、生成 32 位 hex UUID 文件名撞破 Windows `260` 字符路径上限且 PDF 分页截断惨不忍睹；
  2. **极清晰的订阅替代锚点**：Notion Backups Pro `$28/月`、ProBackup `$25–$31/月`，本工具 `$19` 买断一次即低于竞品 1 个月费用；
  3. 排在 #5 是因为非技术 Notion 用户容易出现较多的文件结构咨询工单，且受官方 API 速率限制影响，需在 Phase 2 严格做好本地进度条与限流退避以守住 `1–3h/周` 运维上限。

#### 2. 臃肿竞品 SaaS 与精确价格锚点
- **Notion Backups (`notionbackups.com`)**：Lite **`$6/月`**（仅周备 1 库）、Starter **`$11/月`**、Pro **`$28/月`**、Enterprise **`$89/月`**。
- **ProBackup**：**`$25–$31/月`**。
- **Whalesync**：**`$16–$39+/月`**。
- **原生导出缺陷**：Notion 大库 ZIP 卡死/断链（`r/Notion`）、PDF 截断（`r/Notion`）、文件名带 32 位 UUID 导致 Obsidian/Git 迁徙破链（`elashrry/remove_notion_id`）；Airtable CSV 导出展平关联表且附件 URL 2 小时失效（`simonw/airtable-export#27`）。

#### 3. Unbundled 微工作流与 Pro 配额合规 MVP 范围
- **核心切口**：不做“云端定时 SaaS 备份服务”（避开云端存储账单与服务器运维），专注 **“客户端本地一键全量打包器”**：官方扩展 API / 本地 `.zip`·导出 JSON 输入 → 2 小时内抢救下载全部 Airtable 附件二进制到本地并重写相对路径 → 清洗 Notion UUID 死链 → 输出干净 Obsidian Markdown + SQLite `.db` + 独立标签页分页排版打印 PDF。
- **模块化 MVP 拆解（5 个独立模块，单模块 `≤ 300` 行，总计 `~1,400` 行，Phase 0 零代码）**：
  1. `airtable-api-mirror.ts`（`≤280` 行）：在扩展宿主环境（Chrome Extension host permissions / VS Code）使用用户自有 Airtable PAT 分页拉取 Bases/Tables，在 2 小时过期窗口内并发限流下载全部附件到本地文件夹并重写为本地相对路径。
  2. `relational-sqlite-exporter.ts`（`≤260` 行）：将关联记录导出为保留外键关系的多张规范化 CSV + 便携式只读 SQLite 文件（或浏览器 WASM SQLite 打包 ZIP）。
  3. `notion-uuid-scrubber.ts`（`≤290` 行）：剥离 Notion 导出 ZIP（或本地导出 JSON）中的 32 位 hex UUID，截断超长路径防 Windows `MAX_PATH` 报错，重写跨页相对链接与 `<aside>` Callout 为标准 Obsidian Markdown。
  4. `clean-print-pdf-bundler.ts`（`≤280` 行）：套用清洁打印 CSS（`@media print` + `break-inside: avoid` 表格/代码块不断页），**通过 `chrome.tabs.create` 打开专用完整扩展标签页执行浏览器 `window.print()` 矢量 PDF 导出**（**严禁**在多页分页会截断的扩展 `popup` 弹窗内直接打印）。
  5. `license-creem-gate.ts`（`≤220` 行）：限单张小表/10 页试跑，全库批量导出与附件镜像由 Creem / 面包多 License Key 解锁。
- **Pro 配额护栏合规**：全确定性 REST API 遍历、ZIP 解压正则清洗与文件名重映射，`Flash/Hydrogen` 承担 85%+ 编码，周配额 **`≤ 40%`**，维护 **`1.5–2.5h/周`**。

#### 4. 三条 P0 结构过滤线核查（F1 / F2 / F3）
- **F1（Zero-AI-Cost / BYOK）— PASS**：纯确定性 JSON/ZIP/Markdown/二进制附件流转，零服务端 AI 成本（100% 毛利）。
- **F2（跨工具流转或多步批处理）— PASS**：`扩展内 Notion/Airtable API 或本地 .zip/导出 JSON` → 附件抢救镜像下载 → 32 位 UUID 与关系外键归一化 → `Obsidian Markdown + SQLite + 独立标签页分页 PDF` 多格式批输出，完全不属于单按钮小补丁。
- **F3（零高频 DOM 逆向爬虫）— PASS**：Chrome/VS Code 扩展仅通过宿主权限调用用户自有 Token 的官方 Notion/Airtable REST API 或读取本地 `.zip`/JSON；Cloudflare Pages `$0` Web 兜底版严格采用**本地 Notion `.zip` / 导出 JSON 模式**（零浏览器直连 `api.notion.com` CORS 违规调用），零任何页面 DOM 逆向破解。

#### 5. 定价与单位经济精算（Creem + 面包多，口径 A）
- **定价**：**`$19` 买断**（单平台）或 **`$15/年`**（双平台 Pro 买断 **`$29`**）；国内面包多 **`¥139` 买断** / `¥99/年`。
- **Creem (`3.9% + $0.40`) 净利拆解与口径 A 越线销量**：
  - `@ $19`：有效费率 `6.01%`，单笔净贡献 **`$16.97`（`¥122.15`）** → 口径 A 需 **`9` 单/月**（`$171/月`，净利 **`¥1,027.33/月`**；在 `FX=7.10, f_fx=3.5%` 压力情景下 `9` 单仅 `¥996.47/月`，建议按 **`10` 单/月** 安全垫运营）；
  - `@ $15/年`（年付同买断现金流口径）：有效费率 `6.57%`，单笔净贡献 **`$13.31`（`¥95.84`）** → 需每月新增 **`12` 新年单/月**（`$180/月`，净利 **`¥1,078.06/月`**，非月均分摊 MRR）；
  - `@ $29`（双平台打包）：有效费率 `5.28%`，单笔净贡献 **`$26.10`（`¥187.92`）** → 仅需 **`6` 单/月**（`$174/月`，净利 **`¥1,055.53/月`**）。

#### 6. Phase 1 `<7 天` Smoke Test 方案
- **精准无垃圾群发 ICP 导流渠道（目标 `≥ 100–150` UV）**：
  1. 在 `r/Notion`、`r/Airtable`、`r/ObsidianMD` 针对导出失败、PDF 断页、32 位 UUID 破链与 Airtable 附件过期痛点提供完整排障思路并附带早鸟着陆页；
  2. 在 Notion 模板作者与 Airtable 独立运营者社区分享 *"How to Archive Airtable Attachments Before the 2-Hour Expiry & Clean Notion UUIDs for Obsidian/Git"*；
  3. 通过 Before/After 对比截图（左：断链+乱页 PDF；右：干净 Obsidian 目录+完整本地附件库）测试转化率。
- **Day-10 Kill-Switch 门禁**：
  - **🟢 绿灯**：`≥ 100–150` UV 下 CTR **`≥ 2%–5%`** 或 `≥ 1–2` 笔预购 → 进 Phase 2；
  - **🟡 黄灯**：CTR `1%–2%` → 仅 1 次文案/定价微调，第 13 天终判；
  - **🔴 红灯**：`≥ 150` UV 下 CTR **`< 1%` 且 `0` 预购** → 第 10 天立即 Kill 止损并切回备选。
- **⚠️ 外发授权硬门禁（`HAP-06`）**：**须获得用户明确授权（`HAP-06`）后方可发帖外发。**

#### 7. Live Verified 实证链接（全部 `HTTP 200` 实测可达）
1. **[ProBackup vs Notion Backups for Notion [2026 Comparison]](https://www.probackup.io/compare/probackup-vs-notion-backups-for-notion)** (`HTTP 200`) — 核实 Notion Backups (`$6/$11/$28/$89/mo`) 与 ProBackup (`$25–$31/mo`) 价格锚点及本地还原痛点。
2. **[Pricing | Whalesync](https://www.whalesync.com/pricing)** (`HTTP 200`) — 同步型 SaaS 价格对比锚点（`$16–$39+/mo`）。
3. **[GitHub - elashrry/remove_notion_id](https://github.com/elashrry/remove_notion_id)** (`HTTP 200`) — 标题与描述直接证明用户痛点：*"Removes Notion ID from exported pages iteratively and update markdown files."*
4. **[Option to export and save images and attachments · Issue #27 · simonw/airtable-export · GitHub](https://github.com/simonw/airtable-export/issues/27)** (`HTTP 200`) — 原文摘要引述 Airtable 官方文档：*"The attachment viewer URL requires a viewer to be logged in via Airtable, whereas the download URL can be publicly..."*（临时签名链接过期导致外部镜像刚需）。
5. **[Reddit `r/Notion` — Notion export completely broken, tried everything](https://www.reddit.com/r/Notion/comments/1mqt2ta/notion_export_completely_broken_tried_everything/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 大型 Notion 工作区原生导出挂起/失败。
6. **[Reddit `r/Notion` — Notion devs do you plan to fix the awful PDF](https://www.reddit.com/r/Notion/comments/1pioq62/notion_devs_do_you_plan_to_fix_the_awful_pdf/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 原生 PDF 分页断裂、表格截断吐槽。
7. **[Reddit `r/Airtable` — Anyone actually using external services for...](https://www.reddit.com/r/Airtable/comments/1xk2gt2/anyone_actually_using_external_services_for/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 吐槽第三方备份月费过高、寻找轻量化本地导出替代。

---

## 附录：Day-10 止损轮换备选库（Verified Backups #6 & #7）

> **启用条件**：仅当 `HAP-05` 选中的主候选在 Phase 1 Smoke Test 中触发 **🔴 Day-10 Kill-Switch（`<1%` CTR 且 `0` 预购）** 时，无需重新调研，直接启用以下两个已通过 `F1/F2/F3` 与 `HTTP 200` 核验的备选切口（与 #1–#5 相比：#6 偏 QA/DevTools 抓包测试、#7 偏 API 文档与契约治理，在最初调研阶段刻意降为备份以保证 Top 5 内部零赛道重叠）。

### 备选 #6：HAR PII Scrubber & Batch Playwright / Grafana k6 / OpenAPI Exporter
- **目标平台**：**Chrome DevTools Extension (`$5`)**（基于官方 `chrome.devtools.network.getHAR()` API）或 **VS Code (`$0`)**（直接处理本地 `.har` 文件）。
- **竞品与价格锚点**：**Requestly**（官网现行按年计费团队档：**Team `$10/人/月`、Team Pro `$15/人/月`**，免费版严限功能与团队协作；Enterprise 定制）；**Charles Proxy / Proxyman**（`$50–$69/席`）。
- **Unbundled 核心工作流**：(1) 确定性 JSON AST 密钥与 PII 脱敏器（发送 `.har` 给客户/支持/同事前，自动定位并高亮脱敏 `Authorization`、`Cookie`、`Set-Cookie`、JWT、API Key、邮箱）；(2) 静态资源降噪过滤（剔除字体/图片/埋点）；(3) 批量将脱敏 `.har` 一键编译为可运行 **Playwright 测试脚本**、**Grafana k6 压测脚本** 或 **OpenAPI 3.1** 草案。
- **P0 过滤线（F1/F2/F3）**：**PASS / PASS / PASS**（纯确定性 JSON/AST 脱敏与代码生成；多工具导出流水线；官方 `chrome.devtools.network` API / 本地 `.har` 文件）。
- **定价与口径 A**：**`$19` 买断** / **`$15/年`**（Creem 单笔净贡献 `¥122.15` / `¥95.84`，需 **`9` 单/月** [FX 压力建议 `10` 单] / **`12` 新年单/月** 越线 `>¥1,000`）。
- **Phase 1 Smoke Test（`HAP-06` 门控）**：`r/webdev`、`r/QualityAssurance`、`r/Playwright`（`≥ 150` UV，同样适用 `< 1%` Day-10 Kill-Switch，未获 `HAP-06` 授权禁发帖）。
- **Live Verified 实证链接（`HTTP 200`）**：
  1. **[Pricing — Requestly API Platform](https://requestly.com/pricing/)** (`HTTP 200`) — 核实 Requestly 官网现行按席位商业定价（**Team `$10/user/month`、Team Pro `$15/user/month`**，billed annually）。
  2. **[GitHub - theluckystrike/har-viewer-vscode](https://github.com/theluckystrike/har-viewer-vscode)** (`HTTP 200`) — 摘要明确印证核心需求：*"HAR Viewer for VS Code: waterfall, filters, headers and bodies, copy as cURL, and a redact command for secrets"*。
  3. **[Reddit `r/webdev` — Do you scrub HAR files before sending them to...](https://www.reddit.com/r/webdev/comments/1qg37h3/do_you_scrub_har_files_before_sending_them_to/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 开发者讨论外发 HAR 文件前手工删 Cookie/Bearer Token 的繁琐痛点。
  4. **[Reddit `r/selfhosted` — App for replaceString like in Requestly](https://www.reddit.com/r/selfhosted/comments/1fc1h4h/app_for_replacestring_like_in_requestly/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 对 Requestly 付费墙与规则数上限的不满。

### 备选 #7：OpenAPI Semantic Breaking-Change PR Diff, TypeScript/Zod Codegen & Offline Docs Bundler
- **目标平台**：**VS Code Marketplace (`$0`)** *(特意保留为备选 #7，防止与 Top 5 中的候选 #1 Postman/OpenAPI 产生用户群重叠)*。
- **竞品与价格锚点**：**ReadMe**（Pro 档 **`$250/月`** 起跳，按年计费）；**Swagger / SwaggerHub**（官网 `swagger.io/product/pricing/` 按分层团队/企业计划管控 Studio、Contract Testing、Portal 与协同功能，具体商业报价需按计划/联系销售获取）。
- **Unbundled 核心工作流**：在 VS Code 内对 Git `HEAD` vs `main` 的 OpenAPI 3.0/3.1 YAML/JSON 执行语义破坏性变更对比（识别删除端点、收紧 enum、`string->int` 类型突变、新增必填字段）→ 一键生成 **TypeScript + Zod** 运行时校验契约与 Markdown Release Changelog → 导出单文件免服务器静态离线 HTML API 文档包。
- **P0 过滤线（F1/F2/F3）**：**PASS / PASS / PASS**（确定性 OpenAPI AST Diff 与代码生成；`Git Diff -> Breaking Audit -> Zod Codegen -> Single-HTML Docs`；纯本地 Git 与 YAML/JSON 文件）。
- **定价与口径 A**：**`$24` 买断** / **`$15/月`** 团队版（Creem 单笔净贡献 `¥155.03` / `¥95.84`，需 **`7` 单/月** [FX 压力建议 `8` 单] / **`12` 订户** 越线 `>¥1,000`）。
- **Phase 1 Smoke Test（`HAP-06` 门控）**：`r/FastAPI`、`r/typescript`、`r/technicalwriting`、`r/node`（`≥ 150` UV，`< 1%` Day-10 Kill-Switch，未获 `HAP-06` 授权禁发帖）。
- **Live Verified 实证链接（`HTTP 200`）**：
  1. **[Pricing · ReadMe](https://readme.com/pricing)** (`HTTP 200`) — 核实 ReadMe 对小团队而言极高的月费门槛（Pro **`$250/month`** Billed annually）。
  2. **[Swagger Pricing | Flexible Plans for Every Team](https://swagger.io/product/pricing/)** (`HTTP 200`) — 核实 Swagger 按分层团队/企业计划（plan-gated / contact sales）管控契约测试、Portal 与协同功能（公开定价页未列明具体美元标价）。
  3. **[Reddit `r/technicalwriting` — Is ReadMe worth the cost difference](https://www.reddit.com/r/technicalwriting/comments/1pua2q7/is_readme_worth_the_cost_difference/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 团队质疑 ReadMe 高昂企业级订阅性价比。
  4. **[Reddit `r/FastAPI` — Prevent unintentional breaking API changes in...](https://www.reddit.com/r/FastAPI/comments/1tvfwxr/prevent_unintentional_breaking_api_changes_in/)** (`HTTP 200`, SSR 壳标题 `Reddit`) — 后端团队寻求阻止无意中发布破坏性 OpenAPI 变更的工具链。
