# 贡献

## 流程

1. Fork & clone 仓库。
2. `pnpm install && pnpm run setup`。
3. 切分支：`git switch -c feat/<name>`。
4. TDD：先写测试，再实现（详见下方的 TDD 周期）。
5. 提交前 `pnpm run check` 与 `pnpm run test` 全部通过。
6. 推送分支，开 PR。

## TDD 周期

1. **Red** — 编写最简单的失败测试，测试名称明确描述行为。
2. **Green** — 实现通过测试的最小代码，专注于让测试通过。
3. **Refactor** — 仅在测试通过后进行重构，消除重复，明确意图。

## Commit 规范

- `feat:` 新功能
- `fix:` Bug 修复
- `chore:` 杂项（依赖更新、配置调整等）
- `refactor:` 重构（不改变行为）
- `test:` 测试（新增或修改测试）
- `docs:` 文档
- `perf:` 性能改进
- `ci:` CI / CD 变更

中文提交，祈使句现在时，描述动机与变更点。

## PR 标题 / 描述

中文；祈使句现在时；描述动机与变更点。PR 描述应说明解决了什么问题、做了什么变更、测试结果如何。

## 代码风格

- TypeScript strict 模式
- Biome lint + format
- 单一职责，避免重复
- 硬编码值常量化

## 质量门槛

- `pnpm run check` — locale 编译 + Biome + TypeScript + env 校验全部通过
- `pnpm test` — 所有单元测试通过
- `pnpm run check:client-bundle` — 客户端 bundle 不含服务端 secret
