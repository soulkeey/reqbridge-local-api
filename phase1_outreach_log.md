# Phase 1 外发审计与实时上线记录（`ReqBridge Local API` v2）

> **更新时间**：2026-11-26（UTC+8）  
> **v2 互动版官网**：`https://reqbridge-local-api.pages.dev/`（`8/8` 资源 HTTP `200`，`6/6` HTML 页面 Cloudflare Web Analytics `beacon=True`，客户端零上传 Postman v2.1 → `.http`/OpenAPI 3.1 转换器 + CSV 批跑模拟器 + Staging/Prod Diff 对比实测与双截图视觉 QA 全部通过）  
> **结账意向追踪锚点**：`/checkout-personal.html`（`$19` 个人买断）与 `/checkout-team.html`（`$29` 团队 5 席买断）  
> **安全与代码边界**：仍保持**零 VS Code 扩展业务代码**（`manifest.json` / `package.json` / `.ts` / `.py` 为 `0`）；仅通过用户已登录浏览器账号自然发布，未破解任何验证码或邀请码。

---

## 一、已发出与已核验社区帖子汇总（共 4 个平台上线）

| 平台 | 发布账号 | 状态 | 实测公开链接 / 核验记录 |
|---|---|---|---|
| **Dev.to** | `Soul key` | **✅ 已发布并校准标签** | https://dev.to/soul_key_a4994f50eddd079b/escaping-postman-cloud-lock-in-thunder-client-v300-limits-moving-api-tests-to-git-native-http-21ml <br>*(已修正为 `#vscode` `#api` `#postman` `#webdev` 4 个标准标签)* |
| **Reddit (`r/SideProject`)** | `u/Soulboy529` | **✅ 已发布并存活** | https://www.reddit.com/r/SideProject/comments/1y5yju1/i_built_a_zeroupload_browser_postman_v21_vs_code/ <br>*(刷新帖子直链确认正文正常展示，未被 AutoMod 移除)* |
| **稀土掘金 (`Juejin`)** | 掘金已登录账号 | **✅ 已发布成功** | https://juejin.cn/post/7712287194292256804 <br>*(分类「开发工具」、标签「Git」，已避开 ByteMD 双 `$` 数学渲染冲突)* |
| **X (`x.com`)** | `@soulkey529` | **✅ 已发布** | https://x.com/soulkey529 <br>*(以 `Control+Enter` 提交 259 字符短推后主页显示 `1 post`；精确单条 `/status/` 链接待后续在个人主页直接查看)* |
| **知乎 (`Zhihu`)** | — | **⏭️ 未登录跳过** | `zhihu.com/signin` 未登录，遵守规则未绕过 |
| **V2EX** | — | **⏭️ 按用户指令跳过** | 需邀请码注册，按用户要求放弃 |

---

## 二、Phase 1 → Phase 2 触发监控规则（Day 1–10）

1. **查看流量与点击**：打开 Cloudflare Dashboard → **Workers & Pages → `reqbridge-local-api` → Metrics → Web Analytics**：
   - `UV`：`/` 与 `/index.html` 访客合计数；
   - `Checkout 点击数`：`/checkout-personal.html` + `/checkout-team.html` 访问合计数；
   - `预订邮件`：检查 `soulkey529@gmail.com` 收件箱中主题含 `Early Access Reservation` 的回复。
2. **绿灯触发即进 Phase 2**：若 `CTR >= 2%–5%` 或收到 `>= 1–2` 封预订邮件，立即用 Antigravity 按单模块 `<= 300` 行开始写 **ReqBridge Local API** 插件 MVP、买自定义域名过 Creem 个人实名（+ 面包多国内双轨），冲刺第一笔 `$19` / `¥139` 实单。
3. **止损开关**：若累计 `UV >= 150` 且结账点击率 `< 1%`、`0` 预订邮件，则不写一行插件代码，直接切换至候选 **#2（`SafeMigrate Guard`）**。
