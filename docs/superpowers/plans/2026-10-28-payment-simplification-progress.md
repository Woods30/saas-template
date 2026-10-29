# SDD ledger — plan: docs/superpowers/plans/2026-10-28-payment-simplification.md

用户已确认完整范围并授权新增设计/计划/测试与支付 schema 调整。实施中，不要再次询问是否继续。

分支 refactor/payment-simplification；初始 HEAD 61c2d3c。无提交/推送授权，不提交。原工作区干净。

Ruling: 当前目录新分支直接实施，不创建额外 worktree — 已获完整重构授权，避免额外隔离确认及依赖重装 — 风险为当前目录保留未提交改动。
Ruling: 默认保留现有 free/pro/lifetime 的销售引用，lifetime 改独立一次性语义，不新建线上 Starter 商品 — 模板能力不依赖新增远程商品 — 默认文案需同步去替代订阅语义。
Pre-flight: Task1 price catalog consumed by Task2 checkout and Task3 UI; unified reference/mode/interval/offerId replaces lookup-specific options. Task2 snapshot consumed by billing; remove itemId/pending everywhere together.

基线：payment-price-map、payment-plan-state、billing-query 三文件 121/121 通过。
TDD RED: 新 tests/unit/payment-products.test.ts 3/3 失败（旧配置无 prices，旧 merge 读 options）。GREEN: 扁平 products/types/catalog 改后 3/3 通过。

已修改：src/config/products.ts（单列表、prices、resolvePriceReference/collectPriceReferences/findOfferByReference/productConfigErrors）；src/types/pricing.ts；src/payment/price-catalog.ts；src/payment/price-catalog.server.ts；src/payment/types.ts（新的通用 Checkout/Price/Subscription/PaymentEvent）；src/payment/index.ts；src/config/service-status.ts（新配置校验）。设计/计划/测试已新建。

Task 1: complete — 扁平配置、provider 价格目录及配置自检完成。
Task 2: complete — Checkout/Portal、Webhook 归一化持久化、schema/迁移完成，独立审阅 6 项修复经回归验证。
Task 3: complete — Pricing/首页/账单、种子与 E2E 完成。
Task 4: complete — 文档与最终验证完成。2026-10-28 最后结果：pnpm check 通过；unit 62 文件 790/790；components 27 文件 223/223；payment E2E 4/4；build 和 client bundle 检查通过。无提交/合并/推送/部署。

验证（审阅修复前）：unit 62 文件 782 项通过；components 27 文件 222 项通过；pnpm check/build/check:client-bundle 通过。
隔离 D1 首轮 payment E2E：2 passed/1 failed，失败为历史状态 locator 精确匹配不含日期；页面实际包含已取消历史，已修 locator，最终 4/4 通过。种子脚本新增 --persist-to，查询和写入都使用测试隔离目录；未动原本地库。
用户单独授权删除 switch API/client 和两项专用测试后已删除，routeTree 经正常 build 更新。

Final review: 独立代理只读审阅收到 6 项，均核验进入修复：Checkout 检查竞态、旧事件误删预留、改选项静默复用、同秒快照覆盖、多笔发票付款关联遗漏、迁移/schema 不一致。
Final: fixed 旧事件误删预留 — 回归 RED（预留数0）→GREEN；保留预留至过期并二次检查有效订阅。
Final: fixed 改选项静默复用 — 选项冲突抛 CHECKOUT_PENDING，API409及中英文提示，不跳转旧付款选项。
Final: fixed 同秒快照覆盖 — 读本地 snapshot_version 后重新拉真实快照，CAS 返回空时重新拉取重试；并发回归通过。
Final: fixed 多笔付款遗漏 — Stripe invoicePayments 完整分页，每笔实际金额单独交易并关联 PaymentIntent；RED undefined payments→GREEN。
Final: fixed 迁移约束和索引 — 完整迁移 PRAGMA 回归 RED（非空为0）→GREEN；重建表落实 NOT NULL 和 provider/charge 复合索引，快照经 API 重新生成。
Final: fixed 首页 JPY 金额 — RED ¥19→GREEN ¥1,900；同时使用 offer ID 作为 key。
Ruling: 改选项不自动关闭旧 Checkout，显示明确待完成会话提示 — 避免扩展服务商会话管理 API，保证不会静默购买错误选项 — 用户需返回原选项或等会话过期。
Ruling: 不恢复仅依赖 checkout=success 查询参数的旧 purchase 统计 — 该参数不能证实付款，也可能读取旧交易，继续发会记录错误收入 — 本次不自动发送 purchase，后续需按已验证交易单独设计。

