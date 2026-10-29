import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { m } from '@/locale/paraglide/messages.js'
import type { PricingProduct, ProductPrice } from '@/types/pricing'

export type { PricingInterval, PricingProduct, ProductPrice } from '@/types/pricing'

export interface PricingProps {
  title?: string
  subtitle?: string
  /** 产品列表；每个产品的付费方式由产品定义决定。 */
  products: PricingProduct[]
  initialSelection?: { productId: string; offerId: string }
  /**
   * 渲染自定义 CTA（用于接 authClient + startCheckout）。
   *
   * `option` 可能为 `undefined`：免费档没有付费方式，它仍然要渲染 CTA
   * （走「注册 / 进控制台」而不是结账）。
   */
  renderCta?: (product: PricingProduct, option: ProductPrice | undefined) => ReactNode
}

/**
 * 定价卡片列表。一个产品有多个付费方式时，卡片内只显示选中的那个——
 * 同时列出月付与年付会被误读成要付两份钱。
 *
 * 渲染的金额来自 Stripe 的实时价格（`product.options` 由 `mergePricingProducts` 填好），
 * 不是写死的文案常量：展示价与实际扣款价必须是同一个数。
 */
export function Pricing({ title, subtitle, products, renderCta, initialSelection }: PricingProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            renderCta={renderCta}
            initialOffer={
              initialSelection?.productId === product.id ? initialSelection.offerId : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}

/**
 * 单个产品的卡片。
 *
 * 付费方式的切换器放在卡内而不是页面顶部：不同产品的付费方式可以完全不同
 * （订阅产品有月付 / 年付，买断产品只有一次性），一个全局切换器无法表达
 * 「切到一次性」对买断产品意味着什么。
 */
function ProductCard({
  product,
  renderCta,
  initialOffer,
}: {
  product: PricingProduct
  initialOffer?: string
  renderCta?: (product: PricingProduct, option: ProductPrice | undefined) => ReactNode
}) {
  // 默认选第一个已配置价格的付费方式；没有价格时保持 `undefined`（只渲染 CTA）。
  const [selected, setSelected] = useState<string | undefined>(
    initialOffer ?? product.options[0]?.id,
  )
  const option = resolveOption(product, selected)
  // 多个购买选项在卡片内选择，支持订阅与一次性混合。
  const switchable = product.options

  return (
    <div
      className={`relative flex flex-col rounded-lg border p-6 ${
        product.recommended ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border'
      }`}
    >
      {(product.recommended ? m.pricing_recommended() : '') && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          {product.recommended ? m.pricing_recommended() : ''}
        </span>
      )}
      <h3 className="text-xl font-semibold">{product.name}</h3>
      {product.description && (
        <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
      )}
      {switchable.length > 1 && (
        // `fieldset` 而不是 `div[role=group]`：Biome 的 `noGroupSemanticElements` 要求
        // 一组语义上相关的控件用原生元素表达，而不是靠 ARIA 硬套角色。
        <fieldset className="mt-4 w-fit rounded-lg border border-border p-1">
          <legend className="sr-only">{product.name}</legend>
          <div className="flex gap-1 text-sm">
            {switchable.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === option?.id}
                onClick={() => setSelected(item.id)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  item.id === option?.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 space-y-1">
        {option && (
          <p className="text-2xl font-bold">
            {(
              option.amount /
              10 **
                (new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: option.currency,
                }).resolvedOptions().maximumFractionDigits ?? 2)
            ).toLocaleString('en-US', {
              style: 'currency',
              currency: option.currency.toUpperCase(),
            })}
            {option.interval && option.interval !== 'one_time' && (
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                /
                {option.intervalCount && option.intervalCount > 1 ? `${option.intervalCount} ` : ''}
                {option.interval === 'month'
                  ? 'mo'
                  : option.interval === 'year'
                    ? 'yr'
                    : option.interval}
              </span>
            )}
          </p>
        )}
        <YearlySavingHint product={product} option={option} />
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {product.features.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list
          <li key={i} className="flex gap-2">
            <span aria-hidden>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {renderCta ? (
          renderCta(product, option)
        ) : (
          <Link
            to="/{-$locale}"
            hash="pricing"
            className="rounded bg-primary px-4 py-2 text-center text-primary-foreground"
          >
            {m.pricing_pro_cta()}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * 选中的付费方式。
 *
 * 选中的周期没有对应价格时（配置里配了月付与年付，但 Stripe 上只配了月付）退回
 * 第一个有价格的方式：给用户一个真实可买的价格，好过显示空白。
 */
function resolveOption(product: PricingProduct, id: string | undefined): ProductPrice | undefined {
  if (product.options.length === 0) return undefined
  if (id) {
    const match = product.options.find((option) => option.id === id)
    if (match) return match
  }
  return product.options[0]
}

/**
 * 年付相对月付的月度节省比例。
 *
 * 两个数都是 Stripe 上的真实价格（不是写死的展示文案），所以这个折扣不会骗人。
 * 只在选中年付时提示。
 */
function YearlySavingHint({
  product,
  option,
}: {
  product: PricingProduct
  option: ProductPrice | undefined
}) {
  if (option?.interval !== 'year' || (option.intervalCount ?? 1) !== 1) return null
  const month = product.options.find(
    (item) =>
      item.interval === 'month' &&
      (item.intervalCount ?? 1) === 1 &&
      item.currency === option.currency,
  )
  if (!month?.amount || !option.amount) return null
  const monthlyEquivalent = option.amount / 12
  const percent = Math.round((1 - monthlyEquivalent / month.amount) * 100)
  if (!Number.isFinite(percent) || percent <= 0) return null
  return (
    <p className="text-sm text-muted-foreground">
      <Badge variant="secondary" className="mr-2">
        -{percent}%
      </Badge>
      {m.pricing_yearly_hint({ percent })}
    </p>
  )
}
