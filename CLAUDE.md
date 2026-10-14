# CLAUDE.md

本文件是 Claude Code 的入口。**仓库的完整代理指导在 [`AGENT.md`](./AGENT.md)**——本文件
不重复其内容，只说明 Claude Code 特有的部分。

> 若 `AGENT.md` 与本文件冲突，以 `AGENT.md` 为准；若与用户在 `~/.claude/CLAUDE.md` 中
> 定义的全局规则冲突，以用户级规则为准。

## 必读

开始任何工作前，先读 [`AGENT.md`](./AGENT.md)。其中包含：

- 项目定位与技术栈
- 构建 / 检查 / 测试命令
- 架构要点与关键不变量（env 两层模型、`VITE_` 前缀规则、模块门禁、生成物禁改）
- 文档语言与变更纪律
- 需要向用户确认的操作清单
- 各类配置文档的位置索引

## Claude Code 特有

### Agent skills

- **Issue tracker**：GitHub Issues via `gh` CLI，Issue / PR 标题、正文、评论统一用中文。
  见 `docs/agents/issue-tracker.md`。
- **Triage labels**：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
  `wontfix`。见 `docs/agents/triage-labels.md`。
- **Domain docs**：单仓 single-context，根 `CONTEXT.md` + `docs/adr/`。
  见 `docs/agents/domain.md`。

### 其他代理兼容

本仓库同时供多个 AI 代理使用，因此项目指导集中在 `AGENT.md` 单一维护。新增或修改项目
规约时**改 `AGENT.md`**，不要在本文件里复制一份——重复的内容会随代码演进而分歧。
