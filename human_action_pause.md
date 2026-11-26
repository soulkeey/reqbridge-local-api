# 人工介入停顿确认清单（Human-in-the-Loop Pause Register）

> **核心隔离原则**：本文件列出 **所有必须由用户本人亲自执行或拍板** 的外部动作。  
> **Agent 绝对禁止行为**：严禁代填银行卡号/CVV/密码/PAT/身份证号，严禁假设或伪造任何登录、扣款、KYC 或外发贴完成状态，严禁未经用户确认擅自选品或向外部社区自动发帖。

---

## 总览映射表（与 `phase0_checklist.md` 1:1 绑定）

| Pause ID | 触发阶段 | 对应 `phase0_checklist.md` 项 | 人工动作简述 | 放行所需用户回执证据 |
|---|---|---|---|---|
| **HAP-01** | Phase 0 Day 1 | `0.1a`, `0.1b` | 招行 App 核验卡种/一类户/余额 + 开启万事达跨境线上支付 + 确认 3DS 短信 | **`[DONE — USER CONFIRMED]`** |
| **HAP-02** | Phase 0 Day 1–2 | `0.1c`, `0.1d` | 登录并绑定 PayPal / Google Pay（强制 USD 拒 DCC）+ 注册 Cloudflare `$0` | **`[DONE — VERIFIED]`** *(Cloudflare `Soulkey529@gmail.com` 已登录就绪；Google Wallet 已开；PayPal 标签页处于登录页)* |
| **HAP-03** | Phase 0 Day 2 | `0.1e` + Switch Rule | 尝试 Chrome Web Store `$5` 付款（最多 2 次）**或**直接触发切换 VS Code `$0` | **`[DEFERRED — SWITCHED TO VS CODE $0]`** *(用户跳过 `$5`，锁定 `$0` VS Code 主线)* |
| **HAP-04** | Phase 0 Day 2–3 | `0.2a`, `0.2b`, `0.2c` | 注册 Azure DevOps 组织 + 创建 **Org-Scoped PAT**（非 Global！）/ OIDC + 注册 VS Code Publisher ID | **`[PARTIAL — PUBLISHER VERIFIED]`** *(Publisher **`soulkey-tools`** 已成功注册！但 `azure.microsoft.com` 页为付费 Azure 云切勿绑卡，免费 `aex.dev.azure.com/me` 组织建置与 PAT/OIDC 延至 Phase 2 发布前)* |
| **HAP-05** | Phase 0 末 | `0.3b` | 审阅 `pain_points_5_candidates.md`，5 选 1 最终拍板 + 命名 + 定价 + 邮箱前缀 | **`[DONE — LOCKED #1]`** *(`ReqBridge Local API`，`$19` 个人 / `$29` 团队 5 席买断，`soulkey529@gmail.com`)* |
| **HAP-06** | Phase 1 Day 4–10 | `0.3c`, `0.3d` | Cloudflare Pages Direct Upload 上传 `landing/` + 外部社区发帖导流并回传 Day-7/10 数据 | **`[IN PROGRESS — DAY 1 LIVE, MONITORING UV/CTR]`** *(v2 互动官网已上线 `https://reqbridge-local-api.pages.dev/`；Dev.to、Reddit `r/SideProject`、掘金、X 均已由 Agent 代发上线，进入 3–7 天数据观察窗)* |
| **HAP-07** | Phase 2 门禁（Green Light 后） | `0.4a`, `0.4b`, `0.4c` | 购买自定义域名 + 配置 Cloudflare Email Routing + 完成 Creem/面包多个人实名 KYC 并提交 Live Review | **`[DEFERRED — PHASE 2 GATE]`** *(待 `HAP-06` 绿灯后立即解锁)* |

---

## 分步零歧义操作指令