Final: fixed Checkout 检查竞态 — 临时移除第二次检查时回归报「不得创建第二个 Checkout」（RED），恢复后持久化 7/7 GREEN；旧事件不再删除预留，重复点击稳定复用原 token。
Final: fixed 支付成功运营通知回归 — RED 调用0次→GREEN 1次；只有首次成功写入或失败转成功时通知，重复事件不重复发送。
Ruling: BillingOverview 只返回 subscriptions/payments/canManage，当前订阅由共享展示函数推导 — 减少重复的状态来源 — 消费者需要使用 splitBillingDisplay。
Ruling: schema 验证只使用内存 SQLite 和两个全新 gitignored 隔离 D1 目录 — 检验真实迁移和浏览器流程，保留原本地库与生产库 — 测试目录占用本地磁盘。

最终 payment E2E 4/4 通过（54.5s）：已有订阅409、账单历史、外部回跳与未知选项400、他人customerId不可指定、免费入口。9项迁移全部在全新隔离 D1 完成。测试服务器已停止。
pnpm build 通过（client 7.07s，server 3.22s）；check:client-bundle 扫描152文件无敏感字段。真实 Stripe 付款/Portal 操作未执行，不声称真实扣款验证。Creem 仅扩展边界，未接入。生产迁移和原本地库迁移都未执行。
已保留所有分支改动未提交，无合并、push 或部署。

2026-10-28 用户反馈本地 billing 错误后排查：默认 .wrangler/state 仅到0007，新查询报 no such column: provider；现有71条订阅和9条付款。内存副本直接迁移因 payments.external_id 非空约束失败。用户明确选择「备份并重建支付表（推荐）」后，完整备份至 .wrangler/backups/billing-20261028-195736/database.sqlite，integrity_check=ok；仅清除本地 subscriptions/payments 并应用0008成功。原181用户、181accounts、162sessions、3apikey及其余业务表计数不变。Webhook事件清理被自动审批拒绝，移除此项后执行；19条事件全部保留。生产未操作。原本地库未迁移的早期记录仅描述此次修复之前状态。
用户提供的 hydration diff 是翻译扩展注入 html 的 data-immersive-translate-page-theme 属性，与数据库查询失败分开处理，不添加 suppressHydrationWarning 掩盖。
实际默认开发服务器 billing E2E：首轮被注册后首页导航打断（未到断言），重跑1/1通过（18.9s，无重试触发）。验证会新增测试账号与种子订阅。原支付备份再次核验71订阅/9付款、integrity=ok。

2026-10-28 资源包502：provider在已有customer时仍传customer_creation=always。新增有/无customer的参数回归，RED已有customer仍带customer_creation→GREEN只在无customer时创建客户。pnpm check通过，unit792/792、components223/223。自动审批最初拒绝创建外部测试会话，未绕过；用户明确授权后，用修复后的真实StripePaymentProvider及本地已有真实客户创建资源包测试Checkout成功（返回sessionId和URL），随后立即expire成功，livemode=false、status=expired、payment_status=unpaid；没有提交付款。修改provider/stripe.ts与payment.test.ts，未提交。
环境提示：check:env 报开发 VITE_GA_ID 缺失；测试有 Node SQLite experimental 和 jsdom navigation/scrollTo 提示，均非失败，不修改分析环境配置。
外部文档已通过 stripe docs 读 Portal/Prices；Context7配额耗尽；Stripe SDK ^23.0.0 使用安装版本默认 API。

工具说明：Bash Python mutation曾因auto安全分类器超时未执行，已用 Edit 完成等效service-status更新；不是用户拒绝。
