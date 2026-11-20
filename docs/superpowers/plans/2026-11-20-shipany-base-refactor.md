# shipany 基座重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把本仓整体换成 shipany 的引擎骨架，保留核销支付、文档站模块与 Cloudflare 部署，并去掉一切上游身份痕迹。

**Architecture:** 以 shipany 的 `src/`、脚本、测试与部署配置为新基线，删除本仓旧配置层与营销站；核销支付作为 `order` 表里的一个 `payment_provider` 接入统一结算路径；文档站改用 `import.meta.glob` 加载，保留语言维度但默认关闭。

**Tech Stack:** TanStack Start（Vite + nitro）、React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui、better-auth、Drizzle ORM（SQLite / Postgres / MySQL / D1）、Paraglide JS、node:test、Docker、Cloudflare Workers。

**Spec:** `docs/superpowers/specs/2026-11-20-shipany-base-refactor-design.md`

## Global Constraints

- 英文单语：`project.inlang/settings.json` 只启用 `en`，路由无 locale 前缀，不做 `/zh` 跳转。
- 启动只需 5 个变量：`VITE_APP_URL`、`VITE_APP_NAME`、`DATABASE_PROVIDER`、`DATABASE_URL`、`AUTH_SECRET`；默认 `sqlite` / `file:data/local.db`。
- Node 22 + `pnpm@12.4.2`（沿用本仓现有 `packageManager`）；默认 Node 部署，Cloudflare 并列。
- 价格（金额、币种、积分、周期）只写在 `src/config/pricing.ts`；后台不能改价，Stripe 用 `price_data`。
- 核销支付只支持 `type === ONE_TIME` 的商品；默认关闭；不创建订阅。
- 文档站默认关闭；内容目录清空；加载器保留语言后缀与 base-locale 回退。
- 配置安全：公开接口只读白名单；后台接口只给掩码；秘密落库 AES-256-GCM；生产部署要求 `CONFIG_ENCRYPTION_KEY`。
- 不保留 Playwright / Vitest / Biome / 旧 e2e / 旧 CI；采用 node:test。
- 技能只保留 9 个：`quick-start`、`clone-website`、`new-page`、`new-module`、`new-static-page`、`design-theme`、`deploy-cloudflare`、`generate-image`、`security-scan`。
- 全仓不得出现 `shipany` 字样（`LICENSE` 与本计划/设计文档除外）；品牌、Worker 名、数据库名、测试临时目录前缀全部换成本仓的。
- 版本号 `1.0.0`，包名 `saas-template`。

## Review Focus

以下五类输入/条件最可能咬到使用者，每个都要在拥有该代码的任务里用测试钉住：

1. **公开配置泄漏**：即使有人把 `stripe_secret_key` 加进公开白名单，`/api/config/public` 也必须丢弃它。
2. **并发核验**：管理员双击「通过」，积分与订单只能结算一次，`order` 与 `manual_payment_detail` 必须一致。
3. **凭证越权**：非本人、非管理员的查询凭证请求必须拿不到字节（401/403/404），匿名同样。
4. **核销不可用**：开关关闭、无可用账户、无存储时，下单/上传必须返回明确错误，不得崩溃或写入半套数据。
5. **文档站边界**：关闭时 `/docs` 404 且导航不显示入口；打开但无内容时渲染空态而非报错。
6. **过期后到账**：`expired` 订单可异常通过；金额尾数被复用后不会重复结算。

---

### Task 1: 替换为 shipany 基座

**Files:**

- Delete: 本仓旧 `src/`、`content/`、`messages/`、`scripts/`、`e2e/`、`tests/`、`public/`、`dist/`、`src/components/` 等（除 `.git`、`LICENSE`、`docs/superpowers/specs/` 外全部清空）
- Create: shipany 全量文件（`src/`、`messages/`、`scripts/`、`tests/`、`public/`、`Dockerfile`、`.env.example` 等）
- Modify: `package.json`、`pnpm-workspace.yaml`、`README.md`

**Interfaces:**

- Consumes: 无
- Produces: 可启动的 shipany 基座；`pnpm db:push`、`pnpm rbac:init`、`pnpm dev` 可用

- [ ] **Step 1: 建分支并取参考版本**

```bash
git checkout -b refactor/shipany-base
git clone https://github.com/zyrliuwei-sys/shipany-tanstack-main.git /tmp/shipany-base
git -C /tmp/shipany-base checkout 3305a34c17ece72ca1b8fa104a901aa6890614fc
```

- [ ] **Step 2: 清空本仓旧树（保留 .git / LICENSE / 设计文档）**

```bash
git rm -r --cached . >/dev/null
find . -mindepth 1 -maxdepth 1 \
  ! -name .git ! -name LICENSE ! -name docs \
  -exec rm -rf {} +
rm -rf docs/adr docs/agents docs/operations docs/contributing.md docs/superpowers/plans
```

- [ ] **Step 3: 拷贝基座（排除生成物与本地环境）**

```bash
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.output' --exclude 'data' \
  --exclude 'src/config/db/schema.ts' --exclude 'src/paraglide' \
  --exclude 'src/routeTree.gen.ts' --exclude 'wrangler.jsonc' \
  --exclude '.env' --exclude '.env.*' \
  --exclude '.claude/scheduled_tasks.lock' \
  /tmp/shipany-base/ /Users/alvinyao/Projects/saas-template/

# rsync 的 --exclude 会连 .env.example 一起排掉，单独放回来
cp /tmp/shipany-base/.env.example /Users/alvinyao/Projects/saas-template/.env.example
```

