# Issue Tracker: GitHub Issues

本仓库使用 **GitHub Issues** 进行任务追踪。canonical remote 为
`Woods30/saas-tempalte.git`（远程名拼写 `saas-tempalte` 缺字母 `l`，建议后续重命名）。

## 语言

Issue / Pull Request 的**标题、正文、评论**统一使用**中文**。
技术专有名词、命令、库名、文件路径保留英文原文；中文与半角英数字之间
添加一个半角空格；标点使用标准中文全角标点。

## 接口（保留英文以便 `gh` CLI 直接调用）

- **创建 issue**：`gh issue create --title "..." --body "..."`，多行正文用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，配合 `jq` 过滤评论与标签。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[--body]}]'`，
  按需加 `--label`、`--state` 过滤。
- **评论**：`gh issue comment <number> --body "..."`
- **添加 / 移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库信息从 `git remote -v` 推断；在 clone 内运行 `gh` 时自动识别。

## 标签

Triage 标签详见 `triage-labels.md`。其他标签（如 `bug`、`feature`、`chore`）按需创建。

## 标题与正文约定

- 标题：祈使句现在时，≤ 72 字符，中文优先。
- 正文结构：背景 → 复现步骤或规格 → 验收标准。
- 关联：`Closes #<n>`、`Refs #<n>`、`Blocked by #<n>`。
- 一事一题；细分事项用 checklist 或 sub-issue。

## Pull Request 作为请求来源

PR 默认**不**进入 triage 队列。如需将外部 PR 视为工作请求，把下方标志改为 `true`。
`triage` skill 会读取此标志。

```
prs-as-requests: false
```

PR 启用为请求来源时使用 `gh pr` 系列命令：

- 读取：`gh pr view <number> --comments`、`gh pr diff <number>`
- 列出外部 PR：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`
  保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`NONE`
  的项（丢弃 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- 评论 / 标签 / 关闭：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用编号空间，裸 `#42` 可能两者皆是：用
`gh pr view 42` 与 `gh issue view 42` 分别探测。

## 与上层 skill 的映射

- 当 skill 说"发布到 issue tracker"：创建 GitHub issue。
- 当 skill 说"获取相关 ticket"：执行 `gh issue view <number> --comments`。

## Wayfinding 操作（供 `/wayfinder` 使用）

- **Map**：单个带 `wayfinder:map` 标签的 issue，正文包含 Notes / Decisions-so-far / Fog。
  创建：`gh issue create --label wayfinder:map`。
- **子任务**：作为 GitHub sub-issue 关联到 map。若仓库未启用 sub-issues，则
  在 map 正文用 task list 维护，并在子任务正文顶部写 `Part of #<map>`。
  子任务标签：`wayfinder:<type>`（`research` / `prototype` / `grilling` / `task`）。
  一旦认领，分配给驱动开发的开发者。
- **阻塞关系**：使用 GitHub 原生 issue dependencies（UI 可见）——通过
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`
  添加边，其中 `<blocker-db-id>` 为 blocker 的**数据库 id**（不是 `#number` 也
  不是 `node_id`，获取方式：`gh api repos/<owner>/<repo>/issues/<n> --jq .id`）。
  GitHub 返回的 `issue_dependencies_summary.blocked_by` 反映**未关闭**的
  blocker 数量，作为实时门槛。若不支持原生依赖，回退到子任务正文顶部的
  `Blocked by: #<n>, #<n>` 行。
- **Frontier 查询**：列出 map 的开放子任务，剔除存在未关闭 blocker 的项
  （或 `Blocked by` 行中提及的开放 issue）以及已分配项；按 map 顺序取首项。
- **认领（Claim）**：`gh issue edit <n> --add-assignee @me`，作为本会话的首次写入。
- **解决（Resolve）**：`gh issue comment <n> --body "<回答>"`，然后
  `gh issue close <n>`，再将上下文指针（gist + 链接）追加到 map 的
  Decisions-so-far 段落。