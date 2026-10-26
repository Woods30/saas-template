---
title: 存储
description: Cloudflare R2 的创建、绑定与文件 API
locale: zh
order: 7
group: deploy
updated: 2026-10-21
---

文件存 **Cloudflare R2**，经 Workers 的 `BUCKET` binding 访问，零 egress 费用。代码在
`src/storage/`。

> **存储模块已实现但未接线**：`features.enableFileUpload` 默认 `false`，仓库内没有路由
> 使用它。本页讲的是「要用时怎么接」——未开通 R2 不影响模板正常运行。

## 前提条件

Token 需含 **Account → Workers R2 Storage → Edit**，见 [Cloudflare](./cloudflare)。

## 设置

### 1. 在 Dashboard 开通 R2

**这一步无法跳过，也无法经 API 完成。** 首次使用必须先在 Dashboard 激活：

> Dashboard → **R2** → 按引导开通

需绑支付方式（免费额度内不产生费用：10 GB 存储 / 月、100 万次 A 类操作 / 月）。

未开通时 API 会拒绝：

```
[code: 10042] Please enable R2 through the Cloudflare Dashboard.
```

### 2. 创建 bucket

```bash
pnpm exec wrangler r2 bucket create saas-template-uploads
```

### 3. 配置绑定

```jsonc title="wrangler.jsonc"
{
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "saas-template-uploads" }]
}
```

`binding` 是代码里读的名字（`env.BUCKET`），须与 `src/types/cloudflare.d.ts` 一致。

> 模板默认**注释掉**了该块——R2 需先 Dashboard 开通。开通后取消注释、重新部署即可。
> 未绑定时 `env.BUCKET` 为 `undefined`，`getStorageProvider()` 会抛错，这是预期的降级。

### 4. 启用文件上传

```ts
// src/config/website.ts
features: {
  enableFileUpload: true,
}
```

改完重新构建并部署。

## 使用方法

所有函数从 `@/storage` 导入，内部经 AsyncLocalStorage 取当前请求的 provider：

```ts
import { uploadFile, deleteFile, downloadFile, getFileInfo, listUserFiles } from '@/storage'
```

### 上传

```ts
const result = await uploadFile(fileArrayBuffer, 'photo.png', 'image/png', {
  folder: 'uploads',        // 白名单：uploads / avatars / documents
  userId: 'user_abc',       // 可选，会进 key 路径
  visibility: 'private',    // 'private'（默认）| 'public'
})
// → { key, url, metadata }
```

`key` 形如 `uploads/user_abc/1729000000000-photo.png`。

### 删除与下载

这两个方法**不检查文件所有权**，调用方必须先确认 key 属于当前用户：

```ts
await deleteFile(key, true)      // 第二参数 true = 已确认授权
await downloadFile(key, true)    // private 文件必须传 true
```

不传 `authorized` 会直接抛错——这是刻意的，防止忘记鉴权。

### 查询

```ts
const info = await getFileInfo(key)          // { key, size, contentType, uploadedAt } | null
const { files, cursor } = await listUserFiles(userId)
```

## 安全约定

`buildKey` 对用户输入做净化：去除 `/`、`\`、`..` 与前导 `.`，其余非法字符替换为 `_`；
`folder` 仅接受白名单值；组装后再断言 key 以白名单前缀开头。

> **鉴权不在存储层。** `deleteFile` / `downloadFile` 只认 `authorized` 布尔值，不做任何
> 所有权查询。接上传接口时必须在调用前自行校验会话与归属，否则任何登录用户都能删改
> 他人文件。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm exec wrangler r2 bucket create <name>` | 创建 bucket |
| `pnpm exec wrangler r2 bucket list` | 列出 bucket |
| `pnpm exec wrangler r2 object put <bucket>/<key> --file <path>` | 上传对象 |

## 参考资料

- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 定价与免费额度](https://developers.cloudflare.com/r2/pricing/)

## 下一步

- [缓存](./cache)——KV 缓存
- [网站配置](./configuration)——`features.enableFileUpload` 开关
- [数据库](./database)——文件的元数据表
