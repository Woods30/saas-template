# ADR-0002: Biome `noLabelWithoutControl` 规则禁用

- **状态**：Accepted
- **日期**：2026-10-13

## 背景

Biome 的 `a11y/noLabelWithoutControl` 规则要求所有 `<label>` 元素必须关联一个可访问的表单控件（通过 `htmlFor` 或嵌套）。shadcn/ui 的 `<Label>` 组件通过 spread props 传递 `htmlFor`（如 `<Label htmlFor="password">`）， Biome 无法追踪 spread 属性的值，因此会将每个 shadcn `<Label>` 误报为缺失关联控件。

## 决策

在 `biome.json` 中全局禁用 `a11y/noLabelWithoutControl` 规则：

```json
"a11y": {
  "noLabelWithoutControl": "off"
}
```

## 后果

- ✅ 与 shadcn/ui 模式兼容，无需逐文件 suppress
- ⚠️ 失去该规则对非 shadcn 手写 `<label>` 的保护，需由开发者自行保证 `htmlFor` 正确关联
