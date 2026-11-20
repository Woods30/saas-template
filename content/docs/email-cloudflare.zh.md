---
title: Cloudflare Email
description: 用 Cloudflare 账号内的 Email Routing 发信
locale: zh
order: 18
group: email
updated: 2026-11-03
---

Cloudflare Email 走你 Cloudflare 账号内的邮件路由发信，不依赖第三方服务商账号。
前置条件：域名已托管在这个 Cloudflare 账号下，账号已开通 Email Routing。

## 步骤

1. **开通 Email Routing。** 在 Dashboard 的 **Email → Email Routing** 里启用该功能，并添加一个
   已验证的收件地址（用于收信与路由规则的落点）。

2. **配 MX 记录。** 按 Dashboard 提示把域名的 MX 指向 Cloudflare 的路由服务器：

   | 记录 | 值 |
   |---|---|
   | 根域 `MX` | `route1.mx.cloudflare.net`（按 Dashboard 给出的完整列表） |
   | 根域 `TXT` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
   | DKIM | `cf2024-1._domainkey` 的 `TXT`（Email Routing 开启时自动添加） |

   Email Routing **只收不发**：转发出去的邮件无法以原地址回复，要用接收方账号回信。

3. **声明 `EMAIL` binding。** 在 `wrangler.jsonc` 里加 `send_email` 绑定，绑定名必须是 `EMAIL`
   ——代码按这个名字读：

   ```jsonc title="wrangler.jsonc"
   "send_email": [
     {
       "name": "EMAIL",
       "destination_address": "<your-verified-address>"
     }
   ]
   ```

   模板里这段是注释掉的，示例值 `REPLACE_ME` 不是合法投递地址，启用前要换成真实地址。
   `destination_address` 限定这个 binding 只能发往哪个已验证地址；不限定就填实际要发的地址。

4. **在后台切换渠道并填发件地址。** 打开「系统设置 → 邮件」：

   - 渠道选 `cloudflare`；
   - 发件地址填在邮件分组（如 `noreply@<your-domain.com>`）；留空时回退到
     Cloudflare Email 分组里的发送方地址。

   发件地址必须是纯邮箱地址，不接受带显示名的写法。保存即生效。

   也可以先在 `.env` 里写 `MAIL_FROM` / `CLOUDFLARE_EMAIL_SENDER`，再跑 `pnpm db:seed`。

5. **部署。** `EMAIL` binding 的改动要重新部署：

   ```bash
   pnpm deploy
   ```

## 与 Resend 的差别

走账号内的路由，不绑第三方服务商、不用买发信额度；代价是域名必须在 Cloudflare 上，且受账号
的收件地址验证限制。

## 验证

后台「系统设置」保存后，`mail` 一项不再报缺配置即可；绑定是否存在由 `pnpm check` 列为部署核对项。
随后触发一次注册或联系表单，确认邮件真的送达。

```bash
pnpm email:dev
```

在 3001 端口预览 `src/core/email/templates/` 下的模板。

## 注意事项

- Cloudflare Email binding **只能发往已验证的收件地址**，部署前先核对账号的收件限制。
- 发件地址留空时，`CLOUDFLARE_EMAIL_SENDER` 才会作为回退；两者都只在 `provider` 为 `cloudflare` 时使用。

配置好后可以接着做 [邮件总览](./email)里的联系表单，或 [邮件订阅](./newsletter)。
