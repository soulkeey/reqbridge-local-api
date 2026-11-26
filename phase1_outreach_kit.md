# Phase 1 定向 ICP 导流文案包与 Smoke Test 计分卡（`ReqBridge Local API` v2 互动版）

> **线上站点**：`https://reqbridge-local-api.pages.dev/`（含零上传纯浏览器 Postman v2.1 → `.http` / OpenAPI 3.1 实时转换器、CSV 批跑模拟器、Staging vs Prod Diff 对比器）  
> **结账意向追踪锚点**：
> - 个人早鸟买断 (`$19` 一次性)：`https://reqbridge-local-api.pages.dev/checkout-personal.html`
> - 团队 5 席买断 (`$29` 一次性)：`https://reqbridge-local-api.pages.dev/checkout-team.html`
> **策略更新**：按用户指示跳过需邀请码的 V2EX，聚焦 **Dev.to / Reddit / 掘金**。

---

## 一、Dev.to 英文干货长文（首发主推）

**Title**：
`Escaping Postman Cloud Lock-In & Thunder Client v3.0.0 Limits: Moving API Tests to Git-Native .http Files`

**Tags**：`vscode`, `api`, `postman`, `webdev`

**Body**：
```markdown
Over the past two years, many backend and full-stack developers ran into the exact same two walls when testing APIs inside VS Code:

1. **Postman** retired its offline Scratch Pad and pushed teams toward cloud-synced workspaces ($9 Solo / $19 Team per user/month).
2. **Thunder Client v3.0.0** recently introduced a mandatory free account login, alongside the 50-request-per-collection and 50-monthly-runner-execution cap on the free plan (locking Data-Driven CSV runs, Git Sync, CLI/CI, and WSL behind paid plans).

If your main requirement is keeping API collections inside Git and running parameterized requests locally against `localhost` or `staging`, plain-text `.http` files cover almost everything cleanly.

---

### Step 1: Plain-Text `.http` Files Diff Cleanly in Git

Instead of opaque cloud exports, a `.http` suite lives right next to your routes:

```http
@baseUrl = http://localhost:3000
@token = {{$dotenv API_TOKEN}}

### Create Order Smoke Check
POST {{baseUrl}}/v2/orders
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "sku": "PRO-19",
  "quantity": 1
}
```

### Step 2: Three Silent Traps When Migrating Existing Collections

When teams move larger Postman v2.1 collections or Bruno `.bru` folders to `.http` or OpenAPI 3.1, three things usually break quietly:

1. **Inherited Folder Auth**: Collection-level Bearer or API-Key headers vanish when exporting individual sub-folders.
2. **`pm.test()` Assertions**: Scripts setting dynamic variables (`pm.environment.set(...)`) and status assertions need deterministic tracking and JUnit XML parity in CI.
3. **CSV / JSON Data-Driven Batches**: Plain `.http` files handle single runs well, but iterating 100+ CSV rows and comparing `staging` vs `prod` response schemas usually pushes developers back toward subscription SaaS runners.

---

### Try the Browser-Local Postman → `.http` / OpenAPI Converter (0 Bytes Uploaded)

I built a working client-side Postman v2.1 → `.http` & OpenAPI 3.1 converter right on our preview page (paste any collection JSON—it parses folder auth inheritance and assertions entirely inside your browser) as part of validating **ReqBridge Local API**, a local-first VS Code extension:

- Lossless `Postman v2.1` / `Bruno (.bru)` ↔ `.http` & `OpenAPI 3.1` conversion
- Unlimited local CSV / JSON parameterized batch runs with JUnit XML & Markdown output
- Side-by-side `staging` vs `prod` JSON schema & latency diffing (optional BYOK only for translating complex JS `pm.test()` logic)

Before finishing the full extension release ($19 Early-Access Personal / $29 Team 5-Seat Pack—one-time purchase, zero cloud login), I'd love feedback from anyone actively migrating off Postman or Thunder Client:

**Try the live converter & interactive sandbox here:** https://reqbridge-local-api.pages.dev/#demo

Which Postman / `.bru` auth pattern or assertion script causes the most friction in your repo?
```

---

## 二、掘金（`juejin.cn`）中文技术实战帖

