---
title: API 密钥
description: 用户自助创建与撤销 API 密钥
locale: zh
order: 18
group: features
updated: 2026-10-20
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

- **创建**：输入名称 + 选有效期 → `authClient.apiKey.create({ name, expiresIn })`。返回体含
  **明文 `key`**，页面在第二个弹窗里一次性展示并提示立即保存。
- **列表**：`authClient.apiKey.list()` → `{ apiKeys, total, limit, offset }`。条目不含
  明文，掩码用 `start`。
- **删除**：`authClient.apiKey.delete({ keyId })` → `{ success }`。

### 有效期

`expiresIn` 的单位是**秒**，`null` 表示永不过期。界面给 30 / 90 / 365 天与「永不过期」
四个选项，默认 30 天。

> 默认值选 30 天而不是「永不过期」：密钥会进 CI 配置、第三方集成这些**人不再看一眼**的
> 地方，长期有效密钥一旦泄漏，失效手段只剩人工删除。GitHub PAT、Stripe 的默认取向同理。

上限 365 天不是随意定的：插件 `keyExpiration.maxExpiresIn` 默认就是 365，超出会被拒
（`EXPIRES_IN_IS_TOO_LARGE`）。把界面上限对齐服务端默认值，用户就选不到必然失败的值。

四个选项的语义差别**只在创建那一刻**——插件把 `expiresIn` 换算成 `expiresAt` 时间戳落库，
列表页读的是那一个时间戳。因此创建后无法在界面上「续期」，只能删除重建。

若要改默认值或选项，动 `src/routes/{-$locale}/_layout/dashboard/api-keys.tsx` 顶部的
`EXPIRY_OPTIONS` 与 `DEFAULT_EXPIRY_DAYS`；服务端的硬上限另见下文配置节。

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

## 服务端有效期约束

`expiresIn` 由客户端传入，因此服务端必须有硬边界，否则任何调用方都能造一个 1 秒后失效、
或永不过期的密钥。这道校验由插件内置，**本仓目前依赖它的默认值**：

| 选项 | 默认值 | 语义 |
|---|---|---|
| `keyExpiration.minExpiresIn` | `1` | 允许的最小天数，低于则 `EXPIRES_IN_IS_TOO_SMALL` |
| `keyExpiration.maxExpiresIn` | `365` | 允许的最大天数，高于则 `EXPIRES_IN_IS_TOO_LARGE` |
| `keyExpiration.disableCustomExpiresTime` | `false` | 为 `true` 时忽略客户端传入值，一律用 `defaultExpiresIn` |
| `keyExpiration.defaultExpiresIn` | `null` | 客户端不传时的兜底天数；`null` 表示不过期 |

界面的 `EXPIRY_OPTIONS` 上限（365）正是对齐这里的默认 `maxExpiresIn`，用户选不到必然被拒的值。

需要收紧时在 `src/auth/auth.ts` 显式传 `keyExpiration`：

```ts
apiKey({
  defaultPrefix: 'key_',
  keyExpiration: { minExpiresIn: 1, maxExpiresIn: 90, defaultExpiresIn: 30 * 86_400 },
})
```

> **改了上限要同步改界面。** 服务端拒绝只会让创建请求失败并显示一条错误，
> 用户在下拉里仍能看到那个选项——两处取值必须一起动。

`disableCustomExpiresTime: true` 是「由服务端统一规定有效期」的开关，适合「所有密钥 90 天
强制轮换」的组织策略；开启后界面的有效期选择器应当一并移除，否则是个不起作用的控件。

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
