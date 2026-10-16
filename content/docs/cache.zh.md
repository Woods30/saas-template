---
title: 缓存
description: Cloudflare KV 的创建、绑定与缓存 API
locale: zh
order: 17
group: config
updated: 2026-10-16
---

服务端缓存走 **Cloudflare KV**，经 `CACHE` binding 访问。代码在 `src/cache/`。

适合缓存「读多写少、短暂过期可接受」的数据：第三方状态查询、公开列表、慢接口的结果。
不适合需要强一致或高频写入的数据——KV 的写入有延迟传播。

## 设置

### 配置 API Token

Token 需含 **Account → Workers KV Storage → Edit**。见 [Cloudflare](./cloudflare)。

### 创建 namespace

```bash
pnpm exec wrangler kv namespace create saas-template-cache
```

输出里的 `id` 回填到 `wrangler.jsonc`：

```jsonc
{
  "kv_namespaces": [{ "binding": "CACHE", "id": "42041d2cc3e84a378f3e264591790a3b" }]
}
```

`binding` 是代码里读的名字（`env.CACHE`），须与 `src/types/cloudflare.d.ts` 一致。

> **注意事项**：创建时把 namespace 名（`saas-template-cache`）与 binding 名（`CACHE`）分开是刻意的——前者是 Cloudflare 上的资源标识，后者是代码里的变量名。同一份代码可以部署到多个账号，只需改 binding 指向的 id。

### 无需额外开关

缓存始终启用，没有 `enabled` 配置项。无 ALS context 时（如测试环境）各函数自动降级为
pass-through——直接调用 fetcher，不缓存也不报错。

## 使用方法

```ts
import { CACHE_TTL, createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'
```

### 读取或写入

```ts
const status = await getOrSetCache({
  key: createCacheKey('newsletter:status', email),
  ttlSeconds: CACHE_TTL.newsletterStatus,
  fetcher: async () => fetchStatusFromProvider(email),
})
```

命中则直接返回缓存值；未命中则调 `fetcher`、写入 KV、返回结果。

### 失效

```ts
await deleteCache(createCacheKey('newsletter:status', email))   // 单键
await deleteCacheByPrefix(createCacheKey('products:list'))      // 前缀批量
```

写入数据后应主动失效对应键，不要等 TTL 自然过期。

### key 的构造

**必须**经 `createCacheKey()`，不要手工拼字符串：

```ts
createCacheKey('newsletter:status', 'a@b.com')  // → 'newsletter:status:a@b.com'
```

它会把各段里的 `:` 替换成 `_`，避免参数里的冒号污染 key 的层级结构，导致前缀失效时误删。

### TTL 常量

`src/cache/constants.ts` 集中管理，不要在各调用处写魔术数字：

| 常量 | 秒 | 用途 |
|---|---|---|
| `CACHE_TTL.newsletterStatus` | 3600 | 订阅状态 |
| `CACHE_TTL.providerStatus` | 300 | 第三方 provider 状态 |
| `CACHE_TTL.publicList` | 60 | 公开列表 |

## 已有的消费方

| 位置 | 用途 |
|---|---|
| `src/newsletter/index.ts` | 缓存订阅状态，写操作后主动失效 |
| `src/lib/rate-limit.ts` | 用 `createCacheKey` 拼限流键 |

限流与缓存在同一 namespace 里共用 `CACHE` binding。

## 最佳实践

- **只缓存可容忍短暂陈旧的数据**。KV 的写入在全球边缘是最终一致的，刚写完不一定立刻各处可见。
- **写后失效**：`deleteCache` 紧跟写操作，别依赖 TTL 兜底。
- **TTL 值集中在 `src/cache/constants.ts`**，与调用处分离。
- **前缀失效有成本**：`deleteByPrefix` 内部是「list 一页 → 并发删一页」的循环，前缀范围越大越慢，且 KV 的 list 有每页上限。别拿它当「清空缓存」用。
- **key 要稳定**：同一条数据的 key 在任何代码路径下都必须一致，否则缓存永远不命中。

## 参考资料

- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [KV 快速开始](https://developers.cloudflare.com/kv/get-started/)
- [KV 限制](https://developers.cloudflare.com/kv/platform/limits/)
- [Wrangler kv 命令](https://developers.cloudflare.com/workers/wrangler/commands/#kv)

## 下一步

- [Cloudflare](./cloudflare)——API Token 与部署流程
- [数据库](./database)——D1 与持久化数据
- [存储](./storage)——R2 对象存储
- [邮件订阅](./newsletter)——`CACHE_TTL.newsletterStatus` 的使用方
