---
title: 通知
description: Discord / 飞书 Webhook 的接线
locale: zh
order: 9
group: features
updated: 2026-10-15
---

| provider | 必要配置 |
|---|---|
| `discord` | `DISCORD_WEBHOOK_URL`，须以 `https://discord.com/api/webhooks/` 开头 |
| `feishu` | `FEISHU_WEBHOOK_URL`，须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 |

URL 前缀由 Zod schema 强制校验。`provider` 必须与已配置的 webhook 一致——选了 `feishu` 却只配 `DISCORD_WEBHOOK_URL` 时，服务状态判定为 `incomplete`。

```ts
notification: { enabled: true, provider: 'discord' },
```

> **注意事项**：`notify()` 在 provider 未注册、投递失败或抛错时都只写 `console.warn` 并返回 `false`——通知失败**不**阻塞业务流程。Discord embed 有长度上限，标题截断至 200 字符、正文 1000 字符。

## 参考资料

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook)——incoming webhook 的创建与调用
- [飞书自定义机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)——自定义机器人的 webhook 与安全设置

## 下一步

- [分析](./analytics)——GA / Plausible / Umami / Clarity 的启用
- [功能集成概览](./integrations)——六个服务模块的门禁语义与端点
