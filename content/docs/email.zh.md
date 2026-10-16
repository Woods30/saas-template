---
title: 邮件
description: Resend / Cloudflare Email 与联系表单的接线
locale: zh
order: 6
group: features
updated: 2026-10-15
---

`src/mail/index.ts` 按 provider 名称从当前请求的注册表取实例。`sendMail()` 带最多 3 次重试（间隔 250ms 递增），全部失败时返回最后一次错误。

| provider | 必要配置 |
|---|---|
| `resend` | `RESEND_API_KEY`、`MAIL_FROM` |
| `cloudflare` | `MAIL_FROM` 或 `CLOUDFLARE_EMAIL_SENDER`、`EMAIL` binding |

发件人由 `getMailFrom(config, env)` 统一归一化：优先 `MAIL_FROM`；缺失且 provider 为 Cloudflare 时回退 `CLOUDFLARE_EMAIL_SENDER`。**不**回退 `example.com`——缺失时 provider 不注册，调用明确失败而非静默发出错误发件人的邮件。

```ts
mail: { enabled: true, provider: 'resend', supportEmail: 'support@your-domain.com' },
```

> **注意事项**：Cloudflare Email binding 只能发往已验证的收件地址。部署时须自行核对账户收件限制；`pnpm check` 会列为 manual 核对项，但不参与 completeness 判定。`/api/email` 除门禁外还要求有效会话，且收件人必须在 `ADMIN_EMAILS` 白名单内。

## 本地预览

模板位于 `src/mail/templates/`（React Email）。用 `pnpm email:dev` 启动预览服务，端口 **3001**（与 `pnpm dev` 的 3000 区分），浏览器打开后可在四个模板间切换并实时热更新：

```bash
pnpm email:dev
```

预览依赖 `@react-email/ui`（devDependency，须与 `react-email` 版本一致）。

## 联系表单

`contact` 依赖 `mail` 配置完整——`contact.enabled` 为 `true` 但 `mail` 未配置齐备时，状态为 `incomplete`，`/api/contact` 返回 503，避免用户提交后消息无处投递。

投递路径（`src/contact/notifications.ts`）：

1. **邮件**——核心通道，发往 `mail.supportEmail`，失败写 `console.warn`；
2. **Webhook**——仅当 `notification.enabled` 为 `true`，按 `notification.provider` 选择 Discord 或飞书，失败不阻塞主流程。

```ts
contact: { enabled: true },
```

## 参考资料

- [Resend API](https://resend.com/docs/api-reference/introduction)——`RESEND_API_KEY` 的用法与限流
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)——`send_email` binding 的声明与 `send()` 调用

## 下一步

- [邮件订阅](./newsletter)——一键订阅与退订管理
- [支付](./payment)——Stripe 结账与 Price 白名单
