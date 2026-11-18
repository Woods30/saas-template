---
title: 登录与注册
description: 开启认证模块，接入 Google 登录与邮箱验证
locale: zh
order: 9
group: auth
updated: 2026-11-03
---

认证模块提供注册、登录、找回密码与邮箱验证。页面在 `/{locale}/auth/*`，API 在 `/api/auth/*`，
登录后的账号设置见[个人中心](./auth-account)。

![登录页](/docs/screenshots/auth-login.png "登录页：邮箱密码登录，配置 Google 凭据后自动出现第三方登录按钮")

## 步骤

1. **打开认证模块。** 打开后台「系统设置 → 模块」，打开「认证」；在同一 tab 里决定是否要求
   邮箱验证（默认要求）。

   模块开关同时门禁页面与 API：关闭时 `/{locale}/auth/*` 与 `/api/auth/*` 一起 404。

2. **配好生产必填的两个变量。**

   | 变量 | 要求 | 说明 |
   |---|---|---|
   | `BETTER_AUTH_SECRET` | ≥ 32 字符 | 签名会话与邮件 token；生产缺失时 `pnpm deploy` 第一步就失败 |
   | `BETTER_AUTH_URL` | 完整 origin | 生成回调与邮件链接的绝对地址；部署工作流默认取 `VITE_BASE_URL` |

   `BETTER_AUTH_SECRET` 用 `openssl rand -base64 32` 生成，按[部署到 Cloudflare](./cloudflare)
   里的方式上传为运行时 secret。

3. **（可选）接入 Google 登录。** 在后台「系统设置 → 认证」的 Google 分组填两个值，缺一不可：

   | 字段 | 说明 |
   |---|---|
   | Client ID | Google Cloud Console 里 OAuth 客户端的 ID |
   | Client secret | 同一个客户端的 secret（加密入库） |

   两个都配齐，登录页才出现 Google 按钮；只配 ID 时按钮不显示，也不会留下一个必然失败的
   入口。在 Google Cloud Console 的 OAuth 客户端里登记回调地址：

   | 字段 | 值 |
   |---|---|
   | 授权的 JavaScript 来源 | `https://<your-domain>` |
   | 授权的重定向 URI | `https://<your-domain>/api/auth/callback/google` |

   本地开发另加 `http://localhost:3000` 与 `http://localhost:3000/api/auth/callback/google`。

4. **（可选）开启邮箱验证。** `requireEmailVerification: true` 要求新用户先验证邮箱才能登录，
   它依赖邮件模块：按[邮件](./email)配好 provider 与 `MAIL_FROM` 后，注册与登录才会真的发信。

## 验证

- 本地 `pnpm dev` 后打开 `/{locale}/auth/register` 注册一个账号，应收到验证邮件。
- 线上 `curl -s https://<your-domain>/api/auth/get-session` 返回 200 且 `session` 为 `null`，
  说明认证 API 正常。
- `pnpm run check:env:prod` 通过（启动变量合法）。业务凭据在数据库里，到后台概览确认已启用模块
  都显示 `configured`。

## 注意事项

- `requireEmailVerification` 是安全控制，不是邮件开关：它不随 `mail.enabled` 关闭而自动放开。
  要求验证而邮件未配齐时，认证 API 返回 503，不会降级成免验证登录。
- Google 登录不受邮箱验证拦截——Google 返回已验证的邮箱，只有邮箱密码路径受这条约束。
- 密钥类环境变量一律不加 `VITE_` 前缀，否则会打进客户端 bundle。
