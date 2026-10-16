---
title: API 密钥
description: 用户自助创建与撤销 API 密钥
locale: zh
order: 18
group: features
updated: 2026-10-16
---

API 密钥基于 better-auth 的 `@better-auth/api-key` 插件。用户在个人中心自助创建与撤销，
业务代码用同一插件在服务端校验。

## 数据模型

密钥存在 `apikey` 表（`src/db/schema.ts`）。表结构以插件内置的 `apiKeySchema` 为准：
21 个声明字段 + 自动 `id`，索引在 `config_id` / `reference_id` / `key`。

**明文从不入库。** 插件对完整密钥做 SHA-256，base64url 编码（去 padding）后写入
`key` 列；列表接口只返回 `start`（前几位），因此已签发的密钥无法再次读出。

> `key` 列**不加**唯一约束——它是哈希，碰撞概率可忽略，且插件本身只建普通索引。

## 设置页

`/dashboard/api-keys`（`src/routes/{-$locale}/_layout/dashboard/api-keys.tsx`）。
入口在个人中心侧边栏，受功能开关 `features.enableApiKeys` 控制。

- **创建**：输入名称 → `authClient.apiKey.create({ name })`。返回体含**明文 `key`**，
  页面在第二个弹窗里一次性展示并提示立即保存。
- **列表**：`authClient.apiKey.list()` → `{ apiKeys, total, limit, offset }`。条目不含
  明文，掩码用 `start`。
- **删除**：`authClient.apiKey.delete({ keyId })` → `{ success }`。

## 服务端校验

`verifyApiKey` 是 **server-only** 端点，只能在服务端调用：

```ts
const result = await getAuth(env).api.verifyApiKey({ body: { key } })
if (!result.valid) return new Response('Unauthorized', { status: 401 })
```

`result` 形如 `{ valid: boolean; key: { id, referenceId, ... } | null; error?: { message, code } }`。
校验失败时 `valid` 为 `false`、`key` 为 `null`，具体原因在 `error.code`（如
`KEY_NOT_FOUND` / `KEY_EXPIRED` / `KEY_DISABLED`）。

请求头默认用 `x-api-key`。

> **注意事项**：`defaultPrefix` 设为 `key_`，新建密钥都带此前缀。
>
> **关闭 `features.enableApiKeys` 时，`/api/auth/api-key/*` 这一组 HTTP 端点整体返回
> 404**——这不只是 UI 消失，而是「创建 / 列表 / 删除」的管理能力停用：用户无法再通过
> 插件端点自助管理密钥。门禁落在 `src/routes/api/auth/$.ts` 的路由层。
>
> 但**服务端直接调用不受影响**：`getAuth(env).api.verifyApiKey({ body: { key } })` 走的是
> 函数调用而非 HTTP 路由，绕过了该门禁。因此已签发密钥的既有用途由**调用方自行决定**：
> 若你希望 flag 关闭后连校验也一并停用，需在自己的业务路由里额外判一次
> `websiteConfig.features.enableApiKeys`。
>
> **明文只在创建响应里出现一次**，之后任何接口都不再返回，用户若未保存只能删除重建。

## 参考资料

- [better-auth API Key 插件](https://www.better-auth.com/docs/plugins/api-key)——配置项、限流与 refill
- [`@better-auth/api-key`](https://www.npmjs.com/package/@better-auth/api-key)——`verifyApiKey` 等端点

## 下一步

- [身份认证](./auth)——会话与邮箱密码路径
- [数据库](./database)——`apikey` 表与迁移
