import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'docs')

/**
 * E2E: 文档站（docs）
 *
 * 只守**跨行为的契约**：路由重定向、i18n 译文命中、侧栏结构与内容文件的一致性、
 * 搜索（快捷键 / 过滤 / 正文小节锚点）、TOC 与上下篇跳转、侧栏收起偏好的服务端回读。
 *
 * 刻意**不守纯布局**：顶栏是否隐藏、Logo 摆在侧栏还是顶栏、浮动工具条位置、窄屏抽屉
 * 尺寸、工具条是否 fixed 之类。它们改一次布局就全红，却抓不到真正的功能回归；
 * 改 docs 布局时手动过一遍即可（`pnpm dev` 后在 1280 与 390 两个宽度看一眼）。
 */
test.describe('Docs', () => {
  // 守：`/docs` 落到具体文档，且 URL 里不出现 `index.zh` 这类内容文件名。
  test('/docs 重定向到干净的 slug（无 index.zh）', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForURL('**/docs/**')
    expect(page.url()).not.toContain('index.zh')
    expect(page.url()).toMatch(/\/docs\/[a-z-]+$/)
  })

  // 守：同一 slug 在两种语言下都 200，且各自渲染对应译文（不是 404，也不是回落到另一语言）。
  test('同一 docs URL 在 zh / en 下都能打开（切换语言不 404）', async ({ page }) => {
    // zh：设置 cookie 后访问
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    const zhRes = await page.goto('/docs/getting-started')
    expect(zhRes?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('快速开始')

    // en：切换 cookie 后访问同一 URL，必须 200 且渲染英文
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3000' }])
    const enRes = await page.goto('/docs/getting-started')
    expect(enRes?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Getting Started')
  })

  // 守：docs 走独立 layout，没被并回营销站点；语言切换入口在文档站里可用。
  // 位置类断言（左下角、图标按钮）已移除——那是布局，不是契约。
  test('文档站使用独立 layout：无营销 Navbar / Footer，语言切换可用', async ({ page }) => {
    // 显式固定语言：无前缀 URL 会按 Accept-Language 协商，而 Playwright 默认 en-US，
    // 若不固定则按钮的 aria-label 变成英文，断言随运行环境漂移。
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    // 营销 Navbar 的特征：sticky top-0 z-40
    await expect(page.locator('nav.sticky')).toHaveCount(0)
    // 营销 Footer 的特征：包含版权符号
    await expect(page.getByText('保留所有权利')).toHaveCount(0)
    // 文档侧边栏导航存在（用 aria-label 精确定位，右侧「本页目录」是另一个 nav）
    await expect(page.getByRole('navigation', { name: '文档导航' })).toHaveCount(1)
    // 语言切换器存在：实现是图标按钮 + 菜单（`LocaleSwitcher` 的 Base UI `Menu`）。
    await expect(page.getByRole('button', { name: '切换语言' })).toBeVisible()
  })

  // 守：全局搜索快捷键接得上——按键 → 弹窗打开 → 输入框自动聚焦。
  test('⌘K / Ctrl+K 打开搜索弹窗', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('searchbox')).toBeFocused()
  })

  // 守：侧栏结构由 content 派生——组标题来自 frontmatter 的 `group`，条目数等于译文文件数。
  // 新增文档不必回来改断言，但「新增文档没进侧栏」会被抓到。
  test('侧边栏按 group 呈现二级结构', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    const sidebar = page.getByRole('navigation', { name: '文档导航' })
    // 组标题（frontmatter 的 group 字段）作为二级层级出现。
    await expect(sidebar.locator('section h2')).toHaveText(['开始', '配置', '功能模块'])
    // 组标题不可点击，只有文档条目是链接。
    await expect(sidebar.locator('h2 a')).toHaveCount(0)
    await expect(sidebar.locator('a')).toHaveCount(
      readdirSync(docsDir).filter((f) => f.endsWith('.zh.md')).length,
    )
  })

  // 守：TOC 的锚点与正文标题 id 一致，点击真的能跳过去。
  test('右侧「本页目录」列出锚点且可跳转', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    const toc = page.getByRole('navigation', { name: '本页目录' })
    await expect(toc).toBeVisible()
    await toc.getByRole('link', { name: '检查与部署' }).click()
    await expect(page).toHaveURL(/#/)
    await expect(page.locator('h2#检查与部署')).toBeVisible()
  })

  // 守：搜索的核心链路——空查询不出结果、关键词高亮、点击结果跳转、跳转后弹窗关闭。
  // 居中定位的几何断言已移除（布局）。
  test('搜索可过滤并跳转到命中文档', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    // 等待 hydration 完成，否则点击发生在 React 绑定事件之前（弹窗不会打开）。
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '搜索文档' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 默认不列出全部文档，只提示输入关键词。
    await expect(dialog.getByRole('link')).toHaveCount(0)

    await dialog.getByRole('searchbox').fill('支付')
    // 命中的关键词在结果里高亮（`<mark>`），便于一眼看出为什么这条被搜出来。
    await expect(dialog.locator('mark').first()).toHaveText('支付')
    await dialog.getByRole('link', { name: /支付/ }).first().click()
    await expect(page).toHaveURL(/\/docs\/payment/)
    // 跳转后弹窗关闭。
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  // 守：正文命中也进结果，且链接指向**小节锚点**而不是文档顶部。
  test('搜索命中正文时给出小节路径，可跳转到锚点', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '搜索文档' }).click()
    const dialog = page.getByRole('dialog')
    // 该短语只出现在「检查与部署」小节的正文里，不在任何标题或描述中。
    await dialog.getByRole('searchbox').fill('生产 env 校验')

    // 命中的小节以链接形式列出，指向该小节的锚点（中文锚点在 href 里是百分号编码的）。
    const sectionLink = dialog.getByRole('link', { name: /检查与部署/ })
    await expect(sectionLink).toBeVisible()
    expect(decodeURIComponent((await sectionLink.getAttribute('href')) ?? '')).toMatch(
      /#检查与部署$/,
    )
    await sectionLink.click()

    await expect(page).toHaveURL((url) => decodeURIComponent(url.hash) === '#检查与部署')
    await expect(page.locator('h2#检查与部署')).toBeVisible()
  })

  // 守：frontmatter 的 `updated` 真的渲染到页面上（内容管线没吞字段）。
  test('正文显示最近更新日期', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await expect(page.getByText('最近更新 2026 年 10 月 15 日')).toBeVisible()
  })

  // 守：`nextSteps` 渲染成指向目标文档的链接，且与「上一篇 / 下一篇」是不同区块。
  // 图标数量之类的视觉断言已移除（布局）。
  test('「下一步」渲染为指向目标文档的链接块', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    const section = page.locator('article section').last()
    await expect(section.getByText('下一步')).toBeVisible()

    const card = section.getByRole('link', { name: /网站配置/ })
    await expect(card).toBeVisible()
    // 卡片带说明文字。
    await expect(card).toContainText('全字段与开关语义')
  })

  // 守：上下篇按 `order` 自动生成——首篇只有「下一篇」，且指向正确文档。
  test('底部自动生成上一篇 / 下一篇导航', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    // 快速开始是首篇：只有「下一篇」。
    await page.goto('/docs/getting-started')
    const pager = page.locator('article > nav')
    await expect(pager.getByText('下一篇')).toBeVisible()
    await expect(pager.getByText('上一篇')).toHaveCount(0)
    await pager.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/docs\/configuration/)
  })

  // 守：收起偏好写在 cookie 上并由服务端读回——刷新后首屏即收起，不会闪一下再收。
  // 这是跨 SSR / 客户端的契约，不是纯布局断言。
  test('宽屏可收起侧栏，收起后刷新仍保持', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible()
    await page.getByRole('button', { name: '收起文档导航' }).click()
    await expect(sidebar).toBeHidden()

    await page.reload()
    // 等 hydration 完成再点，否则点击发生在 React 绑定事件之前（状态不会更新）。
    await page.waitForLoadState('networkidle')
    await expect(page.locator('aside').first()).toBeHidden()

    await page.getByRole('button', { name: '展开文档导航' }).click()
    await expect(page.locator('aside').first()).toBeVisible()
  })
})
