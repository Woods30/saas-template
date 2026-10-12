# 贡献指南

感谢参与 `saas-template`。本文件说明文档、多语言与提交的约定。

## 环境准备

- **Node.js ≥ 22.12.0**（见 `package.json` 的 `engines`；建议使用偶数 LTS，如 22 / 24）
- **pnpm**（当前验证版本 pnpm 12.4.2；`pnpm-workspace.yaml` 为 pnpm 11+ 格式）

```bash
pnpm install
cp .env.example .env   # 照抄示例即可，optional 字段留空
```

## 文档规约

- 项目内文档默认中文；技术术语、命令、路径、库名保留英文。
- 中文与半角英数字之间添加一个半角空格。
- 中文使用全角标点。
- 面向开发者的代码注释同样使用中文；API、CLI、配置项等机器可读字段的键名保留英文。

## 多语言

- `messages/zh.json` 为源（中文优先），`messages/en.json` 为对照。
- 新增键必须在两个 locale 文件中同时存在。
- 修改后运行 `pnpm locale:sort` 与 `pnpm locale:check`。
- 消息文件位于**仓库根** `messages/`，不在 `project.inlang/` 下；`project.inlang/` 仅存配置
  与 Paraglide 编译缓存。

## Markdown 文档站（Sub-Plan C）

> 以下约定属后续 **Sub-Plan C**，当前仓库尚无 `content/` 目录，先记录以备后续实现。

- `content/docs/**` 为英文源；中文版使用 `*.zh.md` 后缀。
- 新增页面必须中英两份；缺失中文时 CI 失败。
- Frontmatter 必须含 `title`、`description`，可选 `order`、`category`。

## 提交规范

- 单一逻辑工作单元；结构变更与行为变更分开提交。
- 遵循 TDD：先写失败测试，再写实现，再 commit。
- 提交消息格式：`<type>(<scope>): <subject>`（subject 使用中文）。
- 提交前运行 `pnpm check` 与 `pnpm test`。

## 验证清单

提交前建议确认：

- `pnpm test` —— 单元测试通过
- `pnpm typecheck` —— 类型检查通过
- `pnpm lint` —— Biome 无告警
- `pnpm build` —— 生产构建成功
- `pnpm check:client-bundle` —— 客户端 bundle 不含服务端 secret（需先 `pnpm build`）

## 环境变量

- 业务代码不得直接读取 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、
  `src/env/server.ts`。
- `VITE_` 前缀变量会进入客户端 bundle，**不得**存放 secret；服务端 secret 只能经
  Workers binding 或服务端读取。