- [ ] **Step 4: 设置本仓身份**

`package.json`：`"name": "saas-template"`、`"version": "1.0.0"`、保留/写入
`"packageManager": "pnpm@12.4.2"`、`"engines": { "node": "^22.12.0 || ^24.0.0 || >=26.0.0" }`。
`README.md` 改为本仓的 Quick Start 占位（Task 15 再完整重写）。

- [ ] **Step 5: 验证基座能启动**

```bash
pnpm install
cp .env.example .env.development
# 在 .env.development 写入：AUTH_SECRET=$(openssl rand -base64 32)
pnpm db:push
pnpm rbac:init --admin-email=admin@example.com --admin-password=change-me-now
pnpm dev
# 另开终端：
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 期望 200
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: replace repo tree with shipany engine base"
```

---

### Task 2: 去掉上游身份与厂商专属能力

**Files:**

- Delete: `src/config/seeapi.ts`、`src/core/ai/seeapi.ts`、`src/features/footer-badges/`、`src/modules/footer-badges/`、`src/components/footer-badge-list.tsx`、`src/routes/admin/footer-badges.tsx`、`src/routes/api/admin/footer-badges.ts`、`src/server/admin/handlers/footer-badges.ts`、`src/components/sandbox-preview-bridge.tsx`、`src/routes/api/admin/agent/skill.ts`、`src/lib/english-only.ts`、`tools/`、`UPGRADING.md`、`.claude/skills/sync-upstream/`、`.claude/skills/shipany-admin/`、`.claude/skills/launch-audit/`、`tests/seeapi.test.ts`、`tests/seeapi-installer.test.mjs`、`tests/indexnow-installer.test.mjs`、`tests/footer-badges.test.ts`、`tests/product-copy.test.ts`
- Modify: `src/modules/config/settings.ts`、`src/modules/config/settings-test-specs.ts`、`src/modules/config/service.ts`、`src/routes/api/config/public.ts`、`src/server/admin/handlers.ts`、`src/lib/admin-operations.ts`、`src/routes/admin/route.tsx`、`src/routes/__root.tsx`、`src/routes/index.tsx`、`src/routes/pricing.tsx`、`src/routes/guest-post.tsx`、`src/routes/blog/index.tsx`、`src/routes/blog/$slug.tsx`、`src/config/index.ts`、`src/server.ts`、`src/lib/redirect.ts`、`scripts/admin-mcp.ts`、`tests/english-only.test.ts`、`tests/admin-agent.test.ts`、`.dockerignore`、`package.json`

**Interfaces:**

- Consumes: Task 1 基座
- Produces: 不含 SeeAPI / footer-badges / sandbox bridge / 上游同步 / 中文版跳转的代码树；`admin-client.mjs` 迁到 `scripts/admin-client.mjs`，其导入方为 `scripts/admin-mcp.ts` 与 `tests/admin-agent.test.ts`

- [ ] **Step 1: 删文件并清理引用**

删除上面列出的文件/目录。删除时同步：

- `settings.ts` 的 `seeApiSettingGroup` / `seeApiSettings` 引入与展开；
- `settings-test-specs.ts` 的 `seeApiTestSpec`；
- `config/service.ts` 的 `normalizeSeeApiConfigs`、`seeapi_base_url` 的 `ENDPOINT_SECRETS` 项、`MODULE_MANAGED_CONFIG_KEYS` 里的 `footer_badges`；
- `public.ts` 的 `getStoredFooterBadges`、`footer_badges` 白名单与响应字段；
- `handlers.ts` 的 `footer_badges*` 注册与 import；
- `admin-operations.ts` 的 footer-badges 操作与 `indexnow` 安装器相关项；
- `admin/route.tsx` 的 footer-badges 导航；
- `blocks/footer.tsx`、`__root.tsx` 的 footer-badge / sandbox 引用；
- `package.json` 的 `test:seeapi`，`test:indexnow` 只保留 `tests/indexnow.test.ts`。

- [ ] **Step 2: 迁移 admin client 并改两处引用**

`cp .claude/skills/shipany-admin/scripts/admin-client.mjs scripts/admin-client.mjs`，把
`scripts/admin-mcp.ts` 的 import 改到 `'./admin-client.mjs'`，把
`tests/admin-agent.test.ts` 中三处 `'../.claude/skills/shipany-admin/scripts/admin-client.mjs'`
改为 `'../scripts/admin-client.mjs'`。删除 `src/routes/api/admin/agent/skill.ts`，
并去掉 `.dockerignore` 中为它开的例外。

- [ ] **Step 3: 去掉中文版跳转，保留语言运行时**

设计决定：不做 `/zh` 跳转、不做 308。删除 `src/lib/english-only.ts`，并同步删掉
`src/server.ts` 的 `redirectChineseEdition` 调用与 `src/lib/redirect.ts` 的
`englishPathname` 替换。把 `tests/english-only.test.ts` 重写为只测语言策略：

```ts
test('only the base locale is enabled and messages resolve', async () => {
  assert.deepEqual([...locales], [baseLocale]);
  assert.equal(getLocale(), baseLocale);
  assert.equal(typeof m['app.name'], 'function');
});

test('localizedPath falls back to the base locale for unknown locales', () => {
  assert.equal(localizedPath('/pricing', 'unknown'), '/pricing');
});
```

