# P0 Unbundling Launch — Phase 0 基础设施、合规物料与静态着陆页总控台

> **战略基线**：唯一 P0 收敛方向（加权 **`4.53/5.00`**）——面向 **US A 轮 / 成熟垂直 SaaS 拆解（Unbundling）** 的 **Zero-AI-Cost / BYOK 垂直生产力扩展**。  
> **基准日期**：2026-11-26（UTC+8）  
> **参考底座（只读）**：`C:\Users\27197\.gemini\antigravity\scratch\side_income_convergence\`

---

## 1. 核心铁律与阶段门禁（Phase 0 → Phase 2）

1. **Phase 0 零产品业务逻辑代码铁律**：
   - 在 Phase 0 收款/账号实测门禁与 Phase 1 `<7 天` Smoke Test 通过前，**本目录严禁出现任何扩展业务逻辑代码**（禁止 `.ts`、`.js`、`.py`、`manifest.json`、解析器、爬虫或 License 校验实现）。
   - 本阶段仅交付静态着陆页骨架（HTML5 + CSS）、可核查合规门禁清单、KYC 物料包、人工停顿确认表与 5 个经实证过滤的痛点候选。
2. **解耦的两阶段部署与域名策略（`$0` 预验证护栏）**：
   - **Phase 0 & Phase 1（`$0` 现金硬门槛）**：静态着陆页（`landing/`）通过 **Cloudflare Pages Direct Upload** 部署到 `https://<slug>.pages.dev`（`$0/月`，无需绑定信用卡），配合 **Creem Test Mode**（`test-api.creem.io`）运行 `<7 天` Smoke Test（目标 `>= 100–150` 定向 ICP UV；Day-10 结账点击率 `< 1%` 且 `0` 付费意愿即触发止损）。
   - **Phase 2 门禁（仅在 Day-10 Green Light 后解锁）**：购买独立自定义域名（`~$8–$12/年`）→ 绑定至 Cloudflare Pages 并启用 **Cloudflare Email Routing（`$0/月`，`support@<domain>` 转发 Gmail）** → 完成最小可用测试版 → 再提交 **Creem Live Account Review**。
   - **红线警告**：Creem 官方审核文档明确**拒收 `*.pages.dev`、`*.vercel.app`、`*.github.io` 等免费托管子域名**，且店铺一旦被标为 `Rejected` 即永久不可恢复。严禁在 Phase 0/1 将 `*.pages.dev` 提交给 Creem Live Review。
3. **双平台渠道与招行卡兜底策略**：
   - **主发渠道**：**VS Code Marketplace（`$0` 注册费、0% 抽成）**——直接对冲招行万事达借记卡 `$5` 预授权拒付风险；同时强制规避 **2026-12-01 Azure DevOps Global PAT 退役**，仅使用 **Organization-Scoped PAT** 或 **Entra ID OIDC (`vsce publish --oidc`)**。
   - **并行渠道**：**Chrome Web Store（`$5` 一次性注册费、0% 抽成）**——仅在招行卡于洁净网络下 `<= 2` 次尝试内顺利通过时启用；一旦连拒 2 次、触发银行风控短信或用户选择 `$0` 起步，立即中止 CWS 并锁定 VS Code `$0` 单线推进。
4. **双轨收款与硬定价底线（`1 USD ≈ 7.20 RMB [7.10–7.30]`）**：
   - **海外主轨**：**Creem**（`3.9% + $0.40`/笔、`$0/月`、自带 MoR 全球税负与原生 License Key API、支持大陆身份证 + 同名支付宝直提人民币，`$50` 起付、每月 1 日/15 日放款、7–12 天风控期）；热备：**Dodo Payments + Payoneer**（`6.0% + $0.40`，MRR > `$200` 或触发合规复核时启用）。
   - **国内辅轨**：**面包多（`mbd.pub`）**（标准约 `3%` / `¥0.1 + 2%`，个人实名免营业执照，Phase 2 采用内置「卡密自动发货」零服务端运维）。
   - **定价底线**：**`>= $12–$15`**（优选 **`$15/月`** 订阅或 **`$19` 早鸟 / `$29` 标准** 买断/年付；严禁 `$5` 订单，防止 `$0.40` 固定手续费将实际费率推高至 `11.90%` 并引爆低价客服）。
   - **税务规则**：在读本科生（`2027-06` 毕业）维持自然人综合所得申报（年综合所得 `<= 60,000 RMB` 实际个税 `0.0%`），Phase 0–2 **严禁提前注册个体工商户**。

---

## 2. Antigravity Pro 配额五项工程护栏

本地账号运行 **`Google AI Pro ($19.99/mo)`**（`g1-pro-tier`，曾触及 `geminiWk: 90.9%` 高水位），全流程严格执行：
1. **运行时 Zero-AI / BYOK**：扩展运行期零平台代付 AI Token 成本。
2. **模型分层路由**：80%+ 着陆页、样式、脚手架、文档与基础测试交由 Flash / Hydrogen；仅架构边界、Webhook 签名与疑难 Bug 动用高阶模型。
3. **单模块 `<= 300` 行 Fresh Session**：进入 Phase 2 后按单模块切分会话，禁止长上下文全仓游走。
4. **副业周配额硬上限 `<= 50%`**：若宿主总周配额超过 `75%`，立即暂停非关键副业任务，优先保障课业与 `2027-03` 春招实习准备。
5. **禁止自费提前升 Ultra**：在 MRR 连续 2 个月稳定达到 **`>= $300/月`** 前，绝不自费升级 Ultra（`$99.99` / `$199.99`，且 SheerID 学生优惠不含 Ultra）。

