// 仅保持 `@/lib/utils` 的既有约定（components.json 的 aliases.utils 指向该路径）。
// 切勿另写朴素的 join 实现，也不要重复引入 clsx / tailwind-merge。
export { cn } from 'cn'