- [ ] **Step 4: 中性化占位与测试前缀**

`src/config/index.ts` 的 `AUTH_SECRET_PLACEHOLDER` 改为
`'development-secret-change-in-production'`；`tests/*.ts` 中所有
`mkdtemp(join(tmpdir(), 'shipany-...'))` 改为 `'saas-template-...'`；
注释中的 `shipany` 字样一并改掉。

- [ ] **Step 5: 验证代码层无上游字样**

```bash
rg -i shipany src scripts tests messages package.json Dockerfile .dockerignore AGENTS.md README.md || true
# 期望：无输出
pnpm typecheck && pnpm test && pnpm build
# 此时 pnpm test 尚不存在则用：node --import tsx --test tests/*.test.ts
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor: remove upstream-only integrations and identity"
```

---

### Task 3: 按 shadcn 规范统一区块命名

**Files:**

- Rename: `src/blocks/{hero,features,pricing,faq,cta,blog}.tsx` → `*-section.tsx`
- Delete: `src/blocks/header.tsx`、`src/blocks/footer.tsx`
- Modify: `src/components/site-header.tsx`、`src/components/site-footer.tsx`、`src/routes/index.tsx`、`src/routes/pricing.tsx`、`src/routes/guest-post.tsx`、`src/routes/blog/index.tsx`、`src/routes/blog/$slug.tsx`、`src/routes/__root.tsx`（只保留 CookieConsent）、`src/routes/settings/route.tsx`、`src/routes/admin/operations.tsx`

**Interfaces:**

- Consumes: Task 2 代码树
- Produces: `HeroSection`、`FeaturesSection`、`PricingSection`、`FaqSection`、`CtaSection`、`BlogSection`；`SiteHeader`、`SiteFooter` 为站点外壳唯一入口

- [ ] **Step 1: 重命名区块并改导出**

`hero.tsx`→`hero-section.tsx`（`HeroSection`）、`features.tsx`→`features-section.tsx`
（`FeaturesSection`）、`pricing.tsx`→`pricing-section.tsx`（`PricingSection`）、
`faq.tsx`→`faq-section.tsx`（`FaqSection`）、`cta.tsx`→`cta-section.tsx`（`CtaSection`）、
`blog.tsx`→`blog-section.tsx`（`BlogSection`）。

- [ ] **Step 2: 合并 header/footer 包装层**

把 `blocks/header.tsx` 的 nav 配置并入 `components/site-header.tsx`，组件默认渲染营销
导航；把 `blocks/footer.tsx` 的栏目、社交与 cookie 设置并入 `components/site-footer.tsx`。
删除 `blocks/header.tsx` 与 `blocks/footer.tsx`。各营销路由改为直接用
`SiteHeader` / `SiteFooter`，不再传 `navLinks` / `columns`。

- [ ] **Step 3: 更新所有 import 与 JSX**

```bash
rg -l "@/blocks/(hero|features|pricing|faq|cta|blog|header|footer)" src/routes src/components
```

逐一把 import 与组件名改成新名字。

- [ ] **Step 4: 验证**

```bash
pnpm build
rg "@/blocks/(hero|features|pricing|faq|cta|blog|header|footer)'" src || true
# 期望：无输出
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: align section components with shadcn naming"
```

---

### Task 4: 配置安全基线

**Files:**

- Create: `src/modules/config/public-keys.ts`、`tests/config-security.test.ts`、`scripts/check-deploy-env.mjs`
- Modify: `src/routes/api/config/public.ts`、`.env.example`、`package.json`、`AGENTS.md`

**Interfaces:**

- Consumes: `filterPublicConfigs`、`isSecretConfigKey`、`getAdminConfigs`、`saveConfigs`（Task 1 基座）
- Produces: `PUBLIC_CONFIG_KEYS: readonly string[]`；`pnpm check:deploy-env` 在缺 `AUTH_SECRET` 或 `CONFIG_ENCRYPTION_KEY` 时退出 1

- [ ] **Step 1: 写失败测试**

`tests/config-security.test.ts` 按现有测试模式建临时 SQLite 并 `drizzle-kit push`，然后断言：

```ts
test('public allowlist contains no secret-like key', () => {
  for (const key of PUBLIC_CONFIG_KEYS) {
    assert.equal(isSecretConfigKey(key), false, key);
  }
});

test('public filter drops secret and protected keys even when allowlisted', () => {
  const out = filterPublicConfigs(
    { app_name: 'A', stripe_secret_key: 'not-a-real-secret', auth_secret: 'x' },
    ['app_name', 'stripe_secret_key', 'auth_secret']
  );
  assert.deepEqual(out, { app_name: 'A' });
});

test('admin view masks secrets and removes protected keys', async () => {
  await saveConfigs({
    stripe_secret_key: 'not-a-real-secret',
    auth_secret: 'nope',
  });
  const admin = await getAdminConfigs();
  assert.match(admin.stripe_secret_key, /^••••••••/);
  assert.equal('auth_secret' in admin, false);
});

test('saving with a masked value keeps the stored secret unchanged', async () => {
  await saveConfigs({ stripe_secret_key: 'not-a-real-secret' });
  await saveConfigs({ stripe_secret_key: '••••••••cret' });
  const stored = await getAllConfigs();
  assert.equal(stored.stripe_secret_key, 'not-a-real-secret');
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm paraglide:compile && node --import tsx --test tests/config-security.test.ts`
Expected: FAIL（`public-keys.ts` 不存在）

