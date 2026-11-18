---
title: 通知
description: Discord / 飞书 webhook 的接线与触发点
locale: zh
order: 20
group: notification
updated: 2026-11-03
---

通知模块把站点里的关键事件推到聊天工具的 webhook。Discord 与飞书的接入步骤几乎一样，
所以写在同一页：建机器人 → 复制 webhook 地址 → 在后台填地址并选渠道。

## 步骤

1. **建 webhook。**

   - **Discord**：服务器设置 → Integrations → Webhooks → New Webhook，选频道，复制 webhook URL。
   - **飞书**：群设置 → 群机器人 → 添加「自定义机器人」，复制 webhook 地址。

2. **在后台填地址并选渠道。** 打开「系统设置 → 通知」：

   打开通知模块，选渠道（`discord` / `feishu`），把 webhook 地址填进对应分组。地址前缀由
   保存时校验：

   | provider | 字段 | 前缀要求 |
   |---|---|---|
   | `discord` | Discord webhook 地址 | `https://discord.com/api/webhooks/` |
   | `feishu` | 飞书 webhook 地址 | `https://open.feishu.cn/open-apis/bot/v2/hook/` |

   地址加密入库，保存即生效，不用部署。

3. **选错渠道的诊断。** 渠道**必须与已填的地址对应**：选了 `feishu` 却只填了 Discord 地址，
   服务状态是 `incomplete`，并列出缺的字段。

## 触发点

| 事件 | 内容 | 位置 |
|---|---|---|
| 付款成功 | 套餐名、金额、用户 ID、购买类型 | `src/core/payment/events.ts` |
| 联系表单提交 | 访客姓名、邮箱、主题、正文 | `src/modules/contact/notifications.ts` |

联系表单的邮件通道与 webhook 通道**互为备份**：任一条成功就算送达，两条都失败才返回失败。

## 验证

后台「系统设置」保存后，服务状态里 `notification` 一项不再报缺配置即可。然后发一次付款或提交
一次联系表单，确认 webhook 收到消息。

## 注意事项

- 通知失败**不阻塞**业务：provider 未注册、投递失败或抛异常时只记一条 `console.warn` 并返回
  `false`。
- 飞书可能在 HTTP 200 的响应体里带业务错误码（`code` 非 0），provider 会解析它并判为失败。
- 单次 webhook 请求有 5 秒超时；Discord embed 的标题截断到 200 字符、正文 1000 字符，截断在
  调用方做。

配好后可以接着做 [分析](./analytics)——通知与转化的对照是常见运营需求。
