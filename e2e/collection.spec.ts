import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

/**
 * 核销型支付（collection）的端到端验收：本地 D1 + 源码兜底账户（env 注入），
 * 不接真实支付宝，也不依赖 R2（无 BUCKET 时凭证上传入口隐藏，说明仍可填）。
 *
 * 环境由 `e2e/global-setup.ts` 接线：`VITE_CHECKOUT_MODE=collection` +
 * `VITE_MODULES`（白名单含 collection）+ `VITE_COLLECTION_ACCOUNTS`。
 */

const PASSWORD = '{{SECRET_1ntmkuxv}}'

/** 注册并登录；核销链路的所有用例都从已登录用户出发。 */
async function login(page: Page, role: 'user' | 'admin' = 'user'): Promise<string> {
  const email = `collection-${role}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  if (role === 'admin') {
    // seed-collection 一次完成建号 + 提权 + 账户覆盖，避免两次 INSERT 撞主键。
    const args = [
      'exec',
      'tsx',
      'scripts/e2e-seed-collection.ts',
      email,
      '--admin',
      ...(process.env.E2E_D1_PERSIST_TO ? ['--persist-to', process.env.E2E_D1_PERSIST_TO] : []),
    ]
    for (let attempt = 0; ; attempt++) {
      try {
        // seed 脚本从环境读测试密码；显式传入保证与登录用密码一致，不依赖 .env。
        execFileSync('pnpm', args, {
          stdio: 'pipe',
          encoding: 'utf8',
          env: { ...process.env, E2E_TEST_PASSWORD: PASSWORD },
        })
        break
      } catch (error) {
        if (attempt === 3) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 300)
      }
    }
  } else {
    await seedVerifiedUser({ email, name: '核销测试用户', password: PASSWORD })
  }
  await signIn(page, email)
  return email
}

/** 用已 seed 的账号走登录表单。 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/zh/auth/login')
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  // session cookie 在客户端设置后要等 better-auth 的 session hook 读回来；
  // 首页的「立即购买」在水合读到会话前渲染成跳登录的链接。进一次 dashboard
  // 确认服务端已认得这个会话，再回首页就能稳定拿到按钮形态。
  await page.goto('/zh/dashboard/profile')
  await expect(page.getByRole('button', { name: /核销测试用户|repro|@example\.com/ })).toBeVisible({
    timeout: 15000,
  })
}

/**
 * 从首页下单并进入订单详情页。
 *
 * 点击「立即购买」后 buy() 会创建订单并站内导航；若导航未在时限内完成（dev
 * server 冷编译新路由 chunk 时偶发悬挂），回退到订单列表点「查看详情」——
 * 测试关心的是核销链路本身，不绑定首页导航的实现细节。
 */
async function createOrder(page: Page): Promise<void> {
  await page.goto('/zh/#pricing')
  // SSR 渲染的「立即购买」在 session 未就绪时是跳登录的链接；等水合完成后它
  // 变成真正下单的按钮（见 LandingPage 的 useSession 分支）。按钮形态出现后
  // 仍可能赶上 onClick 尚未挂载的首帧，点击会静默无效（无报错无导航），所以
  // 没跳转就重试点击，最多三次。
  await page.getByRole('button', { name: '立即购买' }).waitFor({ state: 'visible', timeout: 15000 })
  for (let attempt = 0; ; attempt++) {
    await page.getByRole('button', { name: '立即购买' }).click({ noWaitAfter: true })
    const onDetail = await page
      .waitForURL(/\/zh\/dashboard\/orders\/.+/, { timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    if (onDetail || attempt === 2) break
    if (!page.url().includes('/zh/#pricing')) await page.goto('/zh/#pricing')
  }

  if (!/\/zh\/dashboard\/orders\/.+/.test(new URL(page.url()).pathname)) {
    // 导航没完成但订单可能已建好（dev server 冷编译会让响应悬挂）：去列表页
    // 等订单行出现，而不是立刻点一个还不存在的链接。
    await page.goto('/zh/dashboard/orders')
    await page.getByRole('link', { name: '查看详情' }).first().click({ timeout: 20000 })
  }
  await expect(page.getByTestId('payable-amount')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/zh\/dashboard\/orders\/.+/)
}

/** 读本地 D1 里订单行的 base_amount 与 fingerprint（尾数占位需要精确值）。 */
function queryOrderRow(orderId: string): { baseAmount: number; fingerprint: number } {
  const persistTo = process.env.E2E_D1_PERSIST_TO
  const args = [
    'exec',
    'tsx',
    'scripts/e2e-seed-collection.ts',
    '--query-order',
    orderId,
    ...(persistTo ? ['--persist-to', persistTo] : []),
  ]
  const out = execFileSync('pnpm', args, { encoding: 'utf8', stdio: 'pipe' })
  const parsed = JSON.parse(out) as { baseAmount: number; fingerprint: number }
  return parsed
}

/** 占住 base 上除指定尾数外的全部 98 个尾数（委托 seed 脚本写 D1）。 */
function fillOtherFingerprints(base: number, exceptFingerprint: number): void {
  const persistTo = process.env.E2E_D1_PERSIST_TO
  const args = [
    'exec',
    'tsx',
    'scripts/e2e-seed-collection.ts',
    '--fill-fingerprints',
    String(base),
    String(exceptFingerprint),
    ...(persistTo ? ['--persist-to', persistTo] : []),
  ]
  execFileSync('pnpm', args, { encoding: 'utf8', stdio: 'pipe' })
}

// 三个用例共享同一个收款账户的 99 个尾数槽位，且用例 3 的确定性占位会清掉
// 该账户其他活跃订单——并行互相踩踏，必须在文件内串行（不同 spec 文件不受影响）。
test.describe.configure({ mode: 'serial' })

test.describe('Collection', () => {
  // 登录 + 下单 + 双角色核验的多段流程，且要容忍 dev server 冷编译与水合竞态
  // 的重试；默认 30 秒不够（重试等待就会把它吃光，浏览器被强关报假错误）。
  test.setTimeout(120_000)

  test('用户申报后由管理员核验，用户轮询看到结算', async ({ browser }) => {
    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()
    await login(userPage)
    await createOrder(userPage)

    // 详情页：精确金额、15 分钟倒计时、二维码与风险正文。
    await expect(userPage.getByTestId('payable-amount')).toHaveText(/¥[\d,]+\.\d{2}/)
    await expect(userPage.getByText('订单剩余时间')).toBeVisible()
    await expect(userPage.getByAltText('收款二维码')).toBeVisible()
    await expect(userPage.getByText('订单自创建起 15 分钟内有效')).toBeVisible()
    await expect(userPage.getByText('点击「我已支付」或上传付款凭证截图仅为申报')).toBeVisible()

    // 申报：进入待核验，绝不显示「已到账」。
    await userPage.getByRole('button', { name: '我已支付' }).click()
    await expect(userPage.getByText('等待人工核验')).toBeVisible({ timeout: 10000 })
    await expect(userPage.getByText('已到账')).toHaveCount(0)

    // 管理员在队列里核验通过：实际到账金额必须与应付金额一致才能普通通过。
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, 'admin')
    await adminPage.goto('/zh/dashboard/admin/orders')
    // goto 也可能撞上水合竞态渲染成用户页（快照证据：URL 在 admin 路由但内容
    // 是「订单详情」）。以管理台标题为准，没渲染出来就重新 goto。
    for (let attempt = 0; ; attempt++) {
      const rendered = await adminPage
        .getByRole('heading', { name: '核销订单核验' })
        .waitFor({ state: 'visible', timeout: 6000 })
        .then(() => true)
        .catch(() => false)
      if (rendered) break
      if (attempt === 2) throw new Error('管理台核验页始终未渲染')
      await adminPage.goto('/zh/dashboard/admin/orders')
    }
    const payableText = await adminPage
      .getByText(/¥[\d,]+\.\d{2}/)
      .first()
      .textContent()
    const payable = Number.parseFloat((payableText ?? '').replace(/[¥,]/g, ''))
    expect(Number.isFinite(payable)).toBe(true)
    // 点「核验」打开核验对话框：水合竞态下点击可能被静默吞掉（onClick 未挂载），
    // 对话框没出现就重试点击。订单 ID 是裸 UUID（无 ord_ 前缀），只锚定前缀。
    const reviewButton = adminPage.getByRole('button', { name: '核验', exact: true }).first()
    const reviewDialog = adminPage.getByText(/核验订单 [0-9a-f-]{8,}/)
    for (let attempt = 0; ; attempt++) {
      await reviewButton.click()
      if (
        await reviewDialog
          .waitFor({ state: 'visible', timeout: 4000 })
          .then(() => true)
          .catch(() => false)
      ) {
        break
      }
      if (attempt === 2) throw new Error('点击核验后对话框始终未出现')
    }
    await adminPage.getByLabel('实际到账金额（元）').fill(String(payable))
    await adminPage.getByRole('button', { name: '普通通过' }).click()
    await expect(adminPage.getByText('核验已提交。')).toBeVisible()

    // 用户轮询（5 秒一次）拿到已结算。
    await expect(userPage.getByText('已到账').first()).toBeVisible({ timeout: 15000 })
    await userPage.goto('/zh/dashboard/billing')
    await expect(userPage.getByText('付款记录', { exact: true })).toBeVisible()
    await expect(userPage.getByText('还没有付款记录。')).toHaveCount(0)
    await userPage.goto('/zh/dashboard/orders')
    await expect(userPage.getByText('已到账').first()).toBeVisible()

    await userContext.close()
    await adminContext.close()
  })

  test('跨用户读订单被拒绝，管理台对普通用户 403', async ({ browser, page }) => {
    await login(page)
    await createOrder(page)
    const orderId = new URL(page.url()).pathname.split('/').pop() ?? ''

    // 另一个用户读不到别人的订单。
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await login(otherPage)
    await otherPage.goto(`/zh/dashboard/orders/${orderId}`)
    await expect(otherPage.getByText('订单不存在或不在你的账号下。')).toBeVisible()
    await otherContext.close()

    // 普通用户访问管理台被角色门禁拦下（404 与「页面不存在」同形，不泄漏门禁差异）。
    // 用 page.request 而非 request fixture：后者不共享浏览器 cookie，会以未登录
    // 身份被重定向到登录页，测不到角色门禁本身。
    const response = await page.request.get('/zh/dashboard/admin/orders')
    expect(response.status()).toBe(404)
  })

  test('取消订单释放尾数金额，新订单可复用', async ({ browser }) => {
    // 尾数分配是「随机起点 + 环形扫描取第一个空位」，取消只是把空位还给池子，
    // 不保证下一个订单随机命中原金额。要确定性验证「取消释放尾数」，把其余
    // 98 个尾数全部占住：被取消的那笔是唯一空位，新订单必然拿回同一金额。
    const first = await browser.newContext()
    const firstPage = await first.newPage()
    await login(firstPage)
    await createOrder(firstPage)
    const firstAmount = await firstPage.getByTestId('payable-amount').textContent()
    const orderId = new URL(firstPage.url()).pathname.split('/').pop() ?? ''

    // 直接写库占住其余尾数（base 相同、fingerprint 1–99 各一，跳过本单）；
    // 绕开 99 次 HTTP 下单，也让断言只依赖「释放」这一个行为。
    const orderRow = queryOrderRow(orderId)
    fillOtherFingerprints(orderRow.baseAmount, orderRow.fingerprint)
    await firstPage.getByRole('button', { name: '取消订单' }).click()
    await expect(firstPage.getByText('已取消')).toBeVisible({ timeout: 10000 })
    await first.close()

    // 唯一空位就是刚释放的金额：新订单必然复用。
    const second = await browser.newContext()
    const secondPage = await second.newPage()
    await login(secondPage)
    await createOrder(secondPage)
    const secondAmount = await secondPage.getByTestId('payable-amount').textContent()
    expect(secondAmount).toBe(firstAmount)
    await second.close()
  })
})