- [ ] **Step 3: 抽出白名单并接线**

把 `src/routes/api/config/public.ts` 里的 `publicKeys` 数组移到
`src/modules/config/public-keys.ts`，导出 `PUBLIC_CONFIG_KEYS`；路由改为 import 它。
新增 `scripts/check-deploy-env.mjs`：读取当前环境，`AUTH_SECRET` 为空或等于占位、
`CONFIG_ENCRYPTION_KEY` 为空时打印原因并 `process.exit(1)`。`package.json` 加
`"check:deploy-env": "node scripts/check-deploy-env.mjs"`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm paraglide:compile && node --import tsx --test tests/config-security.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: harden admin config against public leakage"
```

---

### Task 5: 构建与测试工具链

**Files:**

- Modify: `package.json`、`.github/workflows/`（新增 `ci.yaml`，保留 `docker-build.yaml`）
- Delete: 任何旧工作流残留；`tests/*.mjs`（Task 2 已删）

**Interfaces:**

- Consumes: Task 1–4
- Produces: `pnpm paraglide:compile`、`pnpm typecheck`、`pnpm test`（聚合全部 node:test）

- [ ] **Step 1: 加脚本**

`package.json`：

```json
"paraglide:compile": "paraglide-js compile --project ./project.inlang --outdir ./src/paraglide",
"typecheck": "tsc --noEmit",
"pretypecheck": "pnpm paraglide:compile",
"pretest": "pnpm paraglide:compile",
"test": "node --import tsx --test tests/*.test.ts"
```

`tests/*.test.ts` 不引号，交给 shell 展开；Node 22 的 `--test` 贪吃位置参数，
加引号会把 glob 原样传进去。

- [ ] **Step 2: 验证干净生成物**

```bash
rm -rf src/paraglide .output
pnpm typecheck
pnpm test
```

Expected: 两条命令都通过；`src/paraglide/` 被重新生成。

- [ ] **Step 3: 写 CI 工作流**

`.github/workflows/ci.yaml`：

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: pnpm/action-setup@v4
        with: { version: 12.4.2 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm paraglide:compile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "ci: add typecheck, node:test and build workflow"
```

---

### Task 6: 核销支付的数据库表

**Files:**

- Modify: `src/config/db/schema.sqlite.ts`、`src/config/db/schema.postgres.ts`、`src/config/db/schema.mysql.ts`
- Test: `tests/manual-payment-schema.test.ts`

**Interfaces:**

- Consumes: 现有 `order` / `user` 表
- Produces: `manualPaymentAccount`、`manualPaymentDetail` 导出；三方言结构一致

- [ ] **Step 1: 写失败测试**

`tests/manual-payment-schema.test.ts` 建临时 SQLite 并 push schema，然后：

```ts
test('active amounts are unique per account, expired rows are not', async () => {
  await insertDetail({
    status: 'pending_payment',
    accountId: 'a',
    payableAmount: 69901,
  });
  await assert.rejects(
    insertDetail({
      status: 'pending_verification',
      accountId: 'a',
      payableAmount: 69901,
    })
  );
  await insertDetail({
    status: 'expired',
    accountId: 'a',
    payableAmount: 69901,
  });
});

test('a user has at most one settling order', async () => {
  await insertDetail({ userId: 'u1', status: 'settling' });
  await assert.rejects(insertDetail({ userId: 'u1', status: 'settling' }));
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-schema.test.ts`
Expected: FAIL（表不存在）

- [ ] **Step 3: 在 SQLite/Postgres 模板加表与部分唯一索引**

表名 `manual_payment_account`、`manual_payment_detail`（单数，与 `order` 一致）。
`manual_payment_detail` 列见设计 §8.2；索引：

```ts
index('manual_payment_detail_status_expires_idx').on(t.status, t.expiresAt),
index('manual_payment_detail_user_status_idx').on(t.userId, t.status),
uniqueIndex('manual_payment_detail_active_amount_unique')
  .on(t.accountId, t.payableAmount)
  .where(sql`status in ('pending_payment','pending_verification','settling')`),
uniqueIndex('manual_payment_detail_settling_user_unique')
  .on(t.userId)
  .where(sql`status = 'settling'`),
```

- [ ] **Step 4: MySQL 用生成列表达等价约束**

`manual_payment_detail` 增加：

```ts
activeAmountKey: text('active_amount_key').generatedAlwaysAs(
  sql`case when \`status\` in ('pending_payment','pending_verification','settling') then concat(\`account_id\`, ':', \`payable_amount\`) else null end`
),
settlingUserKey: text('settling_user_key').generatedAlwaysAs(
  sql`case when \`status\` = 'settling' then \`user_id\` else null end`
),
```

并对这两列建 `uniqueIndex`；schema.mysql.ts 引入 `uniqueIndex`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm db:setup && node --import tsx --test tests/manual-payment-schema.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add manual payment tables across dialects"
```

---

### Task 7: 核销订单创建与收款账户

**Files:**

- Create: `src/modules/manual-payments/types.ts`、`accounts.ts`、`orders.ts`、`service.ts`
- Test: `tests/manual-payment-orders.test.ts`

**Interfaces:**

- Consumes: `order`、`manualPaymentDetail`、`manualPaymentAccount`、`pricingCatalog`、`getAllConfigs()`
- Produces:
  - `MANUAL_PAYMENT_PROVIDER = 'manual_payments'`
  - `createManualOrder(input: { userId: string; userEmail?: string; product: PricingProduct; accountId?: string; now?: Date }): Promise<{ orderNo: string; orderId: string; payableAmount: number; currency: 'cny'; qrImageUrl: string | null; expiresAt: Date }>`
  - `expireStaleOrders(accountId: string, now?: Date): Promise<number>`
  - `listEnabledAccounts()`、`createAccount()`、`updateAccount()`、`deleteAccount()`

- [ ] **Step 1: 写失败测试**

`tests/manual-payment-orders.test.ts` 覆盖：

- 开关未开 → `MODULE_DISABLED`；
- 订阅商品 → `INVALID_OFFER`；
- 无启用账户 → `NO_MANUAL_PAYMENT_ACCOUNT`；
- 连续 3 单金额尾数互不相同，且等于 `cnyPriceInCents + fingerprint`；
- 同一账户填满 99 个活跃金额后第 100 单 → `AMOUNT_POOL_EXHAUSTED`；
- `expiresAt` 为 `now + 15min`。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-orders.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现类型与账户 CRUD**

`types.ts` 定义 `MANUAL_PAYMENT_PROVIDER`、状态联合、错误码联合、
`ManualPaymentError`、尾数上下限 1/99、TTL 900 秒。`accounts.ts` 实现账户增删改查；
二维码 URL 解析规则：有 `qrImageKey` 时用 `getStorage()?.getPublicUrl`，否则用
`qrImageUrl`。

- [ ] **Step 4: 实现下单**

`orders.ts` 的 `createManualOrder`：

1. 读 `getAllConfigs()`，要求 `manual_payments_enabled === 'true'`；
2. 校验 `product.type === ONE_TIME` 且 `cnyPriceInCents` 存在；
3. 选账户（指定或第一个启用项）；
4. 用 `getUniSeq('ORD')` 生成 `orderNo`（与 `src/modules/payment/service.ts` 同源），
   在同一事务/批处理里分配尾数并写 `order` + `manual_payment_detail`；`order` 用现有列
   （`id` / `orderNo` / `userId` / `productId` / `type` / `status` / `amount` / `currency` /
   `paymentProvider`），`status` 取 `pending`，`paymentProvider` 取
   `MANUAL_PAYMENT_PROVIDER`，`amount` 写含尾数的 `payableAmount`；
5. 尾数分配用 `(accountId, payableAmount)` 活跃唯一索引兜底，冲突则换下一个尾数，
   99 个都冲突时抛 `AMOUNT_POOL_EXHAUSTED`。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --import tsx --test tests/manual-payment-orders.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add manual payment order creation"
```

---

### Task 8: 私有凭证存储与上传/下载

**Files:**

- Modify: `src/core/storage/index.ts`、`src/core/storage/r2.ts`、`src/core/storage/s3.ts`
- Create: `src/core/storage/local-private.ts`、`src/modules/manual-payments/receipts.ts`
- Create: `src/routes/api/payment/manual/receipt.ts`（POST 上传）、`src/routes/api/payment/manual/receipt/$orderNo.ts`（GET 下载）
- Test: `tests/manual-payment-receipts.test.ts`

**Interfaces:**

- Consumes: Task 7 订单与 detail
- Produces:
  - `StorageProvider.getObject?: (options: { key: string; bucket?: string }) => Promise<{ body: Uint8Array; contentType: string } | null>`
  - `submitReceipt({ orderNo, userId, file, payerNote?, now? }): Promise<{ receiptKey: string }>`
  - `openReceipt({ orderNo, userId, isAdmin }): Promise<{ body: Uint8Array; contentType: string } | null>`

路由文件沿用现有 API 约定（同 `src/routes/api/admin/orders.ts` +
`src/routes/api/admin/orders/refund.ts` 的写法）：父路径一个文件，子路径放同名目录。

- [ ] **Step 1: 写失败测试**

覆盖：本人上传成功；非本人/匿名下载 401/403；管理员可下载；超过 10MB 或
`image/svg+xml` 被拒；订单过期后上传被拒。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-receipts.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现私有读取与本地回退**

`StorageProvider` 加可选 `getObject`；R2/S3 用已有的签名机制发 GET；无存储配置时
`local-private.ts` 读写 `data/uploads/manual-receipts/...`，**不写** `public/`。

- [ ] **Step 4: 实现凭证路由**

上传：登录 + 限流 + 类型/大小校验（图片类型白名单，拒绝 SVG），写 detail 的
`receiptKey` / `payerNote` / `submittedAt`，状态转 `pending_verification`。下载：
登录，本人或管理员，按订单号找 detail，返回流并设置 `Content-Type` 与
`Cache-Control: private, no-store`；不满足条件一律 404（不泄漏订单是否存在）。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --import tsx --test tests/manual-payment-receipts.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: store manual payment receipts privately"
```

---

### Task 9: 核验、结算与退款

**Files:**

- Create: `src/modules/manual-payments/review.ts`
- Modify: `src/modules/payment/service.ts`（`settleCheckoutOrder` 增加 `extraSteps`；`refundOrder` 增加 manual 分支）
- Modify: `src/modules/manual-payments/service.ts`（导出 review/refund）
- Test: `tests/manual-payment-settlement.test.ts`

**Interfaces:**

- Consumes: `settleCheckoutOrder`、`refundOrder`、Task 6–8
- Produces:
  - `reviewManualOrder({ orderNo, action: 'approve'|'approve_exception'|'reject', reviewerId, observedAmount?, externalReference?, reviewNote? }): Promise<void>`
  - `refundManualOrder({ orderNo, operatorId, reviewNote? }): Promise<void>`
  - `settleCheckoutOrder(existingOrder, session, provider, extraSteps?: (q: any) => AtomicStep[]): Promise<void>`

- [ ] **Step 1: 写失败测试**

覆盖：

- `approve` → order `paid`、detail `settled`、积分只发一次；
- 并发两次 `approve` → 只有一笔 grant；
- 金额不符 → `AMOUNT_MISMATCH`，不结算；
- `expired` → `approve_exception` 成功；
- 退款 → order `refunded`、积分回滚一次、detail `canceled`。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-settlement.test.ts`
Expected: FAIL

- [ ] **Step 3: 扩展结算签名并在同一原子块写 detail**

`settleCheckoutOrder` 增加第 4 个参数 `extraSteps`，在 `atomic((q) => [...])` 的语句数组
末尾展开 `...(extraSteps ? extraSteps(q) : [])`。核销传入：

```ts
(q) => [
  q
    .update(manualPaymentDetail)
    .set({
      status: 'settled',
      observedAmount,
      externalReference,
      reviewNote,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      settledAt: new Date(),
    })
    .where(eq(manualPaymentDetail.orderId, orderId)),
];
```

- [ ] **Step 4: 实现 review/refund**

`approve` 构造合成 session：
`{ paymentStatus: PaymentStatus.SUCCESS, paymentInfo: { transactionId, amount: observedAmount, currency: 'cny', paidAt: new Date() }, paymentResult: { provider: MANUAL_PAYMENT_PROVIDER, transactionId } }`。
`refundOrder` 在 provider 为 `manual_payments` 时跳过渠道调用，直接走 DB 退款收尾
（状态、积分回滚），不触碰订阅。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --import tsx --test tests/manual-payment-settlement.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: settle and refund manual payments atomically"
```

---

### Task 10: 核销后台 API

**Files:**

- Create: `src/server/admin/handlers/manual-accounts.ts`、`manual-orders.ts`、`manual-review.ts`
- Create: `src/routes/api/admin/manual-payments.ts`、`src/routes/api/admin/manual-payments/accounts.ts`、`src/routes/api/admin/manual-payments/orders.ts`、`src/routes/api/admin/manual-payments/orders/review.ts`、`src/routes/api/admin/manual-payments/orders/refund.ts`
- Modify: `src/server/admin/handlers.ts`、`src/lib/admin-operations.ts`

**Interfaces:**

- Consumes: Task 7–9 服务
- Produces: 后台操作 `manual_accounts_list|create|update|delete`、`manual_orders_list`、`manual_order_review`、`manual_order_refund`；权限 `payments.read` / `payments.write`

- [ ] **Step 1: 写失败测试（handler 层）**

`tests/manual-payment-admin.test.ts` 直接调用 handler：无权限 actor 返回 403；
有权限 actor 能列出账户与订单；review 调用后订单变 paid。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-admin.test.ts`
Expected: FAIL

- [ ] **Step 3: 注册操作与路由**

按现有 `orders` / `orders_refund` 的写法在 `admin-operations.ts` 增加 operation
（method、path、permission、schema），在 `handlers.ts` 注册；路由文件用
`runAdminRoute('<operation>', context)`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --import tsx --test tests/manual-payment-admin.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: expose manual payment admin API"
```

---

### Task 11: 核销前台与后台界面

**Files:**

- Create: `src/routes/admin/manual-payments.tsx`、`src/routes/settings/payments.$orderNo.tsx`
- Modify: `src/routes/settings/payments.tsx`、`src/components/payment-provider-modal.tsx`、`src/routes/admin/route.tsx`、`messages/en.json`

**Interfaces:**

- Consumes: Task 10 API、现有 `DataTable` / `Card` / `Button`
- Produces: `/admin/manual-payments`（账户 + 待核验）、`/settings/payments/<orderNo>`（二维码 + 上传凭证）

子路由用扁平点号 `payments.$orderNo.tsx`：`settings/payments.tsx` 已占住父路径，
不能再建同名目录 `settings/payments/`。

- [ ] **Step 1: 加后台页**

`/admin/manual-payments` 两个区块：账户 CRUD（名称、渠道、启停、二维码 URL/上传）；
订单表（订单号、用户、金额、状态、提交时间），行内「通过 / 异常通过 / 驳回 / 退款」。
复用 `DataTable` 与 `ConfirmDialog`。

- [ ] **Step 2: 加用户支付页**

`/settings/payments/$orderNo` 用 loader 取订单；展示收款码、应付金额（含尾数）、
剩余时间、付款备注要求与上传表单；提交后轮询/刷新状态；过期时给重新下单入口。

- [ ] **Step 3: 接入定价与订单列表**

支付方式弹窗在 `manual_payments_enabled === 'true'` 时显示「Manual / 扫码转账」；
`/settings/payments` 列表加上核销订单的状态标签与详情链接。

- [ ] **Step 4: 加消息键并对称**

在 `messages/en.json` 增加 `manual_payment.*` 与 `admin.manual_payments.*` 键；
本项目单语言，无需其它 locale 文件。

- [ ] **Step 5: 验证**

```bash
pnpm build
rg "manual_payments" src/routes src/components | head
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add manual payment screens"
```

---

### Task 12: 核销默认值与演示价格

**Files:**

- Modify: `src/config/pricing.ts`、`src/modules/config/settings.ts`、`src/modules/config/public-keys.ts`、`.env.example`
- Test: `tests/manual-payment-config.test.ts`

**Interfaces:**

- Consumes: Task 4 白名单、Task 7 下单
- Produces: `manual_payments_enabled`（默认 false）、`manual_payments_sla_hours`（默认 24）；demo 一次性商品带 `cnyPriceInCents`

- [ ] **Step 1: 写失败测试**

断言：公开配置包含 `manual_payments_enabled` 与 `manual_payments_sla_hours`，且默认
`false`/`24`；`starter_lifetime` 等一次性 demo 商品有 `cnyPriceInCents`；开关关闭时
下单抛 `MODULE_DISABLED`。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/manual-payment-config.test.ts`
Expected: FAIL

- [ ] **Step 3: 加设置项与演示 CNY 价格**

`settings.ts` 在 payment tab 增加 `manual_payments` 分组与两个字段；`public-keys.ts`
加入这两个键（均为非秘密）；`pricing.ts` 给 `starter_lifetime` / `pro_lifetime` /
`enterprise_lifetime` 加 `cnyPriceInCents`（69900 / 349900 / 1399900）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --import tsx --test tests/manual-payment-config.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: add manual payment settings and demo CNY prices"
```

---

### Task 13: 文档站模块

**Files:**

- Create: `src/modules/docs/service.ts`、`paths.ts`、`src/components/docs/*`（从旧仓移植后改写）、`src/components/mdx/Mdx.tsx`、`src/styles/mdx.css`、`src/routes/docs/index.tsx`、`src/routes/docs/$slug.tsx`
- Create: `content/docs/.gitkeep`
- Modify: `src/modules/config/settings.ts`、`src/modules/config/public-keys.ts`、`src/components/site-header.tsx`、`src/components/site-footer.tsx`
- Test: `tests/docs-loader.test.ts`

**Interfaces:**

- Consumes: Paraglide `locales`/`baseLocale`/`getLocale`；`docs_enabled`
- Produces:
  - `parseFrontmatter(raw: string): { data: Record<string, string>; body: string }`
  - `resolveContentLocale(fileName: string, locales: readonly string[]): string`
  - `contentSlug(fileName: string, locales: readonly string[]): string`
  - `docsForLocale(locale: string): DocEntry[]`（缺失译本回退 baseLocale）

- [ ] **Step 1: 写失败测试**

覆盖：`guide.md` → `en`、`guide.zh.md` → `zh`、`guide.v2.md` slug 保留 `guide.v2`；
frontmatter 解析标题/描述/order/group/updated；`docsForLocale('zh')` 对缺失译本回退
`en`；缺少 `title` 的文件报错。

- [ ] **Step 2: 运行并确认失败**

Run: `node --import tsx --test tests/docs-loader.test.ts`
Expected: FAIL

- [ ] **Step 3: 写加载器与纯函数**

`service.ts` 用
`import.meta.glob('/content/docs/**/*.md', { eager: true, query: '?raw', import: 'default' })`
建文件表；用 `parseFrontmatter` 解析；用 `resolveContentLocale`/`contentSlug` 投影成
`DocEntry`。保留 `extractHeadings`、`searchDocs`、`docNeighbors`、`splitNextSteps`。
`service.ts` 被 node:test 直接 import 时 `import.meta.glob` 不存在，因此把纯函数放在
`paths.ts`，测试只 import 它。

