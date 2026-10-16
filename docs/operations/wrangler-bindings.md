# wrangler.jsonc Binding 说明

| Binding | 类型 | 用途 | 替换方式 | 仓库内状态 |
|---------|------|------|----------|-----------|
| `DB` | D1 | 用户、订阅、付款、webhook 幂等表 | `wrangler d1 create` | 启用 |
| `CACHE` | KV | newsletter status + rate limit + cache | `wrangler kv namespace create` | 启用 |
| `BUCKET` | R2 | 用户上传文件 | `wrangler r2 bucket create` | **已注释**，需先 Dashboard 开通 R2 |
| `EMAIL` | Send Email | 事务邮件（验证、重置、联系） | Dashboard → Email Routing | **已注释**，`mail.enabled` 为 false |

后两块在 `wrangler.jsonc` 里被注释掉并保留了原值，条件具备时取消注释即可恢复。
未绑定时运行时相应降级：`env.BUCKET` 为 `undefined`，`getStorageProvider()` 抛错；
`env.EMAIL` 为 `undefined`，邮件 provider 不注册。

## 首次设置

```bash
pnpm run setup   # 交互式；创建资源 + 写入 .env
```

> **注意事项**：`setup` 脚本会把 `wrangler.jsonc` 重写为 `JSON.stringify` 的结果，
> **丢失文件内全部注释**。生产部署建议按下面的「手动设置」执行。

## 手动设置

```bash
# 1. 创建资源（R2 需先在 Dashboard 开通，否则返回 code 10042）
wrangler d1 create saas-template-db
wrangler kv namespace create saas-template-cache
wrangler r2 bucket create saas-template-uploads

# 2. 编辑 wrangler.jsonc，把 ID 填入对应字段
#    不要用 --update-config：它会抹掉该文件的注释

# 3. 应用迁移到远程库
pnpm run db:migrate:remote

# 4. 设置运行时 secret（不是写进 .env）
printf '%s' "$BETTER_AUTH_SECRET" | wrangler secret put BETTER_AUTH_SECRET

# 5. 如需 Cloudflare Email：Dashboard → Email → 添加 destination_address 与 SPF/DKIM

# 6. 复制 .env.example → .env，填入本地开发用凭据
cp .env.example .env
```

## TypeScript 集成

所有 binding 已在 `src/types/cloudflare.d.ts` 的 `interface Env` 中声明：

- `DB: D1Database`
- `CACHE: KVNamespace`
- `BUCKET: R2Bucket`
- `EMAIL: SendEmail`

业务代码通过 `getServerContext().env.<BINDING>` 访问。
