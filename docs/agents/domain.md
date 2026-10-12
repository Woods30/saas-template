# Domain Docs（领域文档消费规则）

工程 skill 在探查代码库前应按以下规则消费领域文档。

## 探索前先读这些文件

- 仓库根的 **`CONTEXT.md`**；若存在根级 **`CONTEXT-MAP.md`**，则它指向
  每个 context 的 `CONTEXT.md`，按主题读相关的那几份。
- **`docs/adr/`**：读取与即将工作的领域相关的 ADR。
  多 context 仓库还需要看 `src/<context>/docs/adr/`。

如果这些文件不存在，**静默继续**——不要主动建议创建。
`/domain-modeling` skill（通过 `/grill-with-docs` 与 `/improve-codebase-architecture`
触发）会在术语或决策真正产生时延迟创建它们。

## 文件结构

单仓（绝大多数项目）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多仓（仓库根存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 跨 context 决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 该 context 内的决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表词汇

输出涉及领域概念时（issue 标题、重构提案、假设、测试名），使用
`CONTEXT.md` 中定义的术语，不要漂移到术语表明确避免的同义词。

若所需概念尚未在术语表中，两种可能：要么你在使用项目没有的语言
（重新考虑），要么存在真实空缺（记入 `/domain-modeling` 待办）。

## 标注 ADR 冲突

若输出与现有 ADR 冲突，必须显式标注而非默默覆盖：

> _与 ADR-0007（事件溯源订单）冲突，但因 … 值得重新讨论。_

## 项目级增补

- 本仓库的设计规格位于 `docs/superpowers/specs/`，实施计划由 `writing-plans`
  skill 产出并归档在同一目录。
- 中文文档优先；术语表与 ADR 默认中文撰写，技术专有名词保留英文。