- [ ] **Step 4: 移植组件与路由**

移植 `DocsLayout` / `DocsSidebar` / `DocsSearch` / `DocsToc` / `DocArticle` / `DocPager` /
`DocNextSteps` / `doc-icons` 与 `Mdx`，把 Tabler 图标换成 lucide，把
`@/locale/paraglide` 换成 `@/paraglide`。路由：

```ts
export const Route = createFileRoute('/docs/')({ ... })
export const Route = createFileRoute('/docs/$slug')({ ... })
```

`beforeLoad` 先读 `docs_enabled`，关闭时 `throw notFound()`。站点导航/页脚据
`docs_enabled` 决定是否显示「Docs」。

- [ ] **Step 5: 运行测试与构建**

```bash
node --import tsx --test tests/docs-loader.test.ts
pnpm build
```

Expected: PASS 且构建成功

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add locale-aware docs module"
```

---

### Task 14: 部署路径

**Files:**

- Modify: `wrangler.example.jsonc`、`package.json`、`Dockerfile`、`.dockerignore`
- Create: `scripts/check-deploy-env.mjs`（Task 4 已建，若未建则在此补齐）
- Modify/rewrite: `.claude/skills/deploy-cloudflare/SKILL.md`

**Interfaces:**

- Consumes: Task 1–13
- Produces: `pnpm build` / `pnpm start`、`pnpm cf:build` / `pnpm cf:deploy`、Docker 镜像；部署前强制校验

- [ ] **Step 1: 改资源名**

`wrangler.example.jsonc`：`name` → `saas-template`、`database_name` →
`saas-template-db`；注释里的示例域名换成本仓占位。`Dockerfile` 的 pnpm 版本改为
`12.4.2`（与 `packageManager` 一致），构建参数与 `db-setup` 保持。

- [ ] **Step 2: 接上部署前校验**

`cf:deploy` 改为先跑 `pnpm check:deploy-env`；`package.json` 增加
`"precf:deploy": "pnpm check:deploy-env"`。README/AGENTS 说明 Node 部署也要先跑该命令。

- [ ] **Step 3: 重写部署技能**

把 `.claude/skills/deploy-cloudflare/SKILL.md` 的品牌、Worker 名、D1 名、示例 URL
换成本仓的；删掉上游仓库/账号引用；保留 D1 与 Hyperdrive 两条路径。

- [ ] **Step 4: 验证**

```bash
cp wrangler.example.jsonc wrangler.jsonc
# 填入真实 database_id 后：
pnpm cf:build
pnpm build
```

Expected: 两条构建都通过。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: align Node and Cloudflare deploy paths"
```