### `HAP-01` — 招行万事达卡手机银行设置（Phase 0 Day 1）
1. 打开手机 **招商银行 App** → 进入 **我的 → 银行卡**，点开你的万事达卡。
2. **核实三项基础条件**：
   - 记录卡种是 **万事网联人民币借记卡** 还是 **全币种信用卡**；
   - 若为借记卡，确认账户类型为 **一类户**（二类户日/年限额极易在海外网关报错）；
   - 确保活期人民币可用余额 **`>= ¥100`**（即便 `$0` 预授权验证也需要余额覆盖）。
3. 进入 **`卡片详情 → 快捷支付 / 安全管理`**，找到 **`万事达卡跨境线上支付` / `境外无卡支付`** 并将其**开启**（默认通常关闭）。
4. 确认本机号码国际/国内短信通道畅通，避免 3D Secure (3DS) 动态验证码收不到。
5. **停顿回报**：只告诉我“卡种（借记/信用）+ 一类户余额够 + 跨境线上支付已开启”，**切勿把卡号、有效期或 CVV 发给我**。

---

### `HAP-02` — PayPal、Google Pay 与 Cloudflare `$0` 账号就绪（Phase 0 Day 1–2）
1. **保持网络洁净一致**（避免频繁切换海外节点导致与大陆卡 BIN 冲突触发风控）。
2. 登录 **PayPal** 与 **Google Pay (`payments.google.com`)**，绑定招行万事达卡：
   - 持卡人英文/拼音姓名、账单地址必须与招行预留完全一致；
   - 任何时候只要页面弹窗提示“用人民币 CNY 结算”，**一律点选拒绝（选 `USD` 原币结算）**，规避 DCC 隐性加价。
3. 访问 **Cloudflare (`dash.cloudflare.com`)** 注册/登录免费账号：
   - **Cloudflare Pages Free 托管静态网页无需绑卡**，此时不必填写信用卡或购买任何套餐。
4. **停顿回报**：回复“PayPal、Google Pay 已绑卡（USD），Cloudflare 免费账号已登录”。

---

### `HAP-03` — Chrome Web Store `$5` 实测门禁或切换 VS Code `$0`（Phase 0 Day 2）
> **前置决定**：若你希望在 Smoke Test 验证需求前保持 **`$0` 现金零支出**，可直接跳过本步扣款，口头回复 **“直接切换 VS Code `$0` 主线”**！
1. 若要测试 Chrome Web Store：先用浏览器登录你打算**长期永久绑定**的 Google 账号（⚠️ **官方规则：CWS 开发者邮箱注册后不可修改**）。
2. 打开 `https://chrome.google.com/webstore/devconsole`，点击支付 `$5 USD` 一次性注册费。
3. **最多 2 次干净尝试原则**：
   - 第 1 次：Google Pay / 卡支付（确认币种为 USD）；
   - 若被拒，等待几分钟核对账单地址与 3DS 后做第 2 次；
   - **触发切换规则**：若连续 2 次失败、或招行发来风控短信，**立刻停止重试（严禁连刷锁卡）**！
4. **停顿回报**：回复“CWS `$5` 已通过” **或** “CWS 被拒 / 选择零现金，切换 VS Code `$0`”。

---

### `HAP-04` — VS Code Marketplace（`$0`）与 2026-12-01 PAT 防护（Phase 0 Day 2–3）
1. 使用 Microsoft 账号（`$0`）登录 `https://dev.azure.com`，创建或选定一个 Azure DevOps Organization。
2. **创建发布 Token（⚠️ 2026-12-01 必看红线）**：
   - 微软将于 **2026-12-01** 正式退役勾选 `"All accessible organizations"` 的 **Global PAT**；
   - 点击右上角 `User Settings -> Personal Access Tokens -> + New Token`；
   - **Organization 下拉框必须选择你刚才创建的单一组织（严禁选 `All accessible organizations`！）**；
   - Scopes 仅勾选 `Marketplace -> Manage`；妥善保存在本地密码管理器中（**不要粘贴到对话中**）。
   - （Phase 2 自动化发布时再配合 GitHub Actions 配置 **Entra ID OIDC `vsce publish --oidc`**。）
