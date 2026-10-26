---
title: 快速开始
description: 从克隆到上线的一条线：跑起来、改站点信息、部署
locale: zh
order: 1
group: start
updated: 2026-10-21
---

这页带你从克隆仓库走到线上可访问。全程只有四个阶段，每一步都给出可复制的命令。

做完之后你会得到一个跑在 Cloudflare Workers 上的站点，名称、Logo、导航都是你自己的。

## 前提条件

| 需要 | 说明 |
|---|---|
| Node.js 22 / 24 | 偶数 LTS。奇数版本（23 / 25）不受 `vitest@5` 支持 |
| pnpm | 版本由 `package.json` 的 `packageManager` 指定，不要用 pnpm 9 |
| Cloudflare 账号 | 免费套餐足够。没有也能先在本地跑通 |

```bash
node --version   # v22.x 或 v24.x
pnpm --version
```

## 设置

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置本地资源

```bash
pnpm run setup
```

脚本会问你项目名，然后创建（或复用）D1 数据库、R2 bucket、KV namespace，生成认证密钥，
把结果写进 `.env` 与 `wrangler.jsonc`。

没有登录 Cloudflare 时脚本会提示，但仍可继续——本地开发用 D1 的 SQLite 模拟，
不需要真实资源。登录方式：

```bash
pnpm exec wrangler login
```

### 3. 启动

```bash
pnpm dev
```

打开 `http://localhost:3000`。若数据库没初始化成功，手动跑一次：

```bash
pnpm exec wrangler d1 migrations apply DB --local
```

### 4. 改站点信息

所有站点信息集中在 `src/config/website.ts`：

```ts
// src/config/website.ts
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: {
      name: 'Jerbix',                        // ← 改成你的站点名
      images: { ogImage: '/logo.png', /* … */ },
    },
    docs: { enabled: true },                 // ← 不需要文档站就改 false
    // …
  }
}
```

完整字段见[网站配置](./configuration)。

### 5. 部署

```bash
pnpm deploy
```

依次执行生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 → `wrangler deploy`。

> 本地 `.env` **不会**自动成为生产 secret。部署前需用 `wrangler secret put` 单独配置，
> 且**不得**把 secret 放进 `VITE_` 变量——它们会进入浏览器 bundle。

想推送到 `main` 就自动部署，见 [Cloudflare · 自动部署](./cloudflare#自动部署)。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器，端口 3000 |
| `pnpm build` | 生产构建 |
| `pnpm deploy` | 校验 → 构建 → 检查 → 部署 |
| `pnpm check` | Biome + TypeScript + env + locale（提交前必跑） |
| `pnpm test` | 单元与组件测试 |

## 参考资料

- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/) —— `wrangler.jsonc` 字段与 binding
- [Cloudflare D1](https://developers.cloudflare.com/d1/) —— 数据库创建与迁移

## 下一步

- [网站配置](./configuration)——改名称、Logo、模块开关
- [Cloudflare](./cloudflare)——配好账号与自动部署
- [目录结构](./project-structure)——改哪里一目了然
