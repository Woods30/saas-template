/**
 * 自定义键值配置面板（占位）。
 *
 * 自定义配置不来自注册表，按 `custom.<key>` 存在 `settings` 表。
 * TODO(task 8): 由 Task 8 替换为完整的新增 / 修改 / 删除表格。
 */
export function CustomConfigPanel() {
  return (
    <p className="text-sm text-muted-foreground">
      自定义键值配置将在此处提供，用于补充注册表之外的站点设置。
    </p>
  )
}
