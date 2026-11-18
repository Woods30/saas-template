import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { type ColumnDef, type RowData, tableFeatures, useTable } from '@tanstack/react-table'
import { type ReactNode, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 列表页的统一表格。
 *
 * 数据已经由路由 loader 取好并按页切分，因此这里只注册**行/列模型**：
 * 排序、筛选与分页都由 URL 与服务端负责，不在浏览器里做第二套。
 * 列定义刻意保持 `{ header, cell }` 的窄契约——各页的数据形状差异太大，
 * 暴露 accessor/sorting 反而会引诱业务在客户端再算一遍。
 */
const features = tableFeatures({})

export interface DataTableColumn<T> {
  /** 稳定列 id，同时作为列显隐开关的键。 */
  id: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
  headerClassName?: string
}

export interface DataTablePagination {
  /** 当前页，从 1 开始。 */
  page: number
  pageSize: number
  /** 符合筛选条件的总条数。 */
  total: number
  onPageChange: (page: number) => void
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (row: T) => string
  /** 行的 `data-testid`；给 e2e 留的定位锚点。 */
  rowTestId?: (row: T) => string
  /** 工具行：搜索、筛选与页面级操作。 */
  toolbar?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  /** 空状态的图标，保持与各页既有视觉一致。 */
  emptyIcon?: ReactNode
  emptyAction?: ReactNode
  loading?: boolean
  error?: string | null
  /** 省略则不分页（整表一次取回）。 */
  pagination?: DataTablePagination
  /** 列显隐。属于本地 UI 状态，不进 URL。 */
  columnVisibility?: Record<string, boolean>
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  rowTestId,
  toolbar,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  loading = false,
  error = null,
  pagination,
  columnVisibility,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(
    () => columns.filter((column) => columnVisibility?.[column.id] ?? true),
    [columns, columnVisibility],
  )

  // `RowData` 是 react-table 对行数据的内部约束（`Record<string, any> | any[]`），
  // 而本仓的数据类型多为 `interface`，不满足其索引签名。约束只在本文件内消化，
  // 对外仍保持宽松的泛型，调用方不必为表格改数据结构。
  const tableColumns = useMemo<ColumnDef<typeof features, RowData>[]>(
    () =>
      visibleColumns.map((column) => ({
        id: column.id,
        header: column.header,
        cell: (context) => column.cell(context.row.original as T),
      })),
    [visibleColumns],
  )

  const table = useTable({
    features,
    columns: tableColumns,
    data: data as unknown as RowData[],
  })
  const rows = table.getRowModel().rows

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1
  // 数据变少时页码可能越界，夹到有效范围而不是渲染空表。
  const page = pagination ? Math.min(pagination.page, totalPages) : 1

  return (
    <div className="space-y-4">
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Spinner />
          {m.common_loading()}
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            {emptyIcon && <EmptyMedia variant="icon">{emptyIcon}</EmptyMedia>}
            <EmptyTitle>{emptyTitle ?? ''}</EmptyTitle>
            {emptyDescription && <EmptyDescription>{emptyDescription}</EmptyDescription>}
          </EmptyHeader>
          {/* 主操作放 `EmptyContent`：`Empty` 是 `flex-1` 竖排，裸放会被挤到左侧。 */}
          {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
        </Empty>
      ) : (
        // 统一的表格外观（圆角描边）由这里给出，各页不必再自己包一层。
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((column) => (
                  <TableHead key={column.id} className={column.headerClassName ?? column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const item = row.original as T
                return (
                  <TableRow key={rowKey(item)} data-testid={rowTestId?.(item)}>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id} className={column.className}>
                        {column.cell(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pagination && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{m.pagination_status({ page, total: totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => pagination.onPageChange(page - 1)}
            >
              <IconChevronLeft className="size-4" aria-hidden />
              {m.pagination_previous()}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => pagination.onPageChange(page + 1)}
            >
              {m.pagination_next()}
              <IconChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
