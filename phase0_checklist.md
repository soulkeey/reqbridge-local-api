# Phase 0 基础设施、银行卡实测与账号合规执行清单

> **状态标记规范**：
> - `[PENDING USER ACTION]` — 必须由用户本人操作的外部真实步骤（手机银行、实体卡、账号登录、实名 KYC、付费动作）。**严禁 Agent 代填或假定完成**，全部与 `human_action_pause.md` 的 `HAP-01`..`HAP-07` 一一对应。
> - `[READY FOR VERIFICATION]` — 本地已生成的静态文件/合规物料，待本地校验或验收。
> - `[DEFERRED — PHASE 2 GATE]` — 刻意延后至 **Phase 1 Day-10 Smoke Test 绿灯后** 才触发的动作（严格守住 Phase 0/1 `$0` 低现金防线与 Creem 审核防拒签底线）。

---

## Gate 0.1 — 招行万事达卡预检与 `$0–$5` 出向实测门禁

| 编号 | 操作项与执行细节 | 当前状态 | 人工停顿映射 |
|---|---|---|---|
| **0.1a** | **招行 App 卡片属性与余额核验**：用户确认万事达借记卡为一类户、余额充足（`>= ¥100`）。 | `[DONE — USER CONFIRMED]` | `HAP-01` |
| **0.1b** | **开启境外无卡/跨境线上支付与 3DS 短信验证**：用户确认已在招行 App 开启跨境线上支付，短信通道正常。 | `[DONE — USER CONFIRMED]` | `HAP-01` |
| **0.1c** | **绑定 PayPal 与 Google Pay（强制 USD 结算拒 DCC）**：用户回复已完成 PayPal 准备；Ego Space 1 实测 Google Wallet 首页已打开，PayPal 标签页当前处于 `paypal.com/signin` 登录页。后续如在海外网关付款遇 `CNY` DCC 弹窗务必选 `USD`。 | `[DONE — VERIFIED (PayPal 待登录)]` | `HAP-02` |
| **0.1d** | **Cloudflare 账号与 Pages Free（`$0/月`）准备**：Ego Space 1 实测已登录 `Soulkey529@gmail.com` (`bc9433f2600a58c7128b75c74bb6a451`)，已免绑卡创建 Pages 项目并上线。 | `[DONE — VERIFIED]` | `HAP-02` |
| **0.1e** | **Chrome Web Store `$5` 一次性费用实测（可选并行）**：用户未执行 `$5` 付款测试（“3我没做”），触发硬切换规则。 | `[DEFERRED — SWITCHED TO VS CODE $0]` | `HAP-03` |

### ⚠️ CWS `$5` → VS Code `$0` 强制切换开关规则（Hard Switch Trigger）
满足以下**任意一条**时，**立即中止 Chrome Web Store 付款重试**，将 CWS 标记为 `[DEFERRED — CARD/GATEWAY BLOCKED]`，并锁定 **VS Code Marketplace（`$0`）** 作为 Phase 1/2 唯一首发平台：
1. 招行万事达借记卡在 Chrome Web Store `$5` 支付（直连 + Google Pay 各 1 次，共 2 次）均因借记卡预授权/AVS/风控被拒；
2. 招行发送风控拦截或临时锁卡提示短信；
3. 用户主动决定在 Day-10 Smoke Test 验证通过前保持 **`$0` 现金零支出**。

---

## Gate 0.2 — VS Code Marketplace（`$0`）发布者准备与 2026-12-01 PAT 防护

| 编号 | 操作项与执行细节 | 当前状态 | 人工停顿映射 |
|---|---|---|---|
| **0.2a** | **Microsoft 账号与 Azure DevOps 组织**：Ego 实测用户已登录 `Key Soul (2719767382@qq.com)`；误开页 `azure.microsoft.com` 为收费 Azure 云订阅页（**切勿在该页绑卡或注册**）。实测 `https://aex.dev.azure.com/me` 尚无 Azure DevOps 组织（显示 `Create new organization` 按钮）。Phase 2 发布前需点击该按钮免费建组织（`$0`）或直接在 Publisher 页面启用 Trusted Publishing (OIDC)。 | `[PARTIAL — 待 Phase 2 免费建 DevOps 组织]` | `HAP-04` |
| **0.2b** | **⚠️ 2026-12-01 Global PAT 退役强制防护**：微软将于 **2026 年 12 月 1 日** 正式退役勾选 `"All accessible organizations"` 的 **Global Personal Access Token (PAT)**。Phase 2 生成发布凭证时：<br>• **严禁**选择 `"All accessible organizations"`；<br>• 必须创建严格绑定单一组织的 **Organization-Scoped PAT**（仅勾选 `Marketplace -> Manage` 权限），或在 GitHub Actions 直接配置 **Trusted Publishing (OIDC `vsce publish --oidc`)**。 | `[DEFERRED — PHASE 2 RELEASE]` | `HAP-04` |
| **0.2c** | **注册 Marketplace Publisher ID**：Ego Space 1 实测已完成注册并处于 Owner 登录状态——Display Name：**`SoulKey Tools`**，Publisher ID：**`soulkey-tools`**（`$0`、0% 抽成）。 | `[DONE — VERIFIED (soulkey-tools)]` | `HAP-04` |
| **0.2d** | **Phase 0 禁止打包/发布代码声明**：在 Phase 1 Smoke Test 绿灯前，**未运行 `vsce package` / `vsce publish` 且保持零扩展业务代码**。 | `[DONE — VERIFIED]` | — |