---

### Task 15: 工程文档与技能重写

**Files:**

- Modify: `AGENTS.md`、`README.md`、`CLAUDE.md`、`docs/admin-agent.md`
- Modify: `.claude/skills/{quick-start,clone-website,new-page,new-module,new-static-page,design-theme,deploy-cloudflare,generate-image,security-scan}/**`
- Delete: `.claude/skills/{sync-upstream,shipany-admin,launch-audit}/`（Task 2 已删）

**Interfaces:**

- Consumes: Task 1–14 的最终结构与命令
- Produces: 无上游字样、与本仓结构一致的工程文档

- [ ] **Step 1: 重写 AGENTS.md**

按 shipany 的章节组织（语言政策、技术栈、命令、首次启动、schema 变更、模块/页面规约），
内容全部换成本仓：英文单语政策（文档站保留语言维度）、5 个启动变量、核销支付只做
一次性、文档站默认关、配置安全基线、`pnpm test` 与 CI。

- [ ] **Step 2: 重写 README / CLAUDE / admin-agent**

README：定位、Quick Start、Node 默认 + CF 并列、核销启用步骤、文档站开关、配置加密
边界说明。`CLAUDE.md` 只保留 `@AGENTS.md`。`docs/admin-agent.md` 用中性项目名重写。

