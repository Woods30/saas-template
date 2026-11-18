---
title: 邮件订阅
description: 订阅名单的接线、接口与限流
locale: zh
order: 19
group: email
updated: 2026-11-03
---

订阅模块把访客邮箱收进一个名单，名单存在第三方服务（Resend Audiences 或 Beehiiv），本站只负责
收单与查状态。开启后有两处入口：营销页的订阅框（`NewsletterCta` 组件）与个人中心的「通知偏好」
开关（`/settings/notifications`）。

## 步骤

1. **选 provider 并开启。** 在 `src/config/website.ts`：

   ```ts
   newsletter: { enabled: true, provider: 'resend' },
   ```

   provider 二选一：`resend` 或 `beehiiv`。

2. **填环境变量。**

   | provider | 必要变量 | 从哪来 |
   |---|---|---|
   | `resend` | `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` | 都取自 Resend 后台 |
   | `beehiiv` | `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` | 都取自 Beehiiv 后台 |

   `BEEHIIV_SEND_WELCOME_EMAIL` 控制 Beehiiv 是否给新订阅者发欢迎邮件，取 `true` / `false`，
   默认 `false`。这些变量**不加 `VITE_` 前缀**。

3. **部署。** 生产环境把变量交给 Worker（`pnpm exec wrangler secret put <NAME>`）；用 Release
   自动部署时在 GitHub **Settings → Environments → production** 配同名 Secret。注意
   `RESEND_AUDIENCE_ID` 与 `BEEHIIV_*` **不在**部署工作流的运行时上传白名单里，启用前要自己往
   `.github/workflows/deploy.yml` 的 `env` 与上传白名单里补上。

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/api/newsletter` | 订阅，body 为 `{ email }` |
| `DELETE` | `/api/newsletter` | 退订，body 为 `{ email }` |
| `GET` | `/api/newsletter?email=` | 查订阅状态，给个人中心回填开关 |

订阅与退订按 IP 限流：**每分钟 5 次**，超限返回 429。状态查询不限流，结果在 KV 里缓存 1 小时，
订阅或退订后对应缓存立即失效。

## 验证

`pnpm run check:env` 里 `newsletter` 一项不再报缺配置即可。然后在页面上提交一次订阅，去第三方
后台确认名单里多了这个邮箱。

## 注意事项

- 限流依赖 KV（`CACHE` binding）。没有缓存时请求会被直接拒绝，订阅功能不可用。
- 模块关闭时接口返回 404 `MODULE_DISABLED`；已开启但变量没配齐时返回 503
  `SERVICE_UNAVAILABLE`，前端据此提示，不会假装成功。
