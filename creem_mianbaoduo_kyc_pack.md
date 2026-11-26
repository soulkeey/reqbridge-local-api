# Creem 个人 KYC、Live Review 11 项门禁与面包多双轨收款物料包

> **定位**：Phase 0/2 收款合规、API 规格与财务对账参考包（**仅含规范与物料清单，不含任何业务逻辑代码**）。  
> **基准费率**：Creem `3.9% + $0.40`/笔（`$0/月`）；面包多标准约 `3%` / 面包多支付 `¥0.1 + 2%`；热备 Dodo + Payoneer `6.0% + $0.40`。

---

## 1. Creem 大陆个人开发者 KYC 与同名支付宝直提物料清单

### 1.1 准入与资金规则（`China*` Individual）
- **身份资质**：支持中国大陆个人开发者（**无需企业或个体工商户营业执照**）。在读本科生（`2027-06` 毕业）维持自然人身份申报，年综合所得 `<= 60,000 RMB` 汇算后个税 `0.0%`，**Phase 0–2 禁止提前注册个体户**。
- **MoR 税务代缴**：Creem（Armitage Labs OÜ）作为 Merchant of Record 代扣代缴全球 VAT/GST。
- **支付宝直提限额与周期**：
  - 提现渠道：**Alipay（人民币直提）**（避开 `$7` / `1%` 银行电汇费与银行入账审查）；
  - 单笔上限：`<= 50,000 CNY`；年度限额：`300,000–600,000 CNY`；
  - 起付门槛：**`$50 USD` / `€50 EUR`**；
  - 打款日：每月 **1 日** 与 **15 日**；
  - 订单结算风控期：每笔成功交易后 **7–12 天** 滚动解冻；
  - 拒付罚金：`$25`/笔（因此必须保证产品描述透明、响应迅速与明确退款政策）。
- **100% 实名一致铁律**：Creem KYC 填写的姓名（中文与拼音拼写/顺序）、中国大陆居民身份证、以及收款支付宝实名认证主体必须 **100% 为同一人**，不可借用他人账号收款。

### 1.2 KYC 申报必填物料自检表
| 字段 | 准备内容与规范要求 | Phase 0 状态 |
|---|---|---|
| **Legal Name** | 身份证法定姓名（汉字 + 规范拼音，与支付宝完全一致） | 待 `HAP-07` 用户自填 |
| **Government ID** | 中国大陆居民身份证正反面清晰原图 +（如触发）活体自拍 | 待 `HAP-07` 用户上传 |
| **Tax Residence** | `China`（个人所得税居民） | 待 `HAP-07` 用户确认 |
| **Store / Product Name** | 独立 Clean-room 品牌名（严禁含被拆解 Series A SaaS 商标词） | 待 `HAP-05` 拍板 |
| **Website URL** | **必须为独立自定义域名**（`https://<customdomain>`）。`*.pages.dev` 仅限 Phase 1 测需求，**严禁填入 Live Review** | `[DEFERRED — PHASE 2 GATE]` |
| **Support Email** | **`support@<customdomain>`**（通过 Cloudflare Email Routing `$0/月` 转发至 Gmail），必须与着陆页页脚完全一致 | `[DEFERRED — PHASE 2 GATE]` |
| **Product Description** | 明确声明为 **Deterministic local-first / BYOK developer/productivity extension**（本地确定性工具或用户自备 Key），非内容下载器、非爬虫、非代管 AI 生成套壳 | 模板已备好（见下） |
| **Payout Account** | 本人实名支付宝账号（`Balance -> Payout Account -> Set up Payout Account`） | 待 `HAP-07` 用户绑定 |

> **推荐 Business / Product Description 英文填报模板**：  
> `"[PRODUCT_NAME] is a deterministic, local-first productivity extension for [VS Code / Chrome] that helps [TARGET_ICP] batch-process and convert [SPECIFIC_WORKFLOW] locally without cloud lock-in. Users receive an instant Creem license key to unlock Pro workflows on up to 3 devices. No third-party scraping, no content downloading, and no hosted AI media generation."`