3. 访问 `https://marketplace.visualstudio.com/manage`，注册你的 **Publisher ID**（`$0`）。
4. **停顿回报**：回复你的公开 **Publisher ID**（切勿发送 PAT 原文）。

---

### `HAP-05` — 5 选 1 痛点候选最终拍板（Survey / Phase 0 结束）
1. 通读并核对 `pain_points_5_candidates.md` 中的 5 个候选（痛点原始链接、F1/F2/F3 合规审计、目标平台与定价）。
2. **拍板四要素**：
   - 选定编号：`Candidate #__`（及确认平台：VS Code / Chrome）；
   - Clean-room 独立品牌名（不含原 SaaS 商标词）；
   - 选定硬定价（必须 `>= $12–$15`，推荐 `$19` 早鸟 / `$29` 标准 或 `$15/月`）；
   - Phase 1 测试期临时联系邮箱（Phase 2 买域名后再换 `support@<domain>`）。
3. **停顿回报**：回复上述四要素，由 Agent 仅做着陆页文案与槽位回填（仍不写业务代码）。

---

### `HAP-06` — Cloudflare Pages 上传与 Phase 1 定向导流（Phase 1 Day 4–10）
1. 登录 Cloudflare Dashboard → **Workers & Pages → Create → Pages → Direct Upload（上传资产）**，将 `p0_unbundling_launch/landing/` 文件夹直接拖入上传，获得 `https://<slug>.pages.dev`。
   - **提示**：Direct Upload 模式创建后不能改回 Git Integration，Phase 1 纯静态测试用 Direct Upload 最快最省事。
2. 人工在目标社区（按选定候选对应的 subreddit / GitHub Discussions / 论坛）发帖或回复真实求助贴，附上 `.pages.dev` 链接并诚实说明处于 Early Access 预研阶段。
3. **Day-7 / Day-10 停顿回报**：回传实际统计到的独立访客（UV）、页面点击/意向反馈数：
   - 若 UV `>= 150` 且结账点击率 `< 1%`、无付费意愿 → **执行 Day-10 止损，旋转下一候选**；
   - 若 `>= 2%–5%` CTR 或收到明确预购意愿 → **解锁 `HAP-07` 与 Phase 2 MVP 开发**。

---

### `HAP-07` — Phase 2 门禁：自定义域名、Email Routing 与双轨 KYC（仅 Green Light 后）
> **红线警告**：未通过 `HAP-06` Day-10 验证前，**严禁执行以下花钱或提交 Live 审核动作**！
1. **购买自定义域名（`~$8–$12/年`）**：在 Cloudflare Registrar 或 Porkbun 购买与品牌匹配的 `.com` / `.dev` 域名。
2. **绑定域名与免费邮箱转发（`$0/月`）**：
   - 将域名添加到 Cloudflare Pages Custom Domains；
   - 开启 **Cloudflare Email Routing**，验证你的 Gmail 并配置 `support@<yourdomain>` 转发；
   - 更新 `landing/*.html` 中全部 `[SUPPORT_EMAIL]` 为 `support@<yourdomain>`。
3. **面包多（`mbd.pub`）实名认证**：登录 `https://p.mbd.pub/` 完成个人实名认证，绑定本人支付宝与银行卡。
4. **Creem Live 审核与个人 KYC**：
   - 确认 Phase 2 MVP 测试包已可正常交付或可生成 100% 折扣测试码；
   - 在 Creem 填写 **自定义域名**、**`support@<yourdomain>`**（与网站页脚 100% 一致）、非商标产品描述；
   - 进入 `Balance -> Payout Account -> Set up Payout Account` 上传本人身份证并绑定同名支付宝；
   - 核对 `creem_mianbaoduo_kyc_pack.md` 的 **11 项预检门禁** 全过后再点击提交 Live Review（**严禁将 `*.pages.dev` 提交给 Creem Live Review**）。
5. **停顿回报**：回复“Creem Live Approved + 面包多实名通过”。
