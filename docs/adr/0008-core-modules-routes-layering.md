# ADR-0008: core / modules / routes 三层与模块公开入口

- **状态**：Accepted（2026-11-17）
- **日期**：2026-11-17

## 背景

模板原先按技术类型平铺 `src/`：`auth/`、`payment/`、`mail/`、`routes/` 并列，业务能力
靠 `website.ts` 的开关与运行期门禁拼装。要加入 credits、usage、entitlements、AI 任务、
RBAC 这类横向能力时，没有地方安放「它属于谁、别人能用什么」，跨模块直接查表会迅速
把边界磨平。

参照 ShipAny TanStack 的 `core + modules + routes` 分层后，需要回答三个问题：基础设施
与业务怎么分、模块的公开面是什么、边界靠什么守。

## 决策

1. **`src/core` 放基础设施**：db、env、auth、payment、storage、email、cache、notify、
   i18n。core 可以依赖外部包与 core 内部，**不得依赖 modules 或 routes**。
2. **`src/modules` 放业务能力**：credits、subscriptions、rbac、
   apikeys、ai-tasks、tickets、invite-codes、posts、changelog、taxonomy、contact、
   newsletter、docs 等（`usage` 与 `entitlements` 已由 ADR-0011 删除）。模块可依赖
   core 与自己的内部文件，**不得依赖 routes**。
3. **模块的唯一公开入口是 `service.ts`**：模块根路径（`@/modules/x`）与内部文件
   （`@/modules/x/internal/*`）都不算入口。跨模块调用也走对方 `service.ts`，形成单向、
   编译期可见的依赖，不引入事件总线或运行时注册。
4. **不做插件系统**（延续 ADR-0007）：没有清单、发现、生命周期、动态加载。模块 = 独立
   目录 + `service.ts` + 配置开关 + 运行期门禁。
5. **边界由 `scripts/check-boundaries.ts` 守**：纯函数检查 import 方向，接入 `pnpm check`
   与 CI。违例即失败，不靠 code review 自觉。
6. **后台操作契约集中登记**：沿用 ShipAny 的 `admin-operations.ts` 形状——operation 名 +
   权限点 + zod schema + handler；但 handler 必须调模块 `service`，不得直接查表。

## 后果

- 所有 `@/auth`、`@/payment`、`@/mail` 之类的导入改为 `@/core/*`；业务模块改为
  `@/modules/<id>/service`。这是破坏性变更，v0.12.0 之前不考虑兼容层。
- 通知（notify）与邮件（email）被归入 core：支付事件、认证邮件都要用它们，放在 modules
  会让 core 反向依赖。这条与 ShipAny 把 notify 当模块不同，是本仓边界规则下的必然选择。
- 模块之间仍有编译期耦合（`subscriptions` 调 `credits`），但耦合点被收敛到少数
  `service.ts` 导出上，模块内部重构不会外溢。
- 新增模块需要同时改：目录、`service.ts` 导出、配置开关、门禁、后台 operation 登记。
  这是刻意的摩擦，换取边界清晰。

## 相关

- `docs/adr/0007-optional-module-not-plugin-system.md`
- `docs/adr/0009-multi-dialect-database.md`
- `scripts/check-boundaries.ts`、`tests/unit/check-boundaries.test.ts`
