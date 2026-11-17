---
title: 通知
description: Discord / 飞书 webhook 的接线与触发点
locale: zh
order: 20
group: notification
updated: 2026-11-03
---

通知模块把站点里的关键事件推到聊天工具的 webhook。Discord 与飞书的接入步骤几乎一样，
所以写在同一页：建机器人 → 复制 webhook 地址 → 填环境变量 → 切换 provider。

## 步骤

1. **建 webhook。**

   - **Discord**：服务器设置 → Integrations → Webhooks → New Webhook，选频道，复制 webhook URL。
   - **飞书**：群设置 → 群机器人 → 添加「自定义机器人」，复制 webhook 地址。

2. **填环境变量。** 两个地址的前缀由 schema 强制校验，写错会在启动时直接失败：

   | provider | 环境变量 | 前缀要求 |
   |---|---|---|
   | `discord` | `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/` |
   | `feishu` | `FEISHU_WEBHOOK_URL` | `https://open.feishu.cn/open-apis/bot/v2/hook/` |

   变量**不加 `VITE_` 前缀**。

3. **切换 provider。** 在 `src/config/website.ts`：

   ```ts
   notification: { enabled: true, provider: 'discord' },
   ```

   provider 二选一，且**必须与已配置的 webhook 对应**：选了 `feishu` 却只填了
   `DISCORD_WEBHOOK_URL`，诊断结果是 `incomplete`。

4. **部署。** 生产环境把 webhook 地址交给 Worker：

   ```bash
   pnpm exec wrangler secret put DISCORD_WEBHOOK_URL
   ```

   用 Release 自动部署时在 GitHub **Settings → Environments → production** 配同名 Secret。
   `DISCORD_WEBHOOK_URL` 已在部署工作流的运行时上传白名单里，**`FEISHU_WEBHOOK_URL` 没有**——
   用飞书的话要自己往 `.github/workflows/deploy.yml` 的 `env` 与上传白名单里补上。

## 触发点

| 事件 | 内容 | 位置 |
|---|---|---|
| 付款成功 | 套餐名、金额、用户 ID、购买类型 | `src/core/payment/events.ts` |
| 联系表单提交 | 访客姓名、邮箱、主题、正文 | `src/modules/contact/notifications.ts` |

联系表单的邮件通道与 webhook 通道**互为备份**：任一条成功就算送达，两条都失败才返回失败。

## 验证

```bash
pnpm run check:env
```

`notification` 一项不再报缺配置即可。然后发一次付款或提交一次联系表单，确认 webhook 收到消息。

## 注意事项

- 通知失败**不阻塞**业务：provider 未注册、投递失败或抛异常时只记一条 `console.warn` 并返回
  `false`。
- 飞书可能在 HTTP 200 的响应体里带业务错误码（`code` 非 0），provider 会解析它并判为失败。
- 单次 webhook 请求有 5 秒超时；Discord embed 的标题截断到 200 字符、正文 1000 字符，截断在
  调用方做。

配好后可以接着做 [分析](./analytics)——通知与转化的对照是常见运营需求。
