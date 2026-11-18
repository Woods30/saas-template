# ADR-0010: 系统配置入库、密钥加密与 env 边界

- **状态**：Accepted（2026-11-18）
- **日期**：2026-11-18

## 背景

当前站点配置有三个来源：`src/config/website.ts` 的出厂值、env（`VITE_MODULES` 等
`applyEnvOverrides` 覆盖）、数据库 `settings` 表里的六组 JSON。改一个开关需要先判断
「哪一层会盖住它」；而 ADR-0009 明确写了「密钥不进配置表」，结果是后台能改品牌与 SEO，
却改不了任何支付 / 邮件凭据——模板使用者接入自己的 Stripe 账号必须改 env 再重新部署。

ADR-0009 第 67-69 行还留了一条已知出入：模块开关仍接受 `VITE_MODULES` 覆盖，与「只读 DB」
的计划不一致。

## 决策

1. **`settings` 表结构不变**（`key` 主键、`value` TEXT、`updated_at`），只改语义：从
   「六行 JSON 分组」变成「一个字段一行」。不需要新增列。
2. **配置注册表是唯一事实来源**：新建 `src/core/config/registry.ts`，以
   tabs → groups → fields 的声明形式描述每个键（类型、默认值、是否密钥）。后台表单、
   公开配置下发、保存校验都从注册表生成，不再各写一份。
3. **密钥入库并加密**：支付、邮件、存储、AI、Turnstile、通知 webhook、OAuth 的凭据写入
   `settings`，值以 `enc:v1:` 前缀存 AES-256-GCM 密文；后台只回显末四位。
   `CONFIG_ENCRYPTION_KEY` 缺失时**拒绝保存任何含密钥的组**，公开参数仍可写。
4. **env 只留启动必需与防锁死项**：`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`DATABASE_*`、
   `CONFIG_ENCRYPTION_KEY`、Cloudflare 部署 token、`ADMIN_EMAILS`。其余键从
   `.env.example` 移除。
5. **模块开关只读 DB**：删除 `applyEnvOverrides`；env 只在 `db:seed` 时作为初值来源。
   这条落实 ADR-0009 里记录为「有出入」的部分。
6. **后台 tab 按本仓能力裁剪**：常规 / 用户 / 认证 / 支付 / 邮件 / 存储 / AI / 分析 / 通知，
   不设空壳页；支付、邮件、存储三组提供「测试连接」。
7. **旧配置清空重 seed**：不写数据迁移脚本。模板仓不承诺跨版本迁移。

## 考虑过的替代

- **密钥保持 env-only**（ADR-0009 原方案）：安全边界最清楚，但后台半残、模板使用者的
  接入成本全压在部署环节。
- **env 与 DB 双轨**：优先级最高灵活，但「到底哪份生效」的排查成本最高，且两份真相源
  迟早不一致。
- **照搬 ShipAny 的无 schema env**：它用 `Record<string, string>` 加 `??` 默认值，本仓的
  zod 两层 schema 更严格，不采用其 env 部分；只采纳其注册表与加密思路。

## 后果

- 配置的入口从「三处」收敛到「一处」：后台。env 退化为启动参数。
- 泄露面从「环境变量」扩展到「数据库 + 加密密钥」，因此 `CONFIG_ENCRYPTION_KEY` 必须与
  数据库分开保管；密钥丢失等于所有已存凭据不可解，只能重填。
- 已部署实例的 `settings` 表需要清空后重新 `db:seed`，后台配置要重配一次。
- ADR-0009 第 51 行（密钥不进配置表）与第 67-69 行（`VITE_MODULES` 覆盖）由本 ADR 取代。
