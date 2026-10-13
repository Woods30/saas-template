# wrangler.jsonc Binding 说明

| Binding | 类型 | 用途 | 替换方式 |
|---------|------|------|----------|
| `DB` | D1 | 用户、订阅、付款、webhook 幂等表 | `pnpm run setup` 或 `wrangler d1 create` |
| `BUCKET` | R2 | 用户上传文件 | `pnpm run setup` 或 `wrangler r2 bucket create` |
| `CACHE` | KV | newsletter status + rate limit + cache | `pnpm run setup` 或 `wrangler kv namespace create` |
| `EMAIL` | Send Email | 事务邮件（验证、重置、联系） | `wrangler send-email` 在 Cloudflare Dashboard 配置 |

## 首次设置

```bash
pnpm run setup   # 交互式；自动创建资源 + 写入 .env + 替换占位符
```

## 手动设置

```bash
# 1. 创建资源
wrangler d1 create saas-template-db
wrangler r2 bucket create saas-template-uploads
wrangler kv namespace create saas-template-cache

# 2. 编辑 wrangler.jsonc，把 ID 填入对应字段

# 3. Cloudflare Dashboard → Email → 添加 destination_address 与 SPF/DKIM

# 4. 复制 .env.example → .env，填入 secrets
cp .env.example .env
```

## TypeScript 集成

所有 binding 已在 `src/types/cloudflare.d.ts` 的 `interface Env` 中声明：

- `DB: D1Database`
- `CACHE: KVNamespace`
- `BUCKET: R2Bucket`
- `EMAIL: SendEmail`

业务代码通过 `getServerContext().env.<BINDING>` 访问。