---

## 2. Creem Live Account Review 11 项硬性预检门禁

Creem 官方规则规定：**`"Changes requested"` 允许修改后点击 `Request re-review`；`"Rejected"` 对该店铺为永久终局裁定**（官方规范：`https://docs.creem.io/merchant-of-record/account-reviews` 与 `https://docs.creem.io/merchant-of-record/account-reviews/rejected-accounts`；买家端支付方式见 `https://docs.creem.io/merchant-of-record/finance/payment-methods`，支持 Card / Apple Pay / Google Pay / Alipay / iDEAL / Alipay HK）。在 Phase 2 点击提交 Live Review 前，必须 11/11 全部打钩：

| # | 审核项 | 官方要求与拒签红线 | 对应着陆页/项目落点 |
|---|---|---|---|
| 1 | **Own Custom Domain** | 严禁 `*.pages.dev` / `vercel.app` / `github.io` / Notion / Gumroad | Phase 2 购买独立域名绑定 Cloudflare Pages |
| 2 | **Live / Testable Product** | 产品可正常购买或供审核员用 100% 折扣码完成端到端实测 | Phase 2 MVP 测试包就绪后再申 Live |
| 3 | **Visible Pricing (`>=$12–$15`)** | 价格清晰展示且与结账页一致（无隐性收费，禁 `$5` 低价单） | `landing/index.html#pricing` |
| 4 | **Clear Product Scope** | 清楚说明软件功能、运行平台（VS Code / Chrome）与交付物 | `landing/index.html` Hero + `#features` |
| 5 | **Zero Fake Social Proof** | **严禁虚假评价、虚构星级、虚构用户数量** | `landing/index.html`（已强制清零） |
| 6 | **Privacy Policy 可达** | 全站每页页脚/导航可访问，无 `lorem ipsum` / 断链 | `landing/privacy.html` |
| 7 | **Terms of Service 可达** | 含授权范围、免责声明与独立产品非官方声明 | `landing/terms.html` |
| 8 | **Refund Policy 可达** | 明确 14 天退款条件、申请邮箱与退订途径 | `landing/refund.html` |
| 9 | **Branded Support Email Match** | 网站显示的 `support@<domain>` 与 Creem Business Details 100% 一致 | `landing/*.html` 页脚 `[SUPPORT_EMAIL]` |
| 10 | **3-Business-Day Support SLA** | 承诺并在实战中做到 3 个工作日内回复工单（否则 Creem 可自动退款） | `landing/refund.html` |
| 11 | **Prohibited / Restricted 自查** | 严禁视频/音频下载器、售卖爬取邮箱/手机号名单、多开防关联浏览器、自动交易 EA、论文代写、DRM 破解；避开需额外 Credits/审核 API 的生成式 AI 图像/视频套壳 | 已由 P0 三条结构过滤线（F1/F2/F3）前置拦截 |

---

## 3. Creem 原生 License Key API 集成契约（仅规格说明，Phase 0 无代码）

- **商品交付配置（Creem Dashboard）**：`Product -> Delivery -> Add -> New license key`，配置单 Key 最大激活设备数（建议 `3` 台）与有效期（`1 year` 或 `Lifetime`，与定价方案对齐）。
- **双环境端点**（API 参考文档：`https://docs.creem.io/api-reference/endpoint/activate-license`）：
  - **Phase 1 沙盒（Test Mode，API Key 前缀 `creem_test_*`）**：
    - `POST https://test-api.creem.io/v1/licenses/activate`
    - `POST https://test-api.creem.io/v1/licenses/validate`
    - `POST https://test-api.creem.io/v1/licenses/deactivate`
  - **Phase 2 生产（Live Mode）**：
    - `POST https://api.creem.io/v1/licenses/activate`
    - `POST https://api.creem.io/v1/licenses/validate`
    - `POST https://api.creem.io/v1/licenses/deactivate`
