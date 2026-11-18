import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table'
import { setLocale } from '@/locale/paraglide/runtime.js'

interface Row {
  id: string
  name: string
  amount: number
}

const ROWS: Row[] = [
  { id: 'a', name: '甲', amount: 10 },
  { id: 'b', name: '乙', amount: 20 },
]

const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'name', header: '名称', cell: (row) => row.name },
  { id: 'amount', header: '金额', cell: (row) => row.amount, className: 'text-right' },
]

beforeEach(() => {
  setLocale('zh', { reload: false })
})

describe('DataTable', () => {
  it('渲染表头与每行的单元格', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} rowKey={(row) => row.id} />)

    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '金额' })).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    // 一行表头 + 两行数据。
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).getByText('甲')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('20')).toBeInTheDocument()
  })

  it('数据为空时渲染空状态，不渲染表格', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        rowKey={(row) => row.id}
        emptyTitle="暂无数据"
        emptyDescription="换个条件再试"
      />,
    )

    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('换个条件再试')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('错误优先于空状态展示', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        rowKey={(row) => row.id}
        error="加载失败"
        emptyTitle="暂无数据"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('加载失败')
  })

  it('加载中不渲染表格', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} rowKey={(row) => row.id} loading />)

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })

  it('分页展示页码，按页回调上一页/下一页', () => {
    const onPageChange = vi.fn()
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        pagination={{ page: 2, pageSize: 2, total: 6, onPageChange }}
      />,
    )

    expect(screen.getByText('第 2 / 共 3 页')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('首页禁用上一页，末页禁用下一页', () => {
    const { rerender } = render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 2, total: 6, onPageChange: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()

    rerender(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        pagination={{ page: 3, pageSize: 2, total: 6, onPageChange: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('列显隐只影响渲染，不改变数据', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        columnVisibility={{ amount: false }}
      />,
    )

    expect(screen.queryByRole('columnheader', { name: '金额' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument()
  })

  it('工具栏渲染在表格上方', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        toolbar={<input aria-label="搜索" />}
      />,
    )

    expect(screen.getByRole('textbox', { name: '搜索' })).toBeInTheDocument()
  })
})
