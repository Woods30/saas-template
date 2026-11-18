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

1. **选渠道并开启。** 打开后台「系统设置 → 模块」，打开「邮件订阅」；再到「邮件 → 订阅」选
   渠道：`resend` 或 `beehiiv`。

2. **填凭据。** 同一页填写：

   | provider | 必要字段 | 从哪来 |
   |---|---|---|
   | `resend` | Resend API key + Audience ID | 都取自 Resend 后台 |
   | `beehiiv` | Beehiiv API key + Publication ID | 都取自 Beehiiv 后台 |

   Beehiiv 分组里还有「发送欢迎邮件」开关，默认关闭。密钥加密入库、只回显末四位，
   保存即生效。

   也可以先把对应值写进 `.env`，再跑 `pnpm db:seed` 一并写入数据库。

3. **不需要额外部署。** 配置存在数据库，改完保存就生效。

## 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `POST` | `/api/newsletter` | 订阅，body 为 `{ email }` |
| `DELETE` | `/api/newsletter` | 退订，body 为 `{ email }` |
| `GET` | `/api/newsletter?email=` | 查订阅状态，给个人中心回填开关 |

订阅与退订按 IP 限流：**每分钟 5 次**，超限返回 429。状态查询不限流，结果在 KV 里缓存 1 小时，
订阅或退订后对应缓存立即失效。

## 验证

后台「系统设置」保存后，服务状态里 `newsletter` 一项不再报缺配置即可。然后在页面上提交一次订阅，去第三方
后台确认名单里多了这个邮箱。

## 注意事项

- 限流依赖 KV（`CACHE` binding）。没有缓存时请求会被直接拒绝，订阅功能不可用。
- 模块关闭时接口返回 404 `MODULE_DISABLED`；已开启但变量没配齐时返回 503
  `SERVICE_UNAVAILABLE`，前端据此提示，不会假装成功。