---

## Gate 0.3 — 静态着陆页骨架与 Phase 1 Smoke Test 托管

| 编号 | 操作项与执行细节 | 当前状态 | 人工停顿映射 |
|---|---|---|---|
| **0.3a** | **本地静态着陆页骨架就绪**：`landing/` 已全面升级为 **v2 互动深色工程官网（`ReqBridge Local API`）**——含纯前端零上传 Postman v2.1 → `.http` / OpenAPI 3.1 实时转换器（`demo.js`）、CSV 批跑模拟器、Staging vs Prod Schema Diff、5 竞品对比矩阵、本地架构图、独立结账页与三大法律页（`$19` 个人 / `$29` 团队 5 席一次性买断，`soulkey529@gmail.com`）。 | `[DONE — VERIFIED v2]` | — |
| **0.3b** | **5 选 1 候选拍板并回填着陆页文案**：用户认可候选 #1 并授权团队定稿，已锁定 **#1 `ReqBridge Local API`（VS Code `$0`）** 并完成全站槽位回填。 | `[DONE — LOCKED CANDIDATE #1]` | `HAP-05` |
| **0.3c** | **Cloudflare Pages Direct Upload 部署（`$0/月`）**：已通过 Ego Browser 重新部署 v2 站点至 **`https://reqbridge-local-api.pages.dev/`**，`8/8` 资源实测 `HTTP 200`，`6/6` HTML 页面 **Cloudflare Web Analytics (`beacon=True`)** 生效，且实机完成交互与双截图视觉验收。 | `[DONE — LIVE v2]` | `HAP-06` |
| **0.3d** | **Phase 1 `<7 天` 定向 ICP Smoke Test**：已通过用户 Ego 账号自动发出 4 个社区（**Dev.to** `#vscode #api #postman #webdev`、**Reddit `r/SideProject`**、**掘金**、**X `@soulkey529`**；V2EX 按用户要求跳过，知乎未登录跳过），详见 `phase1_outreach_log.md`。当前进入 3–7 天 Cloudflare Web Analytics UV/CTR 观察期。 | `[IN PROGRESS — DAY 1 LIVE]` | `HAP-06` |

---

## Gate 0.4 — Creem 双轨收款、Test Mode 与 Phase 2 实名上架门禁

| 编号 | 操作项与执行细节 | 当前状态 | 人工停顿映射 |
|---|---|---|---|
| **0.4a** | **Creem 账号注册与 Test Mode 沙盒**：注册 Creem 账号后先切换至 **Test Mode**（`test-api.creem.io` / `creem_test_*`）完成商品价格与 License Key 交付机制演练，**先不提交 Live Store Review**。 | `[PENDING USER ACTION]` | `HAP-07`（沙盒先行） |
| **0.4b** | **面包多（`mbd.pub`）个人实名准备**：在 `https://p.mbd.pub/` 注册并完成个人实名认证（无需营业执照），绑定个人支付宝与银行卡（用于微信支付资金托管自动提现）；具体商品上架延至 Phase 2。 | `[PENDING USER ACTION]` | `HAP-07`（实名先行） |
| **0.4c** | **购买独立域名 + Cloudflare Email Routing + Creem Live Review 提交**：**仅在 Phase 1 Smoke Test 绿灯（`>=2%–5%` CTR 或 `>=1–2` 预购意愿）后执行**！<br>1. 购买自定义域名（`~$8–$12/年`，Cloudflare Registrar 或 Porkbun）；<br>2. 将自定义域名绑定到 Cloudflare Pages 并开启 **Cloudflare Email Routing（`$0/月`）**，将 `support@<domain>` 转发至个人 Gmail，并更新 `landing/*.html` 中的 `[SUPPORT_EMAIL]`；<br>3. 部署可测试的功能 MVP（供 Creem 审核或 100% 优惠券测试）；<br>4. 在 `Balance -> Payout Account -> Set up Payout Account` 提交大陆个人身份证与同名支付宝，发起 **Creem Live Account Review**（1–3 工作日审核）。**绝对红线：禁止用 `*.pages.dev` 提交 Live Review**。 | `[DEFERRED — PHASE 2 GATE]` | `HAP-07` |
| **0.4d** | **Phase 2 扩展代码与第一笔 `$50` 汇损实测校准**：Smoke Test 绿灯后在独立 Fresh Session 按单模块 `<=300` 行开工，并在首笔 `$50+` 支付宝放款到账后登记 `creem_mianbaoduo_kyc_pack.md` 的汇损台账。 | `[DEFERRED — PHASE 2 GATE]` | — |
