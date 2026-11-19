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

3. **在后台填写。** 打开「系统设置 → 邮件」：

   - 渠道选 `resend`；
   - 在 Resend 分组填 API key（加密入库，不回显明文）；
   - 在邮件分组填发件地址（如 `noreply@<your-domain.com>`）。

   保存即生效，不用重新部署。发件地址必须是**纯邮箱地址**，`Brand <noreply@...>` 这种带显示名的
   写法会被拒绝。

   也可以先在 `.env` 里写 `RESEND_API_KEY` 与 `MAIL_FROM`，再跑 `pnpm db:seed` 一并写入
   ——它们只在 seed 时读取一次。

## DMARC

域名验证通过后补一条 DMARC 记录（记录名 `_dmarc`），先从只报告不处置开始，确认所有邮件都能送达
再逐步收紧到 `quarantine`、`reject`：

```bash
v=DMARC1; p=none; rua=mailto:<your-support-email>
```

`rua` 填一个真能收到报告的地址。

## 验证

后台「系统设置」保存后，服务状态里 `mail` 一项不再报缺配置即可。随后本地起服务、触发一次注册或联系表单，确认 Resend 后台
"Sent" 列表里出现该邮件——配置齐备只代表校验通过，域名验证与实际投递仍要在 Resend 确认。

```bash
pnpm email:dev
```

在 3001 端口预览 `src/core/email/templates/` 下的四个模板（验证、重置密码、联系消息、欢迎），
改模板即时热更新。

## 注意事项

- 同一域名若还开着 Cloudflare Email Routing 收信，两侧记录名不同可以共存，但**根域只能有一条
  SPF 记录**。
- 改发件地址在后台保存即生效，不需要重新部署。

配置好后可以接着做 [邮件总览](./email)里的联系表单，或 [邮件订阅](./newsletter)。
