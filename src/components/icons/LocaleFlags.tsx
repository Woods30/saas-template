import type { Locale } from '@/lib/locale'

/** 精简国旗图标：Tabler 不含国旗，故内联。仅作视觉标识，语义由外层 `aria-label` 提供。 */
function CnFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 shrink-0" aria-hidden focusable="false">
      <rect width="24" height="16" fill="#DE2910" />
      <path d="M4 3l1.2 3.4H8.6L5.7 8.3l1 3.3L4 9.6 1.3 11.6l1-3.3L-.4 6.4h3.4z" fill="#FFDE00" />
    </svg>
  )
}

function UsFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 shrink-0" aria-hidden focusable="false">
      <rect width="24" height="16" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12, 14].map((y) => (
        <rect key={y} y={y} width="24" height="1" fill="#B22234" />
      ))}
      <rect width="10" height="8" fill="#3C3B6E" />
    </svg>
  )
}

const FLAGS = { zh: CnFlag, en: UsFlag } as const satisfies Record<Locale, unknown>

/** 按 locale 渲染对应国旗图标。 */
export function LocaleFlag({ locale }: { locale: Locale }) {
  const Flag = FLAGS[locale]
  return <Flag />
}
