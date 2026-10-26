# CLAUDE.md

本仓库的代理指导在 [`AGENTS.md`](./AGENTS.md)——那是**唯一事实来源**，开始任何工作前
先读它。

本文件只补充 Claude Code 特有的部分。

## 与用户级规则的关系

`AGENTS.md` 只描述本仓库特有的规约，不覆盖用户在 `~/.claude/CLAUDE.md` 中定义的全局
行为（TDD 周期、提交纪律、确认规则、语言偏好等）。用户级规则优先适用。

## 项目侧 Agent skills

- **Issue tracker**：GitHub Issues via `gh` CLI，Issue / PR 标题、正文、评论统一用中文。
  见 `docs/agents/issue-tracker.md`。
- **Triage labels**：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` /
  `wontfix`。见 `docs/agents/triage-labels.md`。
- **Domain docs**：单仓 single-context，根 `CONTEXT.md` + `docs/adr/`。
  见 `docs/agents/domain.md`。

## 维护

本仓库同时供多个 AI 代理使用，项目指导集中在 `AGENTS.md` 单一维护。新增或修改项目
规约时**改 `AGENTS.md`**，不要在本文件里复制一份——重复的内容会随代码演进而分歧。
