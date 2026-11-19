---
title: API 密钥
description: 开启 API 密钥功能，用户自助创建与删除密钥
locale: zh
order: 11
group: auth
updated: 2026-11-19
---

API 密钥让用户在自己的账号下签发调用凭据。密钥存在 `apikey` 表，**明文不入库**——插件对完整密钥
做 SHA-256 后落库，列表只返回前缀，已签发的密钥无法再读回。

![API 密钥页](/docs/screenshots/api-keys.png "API 密钥：名称、掩码后的密钥前缀、创建与过期时间；明文密钥只在创建时显示一次")

## 步骤

1. **打开用户功能开关。** 管理后台**系统设置** → **用户** tab，打开 `userFeatures.apiKeys`。
   也可以在 `src/config/website.ts` 里改默认值。

2. **进入密钥页。** 地址 `/settings/api-keys`，入口在个人中心侧边栏。开关关掉时页面 404，
   `/api/auth/api-key/*` 这一组端点也整体 404（`src/routes/api/auth/$.ts`）。

3. **创建。** 填名称 + 选有效期 → `authClient.apiKey.create({ name, expiresIn })`。响应里的 `key`
   是**明文**，只在这一次出现，页面用弹窗展示一次就没了；没保存只能删除重建。

4. **列表。** `authClient.apiKey.list()` 返回 `{ apiKeys, total, limit, offset }`，条目只带 `start`
   前缀，页面按名称在前端过滤。

5. **删除。** `authClient.apiKey.delete({ keyId })`，页面用确认弹窗拦一下。插件另有
   `authClient.apiKey.update({ keyId, enabled: false })`，可以在不删记录的情况下停用一把密钥。

## 服务端校验

`verifyApiKey` 是 server-only 端点，只能在服务端调。密钥本身放在请求体里；请求头叫什么由你自己的路由
决定，本仓没有约定，下例用 `x-api-key`：

```ts
const key = request.headers.get('x-api-key')
if (!key) return new Response('Unauthorized', { status: 401 })

const result = await getAuth(env).api.verifyApiKey({ body: { key } })
if (!result.valid) return new Response('Unauthorized', { status: 401 })
```

`result` 形如 `{ valid: boolean; key: {...} | null; error?: { message, code } }`。失败时 `valid` 为
`false`、`key` 为 `null`，具体原因在 `error.code`：`KEY_NOT_FOUND` / `KEY_EXPIRED` / `KEY_DISABLED`。

## 有效期

`expiresIn` 的单位是**秒**（页面按天选，换算成秒再传），`null` 表示永不过期。插件把它换算成天数，
与服务端上下限比较，超出会被拒：

| 选项 | 默认值 | 含义 |
|---|---|---|
| `keyExpiration.minExpiresIn` | `1` | 允许的最少天数，低于则 `EXPIRES_IN_IS_TOO_SMALL` |
| `keyExpiration.maxExpiresIn` | `365` | 允许的最多天数，高于则 `EXPIRES_IN_IS_TOO_LARGE` |
| `keyExpiration.disableCustomExpiresTime` | `false` | 为 `true` 时忽略客户端传入值 |
| `keyExpiration.defaultExpiresIn` | `null` | 客户端不传时的兜底（单位是秒）；`null` 表示不过期 |

有效期只在**创建那一刻**有意义：插件把它换算成 `expiresAt` 落库，列表读的是那个时间戳，所以创建后
无法在界面上续期，只能删了重建。改上下限要同时改 `src/core/auth/auth.ts` 的 `apiKey({ keyExpiration })`
和 `src/routes/{-$locale}/_layout/settings/api-keys.tsx` 的 `EXPIRY_OPTIONS`，否则用户能选到一个
必然被服务端拒绝的值。

## 注意事项

- **关闭 `userFeatures.apiKeys` 只停掉 HTTP 端点。** 服务端直接调 `verifyApiKey` 走函数调用，
  绕过路由门禁，已签发密钥仍能通过校验。要连校验一起停用，得在自己的业务路由里再判一次
  `websiteConfig.userFeatures.apiKeys`。
- 明文只在创建响应里出现一次，之后任何接口都不再返回。