- [ ] **Step 3: 清理技能正文**

9 个技能里搜 `shipany`、上游路径、上游账号、`shipany-admin` 客户端；换成
`saas-template` 与本仓路径。`deploy-cloudflare` 与 Task 14 的版本保持一致。

- [ ] **Step 4: 全仓去字样验证**

```bash
rg -i shipany --glob '!LICENSE' --glob '!docs/superpowers/**' . || true
# 期望：无输出
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "docs: rewrite project docs and skills for this template"
```

---

### Task 16: 终验

**Files:**

- Create: 无（只验证；如需修，回到对应任务）

**Interfaces:**

- Consumes: 全部任务
- Produces: 干净 clone 可启动、测试全绿、构建通过、部署路径可用

- [ ] **Step 1: 干净 clone 启动**

```bash
rm -rf /tmp/saas-template-verify
git clone /Users/alvinyao/Projects/saas-template /tmp/saas-template-verify
cd /tmp/saas-template-verify
pnpm install
cp .env.example .env.development
# 写 AUTH_SECRET
pnpm db:push
pnpm rbac:init --admin-email=admin@example.com --admin-password=change-me-now
pnpm dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 200
```

- [ ] **Step 2: 类型、测试、构建**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 全部通过。

- [ ] **Step 3: 关键行为冒烟**

