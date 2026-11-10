---
title: 收款码核销
description: 个人收款二维码的人工核验收款链路
locale: zh
order: 15
group: payment
updated: 2026-11-10
---

个人支付宝收款码也能收款：买家按页面显示的精确金额扫码付款并申报，管理员在管理台核对到账金额后确认，系统才记录付款。没有 Stripe、没有 webhook、没有托管结账页——钱直接进你的支付宝，核验结果就是权益的开关。

与 [Stripe](./payment-stripe) / [Creem](./payment-creem) 两条托管链路互斥，由 `VITE_CHECKOUT_MODE` 选择，同一时刻只有一条收新订单。

## 步骤

1. 在 `src/config/products.ts` 给要卖的商品声明 `collectionPrices`（金额事实源，单位分）：

   ```ts
   collectionPrices: {
     once: { amount: 18_000, currency: 'cny', kind: 'one_time' },
   },
   ```

2. 配置收款账户。两条路任选，可叠加（数据库覆盖按 `id` 对应同名项）：
   - 源码兜底：`src/config/website.ts` 的 `collection.accounts`；
   - 环境变量：`VITE_COLLECTION_ACCOUNTS`（JSON 数组，非法值整体忽略并回退源码配置）。

   ```dotenv
   VITE_COLLECTION_ACCOUNTS=[{"id":"alipay-1","channel":"alipay","displayName":"支付宝个人收款","currency":"cny","qrImageUrl":"/collection/qr.png"}]
   ```

   二维码地址必须是站内根路径或无凭据的 HTTPS URL；首期只支持支付宝（`channel: 'alipay'`）。
3. 填环境变量并启用模块：

   ```dotenv
   VITE_CHECKOUT_MODE=collection
   VITE_MODULES=collection,auth,mail
   ```

   `VITE_MODULES` 是白名单：写了它就要把需要的模块全列上。
4. 二维码图片放到 `public/` 对应路径（如 `public/collection/qr.png`）；用 R2 托管见 [Storage](./storage)，配置 `BUCKET` 后管理台可以上传二维码与买家凭证。
5. 部署：`pnpm run deploy`。

## 买家流程

1. 首页 `#pricing` 点「立即购买」→ 服务端创建订单。每笔订单的应付金额 = 商品标价 + 随机尾数（1–99 分），随机尾数用于人工对账，同一收款账户上的活跃订单金额互不重复。
2. 订单页显示精确金额、收款二维码、15 分钟倒计时。买家扫码按精确金额付款，点「我已支付」或上传凭证截图完成申报——申报只是意图，不代表到账。
3. 管理员在 `/dashboard/admin/orders` 核验队列里核对实际到账金额。金额与应付一致才能「普通通过」；不符时标记异常，需要退款的处理为 `requires_refund`。
4. 通过后系统结算：写付款记录、授予权益，买家端轮询（5 秒一次）看到「已到账」。

订单 15 分钟未申报自动过期并释放尾数；申报后一直占用尾数直到管理员处理，防止两个买家付同一金额无法区分。

## 管理台

`/dashboard/admin/orders` 需要 admin 角色，包含两块：

- **核验队列**：按状态筛选，从「等待人工核验」开始处理；
- **收款账户**：覆盖源码同名账户的显示名、二维码与启用状态，禁用后回退下一个配置账户。

## 验证

- `pnpm run check:env` 通过，说明模块与账户配置就位。
- 下单后订单页显示精确金额与二维码；管理台能看到这笔待核验订单。
- 核销链路的端到端验收：`pnpm exec playwright test e2e/collection.spec.ts`。