**标题**：
`避开 Postman 强制云登录与 Thunder Client 50 次限制：用浏览器实时把 Collection 无损转成 Git 原生 .http（附在线试跑工具）`

**正文**：
```markdown
这两年在 VS Code 里测后端接口的同学，大概率都踩过同样的两个坑：

1. **Postman** 下线离线 Scratch Pad 后强推云端账号登录，团队版按人头月付成本很高（$19/人/月）；
2. **Thunder Client v3.0.0** 开始强制注册登录免费账号，而且免费版限制每个集合最多 50 个请求、每月 Runner 只能跑 50 次，把 CSV 数据驱动、Git 同步和 WSL 全锁在了付费版后。

其实只要把接口用例回归成纯文本 `.http`（放在代码仓里跟着 PR 走 Git Diff），大多数本地和联调场景根本不需要再养一个云端客户端。

### 手工迁移常见三个暗坑

1. **文件夹级鉴权丢失**：Postman 集合或父目录里配好的 Bearer Token / API Key，单独拆文件时最容易丢；
2. **`pm.test()` 断言与变量提取断链**：环境变量和状态码校验丢掉后，CI 里很难继续出 JUnit 报告；
3. **CSV 批量跑测与双环境 Diff**：单条 `.http` 好写，但要本地跑 100+ 行 CSV 参数化测试、或者对比 `staging` 和 `prod` 返回 JSON 字段差异时，还是会缺顺手的工具。

### 我做了个 0 上传的在线 Postman → `.http` / OpenAPI 3.1 转换沙盒

为了先验证有多少开发者真正需要把这套迁移 + 无限次本地批跑 + 响应 Diff 做成纯本地 VS Code 插件（**ReqBridge Local API**，无云登录、可选 BYOK、一次性买断早鸟 $19 个人 / $29 团队 5 席），我先把**纯前端零上传的转换器、CSV 批跑模拟和 Diff 预览**放到了首页上，你可以直接粘贴自己的 Postman v2.1 JSON 现场看转换效果：

👉 **在线交互沙盒（数据不出浏览器）**：https://reqbridge-local-api.pages.dev/#demo

欢迎做后端和全栈的朋友体验拍砖：你在从 Postman / Thunder Client 往 `.http` 或 OpenAPI 迁移时，最卡脖子的是哪一步？
```

---

## 三、Reddit（`r/SideProject` / `r/vscode` / `r/webdev`）发帖与评论草稿

**主帖（`r/SideProject` / `r/webdev`）Title**：
`I built a zero-upload browser Postman v2.1 -> VS Code .http & OpenAPI 3.1 converter to validate an extension before coding the full VS Code release`

**主帖 Body**：
```text
After seeing developers hit Thunder Client v3.0.0's mandatory login + 50-run monthly cap (and Postman pushing cloud workspaces), I decided to test real demand before writing the full VS Code extension.

Instead of putting up a blank waitlist, I built a live client-side Postman v2.1 JSON -> VS Code `.http` & OpenAPI 3.1 converter right on the landing page (walks nested folders, preserves inherited Bearer/API-Key/Basic auth, and extracts `pm.test()` assertions—0 bytes leave the browser).

Live sandbox: https://reqbridge-local-api.pages.dev/#demo

The full VS Code extension (**ReqBridge Local API**) adds unlimited local CSV/JSON batch execution with JUnit XML output and side-by-side `staging` vs `prod` schema diffs as a one-time license ($19 Personal / $29 Team 5-seat—no recurring subscription).

Honest feedback welcome:
1. Does the live converter handle your collection structure cleanly?
2. Would you pay $19 once to kill Postman/Thunder Client caps and get unlimited local CSV runs + staging/prod schema diffs in VS Code?
```

---

## 四、Day 1–10 计分卡
- 查看 Cloudflare Dashboard → `reqbridge-local-api` → Metrics → Web Analytics：
  - UV（`/` 与 `/index.html`）目标 `>= 100–150`
  - Checkout CTR = `(/checkout-personal.html + /checkout-team.html) / UV`
  - **绿灯（`>= 2%–5%` CTR 或 `>= 1–2` 封预订邮件）** → 立即进 Phase 2 写插件 MVP + 买域名过 Creem 支付宝实名。
