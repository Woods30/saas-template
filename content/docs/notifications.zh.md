---
title: 通知
description: Discord / 飞书 Webhook 的接线与触发点
locale: zh
order: 9
group: features
updated: 2026-10-19
---

| provider | 必要配置 |
|---|---|
| `discord` | `DISCORD_WEBHOOK_URL`，须以 `https://discord.com/api/webhooks/` 开头 |
| `feishu` | `FEISHU_WEBHOOK_URL`，须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 |

URL 前缀由 Zod schema 强制校验。`provider` 必须与已配置的 webhook 一致——选了 `feishu` 却只配 `DISCORD_WEBHOOK_URL` 时，服务状态判定为 `incomplete`。

```ts
notification: { enabled: true, provider: 'discord' },
```

## 触发点

| 事件 | 位置 |
|---|---|
| 联系表单提交 | `src/contact/notifications.ts` |
| 支付成功（订阅续费 / 一次性付款） | `src/routes/api/webhooks/stripe.ts` |

`notify()` 拿不到事件名到渠道的映射——调用方自己知道该走哪个 provider。这是有意的：
事件语义（「有人付款」）与投递渠道（Discord 还是飞书）是两个独立的关注点，
用一张事件→渠道表把它们绑死反而会让新增渠道时改一堆无关代码。

## 错误处理

`notify()` 在 provider 未注册、投递失败或抛错时都只写 `console.warn` 并返回
`false`——通知失败**不**阻塞业务流程。

两处 provider 细节值得注意：

- **飞书可能返回 HTTP 200 但业务失败**。签名 / 关键词 / IP 白名单校验不通过时，
  响应体是 `{ code: 19021, msg: … }`，HTTP 状态仍是 200。只看 `res.ok` 会把失败
  当成功、`notify()` 也不会告警。因此飞书 provider 会解析 `code`，非 0 即失败。
- **请求带 5 秒超时**（`AbortSignal.timeout`）。挂住的 webhook 会拖住整个请求，
  而通知对业务并不关键，不应让一条通知把一次查询搞超时。

Discord 的错误体现在 HTTP 状态上（429 限流、401 失效、400 格式错误），因此不需要
解析响应体。

Discord embed 有长度上限：标题截断至 200 字符、正文 1000 字符。截断在**调用方**
做（contact 模块），provider 层只负责投递。

## 参考资料

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook)——incoming webhook 的创建与调用
- [飞书自定义机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)——自定义机器人的 webhook 与安全设置

## 下一步

- [分析](./analytics)——GA / Plausible / Umami / Clarity 的启用
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