- 登录 `/admin`，改 `app_name`，刷新与重启后仍在；
- `docs_enabled` 关闭时 `/docs` 404，打开后空态；
- 打开核销、建一个账户，一次性商品能进支付页；上传凭证后后台能核验并结算；
- 非本人访问凭证 URL 拿不到内容；
- 公开配置响应里没有 secret。

- [ ] **Step 4: 部署与去字样**

```bash
pnpm cf:build        # 有 wrangler.jsonc 时
rg -i shipany --glob '!LICENSE' --glob '!docs/superpowers/**' . || true
```

Expected: `cf:build` 通过；`rg` 无输出。

- [ ] **Step 5: 提交收尾**

```bash
git add -A
git commit -m "chore: final verification fixes"
```

---

## 自检

- **Spec 覆盖**：基座替换（T1）、去身份（T2/T15）、命名（T3）、配置安全（T4）、工具链（T5）、核销表（T6）、下单（T7）、凭证（T8）、结算退款（T9）、后台 API（T10）、界面（T11）、默认值与价格（T12）、文档站（T13）、部署（T14）、终验（T16）。
- **类型一致性**：`manual_payment_detail` 单数；`MANUAL_PAYMENT_PROVIDER` 全链路同名；`settleCheckoutOrder` 第 4 参数统一叫 `extraSteps`。
- **Review Focus 对应**：1→T4；2/6→T9；3→T8；4→T7/T8；5→T13。
- **比例**：本计划只写接口、文件、测试断言与命令，正文实现留给执行者。
