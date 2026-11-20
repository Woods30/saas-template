import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { m } from '@/locale/paraglide/messages.js'
import {
  FUNNEL_DIMENSIONS,
  FUNNEL_RANGES,
  type FunnelCounts,
  type FunnelDimension,
  type FunnelRange,
  type FunnelReport,
} from '@/modules/subscriptions/service'

/**
 * 转化漏斗。
 *
 * 三档始终共用同一 cohort（窗口内注册的用户），所以条形长度可横向比较：
 * 同一用户先注册，才可能创建结账，才可能付款。切换范围 / 维度只改查询参数，
 * 数据由路由 loader 重新取，组件本身不保存派生状态。
 */

export interface ConversionFunnelProps {
  report: FunnelReport
  range: FunnelRange
  groupBy: FunnelDimension
  onRangeChange: (range: FunnelRange) => void
  onGroupByChange: (dimension: FunnelDimension) => void
}

/** 范围文案必须在渲染期构造，否则切换语言后仍是旧文案。 */
function rangeLabels(): Record<FunnelRange, string> {
  return {
    '24h': m.admin_funnel_range_24h(),
    '7d': m.admin_funnel_range_7d(),
    '30d': m.admin_funnel_range_30d(),
  }
}

function dimensionLabels(): Record<FunnelDimension, string> {
  return {
    utm_source: m.admin_funnel_dim_utm_source(),
    utm_medium: m.admin_funnel_dim_utm_medium(),
    utm_campaign: m.admin_funnel_dim_utm_campaign(),
    utm_term: m.admin_funnel_dim_utm_term(),
    utm_content: m.admin_funnel_dim_utm_content(),
    referrer: m.admin_funnel_dim_referrer(),
    country: m.admin_funnel_dim_country(),
  }
}

const RANGE_VALUES = Object.keys(FUNNEL_RANGES) as FunnelRange[]

interface FunnelTier {
  key: keyof FunnelCounts
  label: string
}

function tiers(): FunnelTier[] {
  return [
    { key: 'signups', label: m.admin_funnel_signups() },
    { key: 'checkouts', label: m.admin_funnel_checkouts() },
    { key: 'paid', label: m.admin_funnel_paid() },
  ]
}

/** 分组值显示：空值已由查询层归一为 `direct`，这里只做文案替换。 */
function groupLabel(value: string): string {
  return value === 'direct' ? m.admin_funnel_direct() : value
}

export function ConversionFunnel({
  report,
  range,
  groupBy,
  onRangeChange,
  onGroupByChange,
}: ConversionFunnelProps) {
  const labels = rangeLabels()
  const dimensions = dimensionLabels()
  const funnelTiers = tiers()
  const dimensionItems = FUNNEL_DIMENSIONS.map((dimension) => ({
    value: dimension,
    label: dimensions[dimension],
  }))
  // 条形以最大的注册数为基准：各分组之间长度可比，不会每行各自拉满。
  const maxSignups = Math.max(1, ...report.rows.map((row) => row.signups))

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{m.admin_funnel_title()}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={(value) => onRangeChange(value as FunnelRange)}>
            <TabsList aria-label={m.admin_funnel_title()}>
              {RANGE_VALUES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {labels[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select
            value={groupBy}
            onValueChange={(value) => onGroupByChange(value as FunnelDimension)}
            items={dimensionItems}
          >
            <SelectTrigger size="sm" aria-label={m.admin_funnel_group_by()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dimensionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {funnelTiers.map((tier) => (
            <div key={tier.key}>
              <p className="text-xs text-muted-foreground">{tier.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{report.totals[tier.key]}</p>
            </div>
          ))}
        </div>

        {report.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.admin_funnel_empty()}</p>
        ) : (
          <div className="space-y-4">
            {report.rows.map((row) => (
              <div key={row.value} className="space-y-1.5">
                <p className="text-sm font-medium">{groupLabel(row.value)}</p>
                {funnelTiers.map((tier) => (
                  <div key={tier.key} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground">{tier.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(row[tier.key] / maxSignups) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">{row[tier.key]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