- **核心接口契约**：
  1. `POST /v1/licenses/activate`：输入 `{ key, instance_name }`，首次激活返回 `instance.id` 与状态 `active`。
  2. `POST /v1/licenses/validate`：输入 `{ key, instance_id }`，验证授权是否有效及剩余激活次数。
  3. `POST /v1/licenses/deactivate`：用户换机时释放旧设备配额。
  4. **Webhook（可选）**：`checkout.completed` 事件载荷内含 `license_keys` 数组。
- **零后端 MVP 架构提示（Phase 2 适用，省配额 & 零运维）**：若不设置自定义 `success_url`，Creem 默认在支付成功页、收据邮件及 Customer Portal 自动向买家展示 License Key，**MVP 完全不需要自建数据库或支付回调服务器**；仅需一个极轻量的无状态 Cloudflare Worker（免费版 `100,000 req/day`）转发或由扩展端安全校验即可。

---

## 4. 首笔 `$50` 支付宝汇损与实收校准台账模板（Phase 2 实测回填）

> **未验证缺口标注**：`[UNVERIFIED GAP: Creem 合作银行实际执行的 USD -> CNY 汇率点差 (bps) 官方未公开]`。待 Phase 2 首次累计满 `$50` 并在 1 日/15 日放款至支付宝后，必须按实际到账人民币填表闭合缺口：

| 批次 | 订单总毛额 (USD) | Creem 扣费 (`3.9%+$0.40`) | 净结算额 (USD) | 放款日 (1日/15日) | 支付宝实收 (CNY) | 隐含实结汇率 (`CNY/USD`) | 当日中行中间价 | 实测汇损点差 (`bps`) | 备注（是否触发异常） |
|---|---|---|---|---|---|---|---|---|---|
| `#1` (校准首单) | `[待实测]` | `[待实测]` | `[待实测]` | `[待实测]` | `[待实测]` | `[实收÷净USD]` | `[待记录]` | `[待计算]` | 首次校准模型 `7.20` 假设 |
| `#2` | | | | | | | | | |

---

## 5. 面包多（`mbd.pub`）国内双轨配置物料

- **个人开店资质**：支持中国大陆个人直接开通（免营业执照），按合规要求完成**个人实名认证（`实名认证`）**并绑定个人支付宝 + 储蓄卡。
- **费率与资金路径**：
  - 平台标准费率约 `~3%`；接入「面包多支付」通道费率 `¥0.1 + 2%`（支持支付宝与微信支付）。
  - 买家使用**支付宝**付款：资金较快直达绑定支付宝；买家使用**微信支付**付款：进入合规银行托管账户并按周期自动提现至绑定储蓄卡。
- **Phase 2 零运维交付方案（`卡密 / 自动发货`）**：
  - 在月度国内订单 `< 30` 单前，**不搭建 Webhook 自动发码后端**；直接在面包多后台开启商品「自动发货 / 固定或批次卡密」，批量导入预生成的授权 Key（与扩展离线/Creem 校验逻辑兼容），做到 `0` 服务器维护。
- **国内定价对齐原则**：
  - 优先对标海外价格带（如 `$15 -> ¥108` 或 `$19 -> ¥138`）；若针对国内独立开发者/学生客群做本地化阶梯（如 `¥49–¥99`），需牢记国内相同净利需要海外约 **3–4 倍** 的销量，切勿陷入低客单高客服泥潭。

---

## 6. 热备通道触发条件（Dodo Payments + Payoneer）

- **热备费率**：Dodo Payments `6.0% + $0.40`/笔（中国个人 `32. China` + Payoneer 提现）。
- **启用条件**：仅当海外 **MRR 稳定 `> $200/月`** 需要异地容灾备份，或 Creem 遇到账户复核/提现延迟时再按热备流程开通，Phase 0–1 不分散精力。
