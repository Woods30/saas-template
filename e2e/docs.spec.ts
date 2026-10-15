import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'docs')

/**
 * E2E: 文档站（docs）
 *
 * 覆盖三项用户报告的修复：
 * 1. `/docs` 重定向到与语言无关的 slug（不再出现 `/index.zh`）。
 * 2. 切换语言到英文不再 404 —— 同一 URL 在两种语言下都命中对应译文。
 * 3. 文档站使用独立 layout：只有侧边栏导航，不含营销站点 Navbar / Footer，
 *    语言切换器位于左下角。
 */
test.describe('Docs', () => {
  test('/docs 重定向到干净的 slug（无 index.zh）', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForURL('**/docs/**')
    expect(page.url()).not.toContain('index.zh')
    expect(page.url()).toMatch(/\/docs\/[a-z-]+$/)
  })

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

  test('文档站使用独立 layout：无营销 Navbar / Footer，语言切换在左下角', async ({ page }) => {
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
    // 语言切换器存在且在左下角工具条内。
    // 实现是图标按钮 + 菜单（`LocaleSwitcher` 的 Base UI `Menu`），不是原生 `<select>`。
    const toolbar = page.locator('aside').first()
    await expect(toolbar.getByRole('button', { name: '切换语言' })).toBeVisible()
    // 主题切换按钮与语言切换同在左下角工具条内。
    await expect(toolbar.getByRole('button', { name: /切换主题/ })).toBeVisible()
    // 文档 Logo 与网站一致，取自 websiteConfig 的 logoLight。
    await expect(page.locator('header img').first()).toHaveAttribute(
      'src',
      '/logo-horizontal-transparent.svg',
    )
  })

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
    // 条数从 `content/docs/` 的译文文件数派生：新增一篇文档不必回来改断言，
    // 但「侧边栏漏掉某篇」仍会被抓到（这正是本用例要防的）。
    await expect(sidebar.locator('a')).toHaveCount(
      readdirSync(docsDir).filter((f) => f.endsWith('.zh.md')).length,
    )
    // 身份认证是新增条目，确认它真的进了侧边栏。
    await expect(sidebar.getByRole('link', { name: '身份认证' })).toBeVisible()
  })

  test('右侧「本页目录」列出锚点且可跳转', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    const toc = page.getByRole('navigation', { name: '本页目录' })
    await expect(toc).toBeVisible()
    // 目录项指向正文标题的锚点；点击后页面滚动且标题带对应 id。
    await toc.getByRole('link', { name: '检查与部署' }).click()
    await expect(page).toHaveURL(/#/)
    await expect(page.locator('h2#检查与部署')).toBeVisible()
  })

  test('侧栏顶部搜索打开居中弹窗，可过滤并跳转', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    // 等待 hydration 完成，否则点击发生在 React 绑定事件之前（弹窗不会打开）。
    await page.waitForLoadState('networkidle')

    // 侧栏只有触发器，弹窗在屏幕居中打开。
    await page.getByRole('button', { name: '搜索文档' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    if (box && viewport) {
      // 水平居中：左右留白相差不超过 2px。
      const left = box.x
      const right = viewport.width - (box.x + box.width)
      expect(Math.abs(left - right)).toBeLessThanOrEqual(2)
    }

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

  test('正文显示最近更新日期', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await expect(page.getByText('最近更新 2026 年 10 月 15 日')).toBeVisible()
  })

  test('「下一步」渲染为带图标与描述的块状卡片，且与分页导航区分开', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    const section = page.locator('article section').last()
    await expect(section.getByText('下一步')).toBeVisible()

    const card = section.getByRole('link', { name: /网站配置/ })
    await expect(card).toBeVisible()
    // 主题图标 + 末尾箭头。
    await expect(card.locator('svg')).toHaveCount(2)
    // 卡片带说明文字。
    await expect(card).toContainText('全字段与开关语义')

    // 分页导航是另一个区块：只有方向箭头，没有描述文字与主题图标。
    const pager = page.locator('article > nav')
    await expect(pager.getByText('下一篇')).toBeVisible()
    await expect(pager.locator('svg')).toHaveCount(1)
  })

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

    // 偏好写在 cookie 上：刷新后由服务端读回，首屏即收起（不会闪一下再收）。
    await page.reload()
    // 等 hydration 完成再点，否则点击发生在 React 绑定事件之前（状态不会更新）。
    await page.waitForLoadState('networkidle')
    await expect(page.locator('aside').first()).toBeHidden()

    await page.getByRole('button', { name: '展开文档导航' }).click()
    await expect(page.locator('aside').first()).toBeVisible()
  })

  test('窄屏侧栏收进抽屉，不挤压正文', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    // 窄屏常驻侧栏会把正文挤成一条，因此默认隐藏。
    await expect(page.locator('aside').first()).toBeHidden()
    // 正文占满可用宽度。
    const article = page.locator('article')
    const articleBox = await article.boundingBox()
    expect(articleBox?.width ?? 0).toBeGreaterThan(300)

    // 顶部菜单按钮以抽屉形式打开。
    await page.getByRole('button', { name: '打开文档导航' }).click()
    const drawer = page.locator('aside').first()
    await expect(drawer).toBeVisible()
    const drawerBox = await drawer.boundingBox()
    expect(drawerBox?.width ?? 0).toBeGreaterThan(0)

    // Escape 关闭并归还焦点。
    await page.keyboard.press('Escape')
    await expect(page.locator('aside').first()).toBeHidden()
    await expect(page.getByRole('button', { name: '打开文档导航' })).toBeFocused()
  })

  test('左下角工具条在滚动时保持固定', async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    await page.goto('/docs/configuration')
    const toolbar = page.locator('aside > div').last()
    const before = await toolbar.boundingBox()
    await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(300)
    const after = await toolbar.boundingBox()
    // 工具条固定在视口底部：滚动后纵坐标不变。
    expect(after?.y).toBe(before?.y)
  })
})
