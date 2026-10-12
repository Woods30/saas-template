# Triage 标签

skill 用五个规范 triage 角色描述流转状态。下表左侧为角色名（保持英文以兼容
skill 实现），右侧为本仓库实际使用的标签字符串与中文含义。

| 角色（skill 名）   | 仓库标签           | 中文含义                                                   |
| ------------------ | ------------------ | ---------------------------------------------------------- |
| `needs-triage`     | `needs-triage`     | 维护者需要评估。                                            |
| `needs-info`       | `needs-info`       | 等待报告者补充信息。                                        |
| `ready-for-agent`  | `ready-for-agent`  | 范围清晰、可由自治代理后台执行。                            |
| `ready-for-human`  | `ready-for-human`  | 需人类判断、设计决策或外部动作。                            |
| `wontfix`          | `wontfix`          | 已 review，明确关闭且不处理。                                |

当 skill 提到某个角色（例如"应用 AFK-ready triage 标签"）时，使用上表中
"仓库标签"列的字符串通过 `gh issue edit --add-label` 应用。

如需更换标签名（例如仓库已有 `bug:triage`），编辑上表的"仓库标签"列。