---

## 3. 交付目录文件索引

| 文件路径 | 职责与内容 | 阶段状态 |
|---|---|---|
| `phase0_checklist.md` | 招行万事达卡、PayPal/GPay、Cloudflare `$0`、CWS `$5` vs VS Code `$0` 切换开关、2026-12-01 PAT 防护、Creem Test Mode 与面包多追踪清单 | `[READY FOR VERIFICATION]`（含 `[PENDING USER ACTION]` 与 `[DEFERRED — PHASE 2 GATE]`） |
| `creem_mianbaoduo_kyc_pack.md` | Creem 个人 KYC 与同名支付宝材料包、11 项 Live Review 预检门禁、License Key API 契约（无代码）、首笔 `$50` 汇损校准台账、面包多双轨配置 | `[READY FOR VERIFICATION]` |
| `human_action_pause.md` | 全流程人机隔离总表（`HAP-01`..`HAP-07`）：银行 App、实卡扣款、账号登录、KYC、5 选 1 拍板、外发导流等零歧义分步指令 | `[READY FOR VERIFICATION]` |
| `pain_points_5_candidates.md` | 5 个经公开社区/差评原始链接实证且通过 F1/F2/F3 过滤的 Unbundling 痛点候选与 Smoke Test 方案（供 `HAP-05` 拍板） | 由痛点调研席位独立维护 |
| `landing/index.html` | 离线可渲染 HTML5 静态着陆页骨架（含 `>=$15` 硬定价、`16:9` Demo 占位、诚实 `<dialog>` + `<details>` 早鸟交互、零虚假评价） | `[READY FOR VERIFICATION]` |
| `landing/styles.css` | 零外部 CDN / 零外部字体的响应式离线样式表 | `[READY FOR VERIFICATION]` |
| `landing/privacy.html` | 本地优先 / BYOK 数据最小化与 Creem MoR 隐私政策 | `[READY FOR VERIFICATION]` |
| `landing/terms.html` | 软件授权、BYOK 责任声明、免责与独立产品免责条款 | `[READY FOR VERIFICATION]` |
| `landing/refund.html` | 14 天无理由退款指南、Creem Customer Portal 退订指引与 3 个工作日 SLA 承诺 | `[READY FOR VERIFICATION]` |

---

## 4. `HAP-05` 拍板后着陆页槽位映射指南

当用户在 `human_action_pause.md` 的 **`HAP-05`** 从 `pain_points_5_candidates.md` 选定 1 个候选后，必须同步更新 **`landing/index.html`、`landing/terms.html` 与 `landing/refund.html`**（确保全站 3 个 HTML 文件在 Creem Live Review 前无价格冲突），替换以下标准槽位即可部署 Phase 1 Smoke Test：
- `[PRODUCT_NAME]`（`index.html`、`privacy.html`、`terms.html`、`refund.html`）：干净独立的品牌名（禁止包含被拆解 Series A SaaS 的商标词）。
- `[ONE_LINE_PAIN_SOLUTION]`（`index.html`）：一句话痛点解决价值主张（与所选候选的 Before/After 匹配）。
- `[TARGET_SAAS_IF_MENTIONED]`（4 个 HTML 页脚及 `terms.html` 第 3 条）：独立声明中的被适配生态名称（如不提及则改为通用描述）。
- `[REPLACE_WITH_DEMO_GIF]`（`index.html`）：Phase 1 实测时替换为真实 Before/After 演示图或录屏截图。
- **`#pricing` 价格区与 `[REPLACE_AT_HAP-05: ...]` 同步定价槽位**：
  - `landing/index.html`（Hero CTA、`#pricing` 卡片、`<details class="fallback-preview">`、`<dialog id="early-access-dialog">`）：按所选候选 `#1`–`#5` 同步更新一次性/年付/月付价格（`>=$15`，例如 `#2` 为 `$24` 买断、`#3` 为 `$19/mo` / `$29/yr` / `$39` 买断）。
  - `landing/terms.html`（第 1 条 `[REPLACE_AT_HAP-05: $19 Early-Access / $29 Standard Annual License or $15/month Pro Subscription]`）：必须替换为与 `index.html#pricing` 完全一致的定价与授权周期。
  - `landing/refund.html`（第 3 条 `[REPLACE_AT_HAP-05: $15/month Pro Subscription]`）：若所选候选含月付/年付订阅则同步替换订阅名称与价格；若所选候选仅提供一次性买断（无订阅档），则改写或移除该循环订阅退订说明以保持一致。
- `[SUPPORT_EMAIL]` / `mailto:support@yourdomain.example`（全站 4 个 HTML 页）：Phase 1 可先用专用联系邮箱；**Phase 2 提交 Creem Live Review 前必须切换为 `support@<customdomain>`**。
