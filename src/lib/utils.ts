// shadcn 4.x 的组件统一从 npm 包 `cn` 导入（clsx + tailwind-merge 的合并替代品），
// 不再生成此文件。这里只做 re-export，保持 `@/lib/utils` 的既有约定（components.json
// 的 aliases.utils 指向该路径），切勿另写朴素的 join 实现，也不要重复引入 clsx /
// tailwind-merge。当前 `src/components/ui/*` 仍直接 `import { cn } from 'cn'`。
export { cn } from 'cn'
