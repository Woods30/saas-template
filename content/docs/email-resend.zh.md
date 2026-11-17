---
title: Resend
description: 验证发信域名、创建 API key 与部署
locale: zh
order: 17
group: email
updated: 2026-11-03
---

Resend 是第三方事务邮件服务。本站用它发验证邮件、欢迎信、重置密码链接和联系表单消息。
前置条件：域名已托管在 DNS 上，且你要在 Resend 后台把它验证成发信域名。

## 步骤

1. **验证发信域名。** 在 [Resend Domains](https://resend.com/domains) 添加你拥有的域名，按
   Records 页给出的记录配好 DNS，等状态变成 Verified。

   - **以 Records 页显示的为准**：2026 年 8 月后新建的域名用两条 `CNAME` 配 Return-Path，
     更早的域名是 `send` 子域上的 `MX` + `TXT`。
   - `CNAME` **不能开 Cloudflare 代理**（橙云），同一名字下也不能有别的记录，否则验证不通过。
   - 如果 Cloudflare 自动给 `MX` 值补上了你的域名，在末尾加一个点：
     `feedback-smtp.<region>.amazonses.com.`。

   生产环境的验证邮件必须用已验证域名；Resend 自带的测试域名只用于受限测试。

2. **创建 API key。** 在 [Resend API Keys](https://resend.com/api-keys) 建一个带**发信权限**的 key，
   复制保存（只显示一次）。

3. **填环境变量。** `RESEND_API_KEY` 是服务端 secret，`MAIL_FROM` 是发件地址：

   ```bash
   RESEND_API_KEY=<your-resend-api-key>
   MAIL_FROM=noreply@<your-domain.com>
   ```

   `MAIL_FROM` 必须是**纯邮箱地址**，写进代码前用 `z.email()` 校验，`Brand <noreply@...>` 这种带
   显示名的写法会被拒绝。两个变量都**不加 `VITE_` 前缀**。

4. **部署。** 生产环境把这两个值交给 Worker：

   ```bash
   pnpm exec wrangler secret put RESEND_API_KEY
   pnpm exec wrangler secret put MAIL_FROM
   ```

   用 Release 自动部署时，在 GitHub **Settings → Environments → production** 里配 Secret
   `RESEND_API_KEY` 与 Variable `MAIL_FROM`（同名 Secret 也兼容，Variable 优先）。两者都已在部署
   工作流的运行时上传白名单里。

## DMARC

域名验证通过后补一条 DMARC 记录（记录名 `_dmarc`），先从只报告不处置开始，确认所有邮件都能送达
再逐步收紧到 `quarantine`、`reject`：

```bash
v=DMARC1; p=none; rua=mailto:<your-support-email>
```

`rua` 填一个真能收到报告的地址。

## 验证

```bash
pnpm run check:env
```

`mail` 一项不再报缺配置即可。随后本地起服务、触发一次注册或联系表单，确认 Resend 后台
"Sent" 列表里出现该邮件——配置齐备只代表校验通过，域名验证与实际投递仍要在 Resend 确认。

```bash
pnpm email:dev
```

在 3001 端口预览 `src/core/email/templates/` 下的四个模板（验证、重置密码、联系消息、欢迎），
改模板即时热更新。

## 注意事项

- 同一域名若还开着 Cloudflare Email Routing 收信，两侧记录名不同可以共存，但**根域只能有一条
  SPF 记录**。
- 改了 `MAIL_FROM` 就要重新部署才生效（它是运行时 secret）。

配置好后可以接着做 [邮件总览](./email)里的联系表单，或 [邮件订阅](./newsletter)。
