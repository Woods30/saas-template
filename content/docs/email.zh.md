---
title: 邮件
description: Resend / Cloudflare Email 与联系表单的接线
locale: zh
order: 12
group: features
updated: 2026-10-29
---

`src/mail/index.ts` 按 provider 名称从当前请求的注册表取实例。`sendMail()` 带最多 3 次重试（间隔 250ms 递增），全部失败时返回最后一次错误。

| provider | 必要配置 |
|---|---|
| `resend` | `RESEND_API_KEY`、`MAIL_FROM` |
| `cloudflare` | `MAIL_FROM` 或 `CLOUDFLARE_EMAIL_SENDER`、`EMAIL` binding |

发件人由 `getMailFrom(config, env)` 统一归一化：优先 `MAIL_FROM`；缺失且 provider 为 Cloudflare 时回退 `CLOUDFLARE_EMAIL_SENDER`。**不**回退 `example.com`——缺失时 provider 不注册，调用明确失败而非静默发出错误发件人的邮件。

当前配置启用了 Resend 和邮箱验证，并设置了支持收件邮箱：

```ts
// src/config/website.ts
mail: { enabled: true, provider: 'resend', supportEmail: 'service@jerbix.site' },
auth: { enabled: true, requireEmailVerification: true },
```

## Resend 配置

### 1. 验证发信域名

在 [Resend Domains](https://resend.com/domains) 添加自己拥有的发信域名或子域名，按控制台给出的值
配置 DNS 记录，等待验证通过。生产用户的验证邮件必须使用已验证域名；Resend 测试域名只能用于受限测试。

**以控制台 Records 页显示的为准**：2026 年 8 月后新建的域名用两条 `CNAME` 配置 Return-Path
（老域名是 `send` 子域上的 `MX` + `TXT`）。`CNAME` **不能开 Cloudflare 代理**（橙云），同一名字上
也不能有其他记录，否则验证不通过。若控制台给出的 `MX` 值被 Cloudflare 自动补上了域名，
在末尾加一个点：`feedback-smtp.<region>.amazonses.com.`。区域对应关系为 `us-east-1`（北弗吉尼亚）、
`eu-west-1`（爱尔兰）、`sa-east-1`（圣保罗）、`ap-northeast-1`（东京）。

同一域名若还启用了 Cloudflare Email Routing 收信，两侧的记录名不同，可以共存；**但根域只能有
一条 SPF 记录**，详见 [Cloudflare](./cloudflare#6-同一域名同时收信与发信)。
### 2. 设置 API key 与发件地址

创建具有发信权限的 API key，将其作为 `RESEND_API_KEY`。`MAIL_FROM` 使用已验证域名下的
**纯邮箱地址**，例如 `noreply@example.com`；本项目用 `z.email()` 校验，不接受
`Brand <noreply@example.com>`。示例地址必须替换为自己的真实地址。
### 3. 本地配置

本地在 `.env` 填写以下字段，`BETTER_AUTH_URL` 与 `VITE_BASE_URL` 保持一致：

```bash
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=noreply@example.com
BETTER_AUTH_URL=http://localhost:3000
```

### 4. 补 DMARC 记录

域名验证通过后补一条 DMARC，建立发信方信任并防止冒用。起点用 `p=none`（只报告不处置），
确认所有邮件都能通过后 再逐步收紧到 `quarantine`、`reject`：

```bash
# _dmarc 记录，名字填 _dmarc
v=DMARC1; p=none; rua=mailto:service@jerbix.site
```

`rua` 填一个能收到报告的邮箱。用 `service@jerbix.site` 即可——前提是该地址已配好收信转发。

### 5. Release 自动部署

自动部署时，在 GitHub **Settings → Environments → production** 设置 Secret `RESEND_API_KEY`
和 Variable `MAIL_FROM`。工作流也兼容 Secret `MAIL_FROM`，Variable 优先。两者都**不加 `VITE_` 前缀**，
已映射到校验 / 构建环境，并列入 `wrangler deploy --secrets-file` 的运行时上传白名单。
### 6. 手工生产部署

手工部署时，在未入库的 `.env.production` 中提供同样的生产字段以通过校验，并同步到 Worker
运行时绑定，例如分别执行 `pnpm exec wrangler secret put RESEND_API_KEY` 和
`pnpm exec wrangler secret put MAIL_FROM`。生产 `BETTER_AUTH_URL` 使用真实 HTTPS origin。
本地、生产校验与运行时配置应按各自环境保持一致，详见 [Cloudflare](./cloudflare)。

## 发件地址、支持邮箱与认证流程

`mail.supportEmail` 是联系表单的**收件地址**及站点支持入口；`MAIL_FROM` 是验证、重置密码和欢迎邮件的
**发件地址**。两者作用独立，配置其中一个不会自动填充另一个，地址可按业务需要分别选择。
支持邮箱现为 `service@jerbix.site`，发件地址仍须按 Resend 已验证域名单独配置。支持邮箱配置不会自动开启联系表单。

当前要求邮箱验证，缺少 API key / 发件地址或关闭邮件，会令 `mail` 未配置完整、`auth` 为 `incomplete`，
`/api/auth/*` 返回 503，生产校验失败，**不会隐式关闭验证或降级为免验证登录**。
配置完整只代表本地校验通过；域名验证、API key 权限与实际投递仍需在 Resend 确认。

认证邮件时机：注册发送验证邮件，不创建 session；未验证账号以正确密码登录会重发并返回
403 `EMAIL_NOT_VERIFIED`；验证成功自动登录，欢迎邮件由 `afterEmailVerification` 触发，
不再由创建用户触发。完整流程见[身份认证](./auth)。

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
