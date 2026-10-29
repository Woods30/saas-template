# Jerbix 首页更新实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的最佳实践文案、B 循环动效与 $99 模板营销内容落地正式首页。

**Architecture:** LandingPage 更新内容装配，SourceProductDemo 管理局部动画状态和生命周期。首页不加载支付目录，公开 template 配置选择现有 Checkout 的商品和选项，使用独立模板价格引用。

**Tech Stack:** React 19、TanStack Router、Paraglide、Tailwind、Base UI Button、Vitest、Playwright。

**Spec:** docs/superpowers/specs/2026-10-28-landing-refresh-design.md

## Global Constraints

- 中文首屏文案采用已确认原文；全部 locale 配对，渲染期求值。
- 模板 $99 USD 一次性，全部源码、永久支持、免费升级。
- 默认 6000ms 循环；850ms 品牌、1800ms 页面、3000ms 部署示意。
- 语义 token、现有上游组件，不新增依赖，不改 ui/ 或生成物。
- 不提交、推送、部署，不操作远程支付资源或生产数据库。

## Review Focus

- 首页购买选择独立模板商品，调用现有 Checkout；价格缺失或与 USD 99 一次性不符时拒绝收款。
- 减少动态效果偏好初始与运行时切换均不继续计时。
- 隐藏页面、卸载、暂停必须清理计时，恢复后不得叠加循环。
- 连续切换 locale 时标题、演示文案和链接跟随语言。
- docs/payment 开关关闭后首页仍显示模板价值，文档 CTA 回退功能区，购买按钮遵守模块开关。

### Task 1: 首页内容与循环演示

**Files:**
- Create: src/components/marketing/SourceProductDemo.tsx
- Modify: src/components/marketing/LandingPage.tsx、src/config/website.ts、src/routes/{-$locale}/index.tsx、messages/zh.json、messages/en.json
- Test: tests/components/landing.test.tsx

**Interfaces:**
- SourceProductDemo({ replayKey, onMotionChange })：replayKey 为 number，onMotionChange: (running: boolean) => void 将暂停/后台/减少动态状态同步至整页 data-motion；内部管理阶段，重播清零、暂停保留进度。
- LandingPage 无 catalog props；路由直接渲染。
- WebsiteConfig.template: { priceUsd: number; productId: string; offerId: string }，缺省 99、template 和 once；products.ts 配置 once: jerbix_template。

- [x] Step 1: 重写首页用例，断言已确认双语文案、Slogan、$99 单价权益、全功能集合及无演示套餐；保留 workflow、语言预览与 FAQ 测试。新增假时钟行为：完整两轮、暂停恢复重播、动态减少效果、后台恢复、卸载清理。配置切换用真实 singleton 保存恢复。
- [x] Step 2: locale 编译后执行 `pnpm exec vitest run --project components tests/components/landing.test.tsx`，确认缺失新标题与循环行为导致失败。
- [x] Step 3: 实现首屏 B 组件；替换旧跳鼠旅程与演示价格，补三价值点及功能文案。保留成熟技术与 workflow、品牌故事、FAQ，移除首页 loader。使用 Button、语义 token、Tabler。
- [x] Step 4: 执行 locale sort/compile 与首页测试，确认通过。

### Task 2: 验证与收尾

**Files:** 复用 Task 1 文件，必要时修正。

**Interfaces:** 消费 Task 1 完整首页。

- [x] Step 1: 运行 pnpm check、unit 和 components 全套、build、check:client-bundle；任何失败定位修复，不重复无关测试。
- [x] Step 2: 浏览器验证 /zh 与 /en、手机、深浅主题、自动循环与操作，不发起真实购买。
- [x] Step 3: 独立审阅最终变更，对实质问题补失败回归并修复，记录结果。保留工作区，不提交或推送。
