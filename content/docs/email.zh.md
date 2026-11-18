---
title: 邮件总览
description: 事务邮件的用途、两个地址的区别与 provider 选择
locale: zh
order: 16
group: email
updated: 2026-11-19
---

邮件模块给站点的三处提供发信能力：邮箱验证与欢迎信、联系表单转发的消息、管理端手动发信。
发信渠道二选一：**Resend** 或 **Cloudflare Email**，接入步骤各写一页。

## 要决定的三件事

| 决定 | 在哪配 | 作用 |
|---|---|---|
| 发件地址 | 后台「邮件 → 发件地址」 | 验证邮件、重置密码、欢迎信的发件人 |
| 支持邮箱 | 后台「邮件 → 支持邮箱」 | 联系表单的收件人，也是页脚 `mailto:` 入口 |
| 开关 | 后台「模块 → 邮件」 | 关掉后邮件相关的 API 一律返回 404 `MODULE_DISABLED` |

前两项**互相独立**：配了其中一个不会自动填另一个，地址也可以分别选。发件地址必须是纯邮箱
地址（`noreply@<your-domain.com>`），不接受 `Brand <noreply@...>` 这种带显示名的写法。

这些值存在数据库里，后台保存即生效；`.env` 里的同名变量只在 `pnpm db:seed` 时作初值。

## 选 provider

| provider | 必要配置 | 接入页面 |
|---|---|---|
| `resend` | Resend API key + 发件地址 | [Resend](./email-resend) |
| `cloudflare` | 发件地址（或 Cloudflare Email 发送方）+ `EMAIL` binding | [Cloudflare Email](./email-cloudflare) |

## 开了之后有什么

- **认证邮件**：`auth.requireEmailVerification` 为 `true`（默认）时，注册发验证邮件、验证成功后发
  欢迎邮件、忘记密码发重置链接。邮件没配齐时 `auth` 会被判为配置矛盾，`/api/auth/*` 返回 503，
  **不会**自动降级成免验证登录。
- **联系表单**：`contact.enabled` 为 `true` 时，表单消息发到 `mail.supportEmail`。它依赖邮件模块
  配置完整——邮件不通时 `/api/contact` 返回 503，不会让访客以为已送达。
- **手动发信**：`/api/email` 供管理端发模板邮件，要求已登录且收件人在 `ADMIN_EMAILS` 白名单内。

## 验证

后台「系统设置」保存后，服务状态会按当前开启的模块列出缺失配置，邮件相关诊断出现在 `mail` 一项下；管理台概览读同一份诊断。

```bash
pnpm email:dev
```

在 3001 端口预览模板（`src/core/email/templates/`），改模板即时热更新。

## 注意事项

- 同一时刻只有一个 provider 生效，由 `mail.provider` 决定走哪条链路。
- 缺密钥或缺发件地址时该 provider 不会注册，调用会明确失败，不会用占位地址把邮件发出去。
- 邮件主题与正文按访客语言渲染，新增模板要同时补中文与英文。

配好后可以接着做 [邮件订阅](./newsletter)——同一套发信凭据也能用来收订阅名单。
