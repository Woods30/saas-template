---
title: 文件存储
description: Cloudflare R2 的开通、绑定与文件 API
locale: zh
order: 7
group: deploy
updated: 2026-11-19
---

用户上传的文件存在 **Cloudflare R2**，经 Workers 的 `BUCKET` binding 访问，零 egress 费用。
代码在 `src/core/storage/`。

> 存储层已经实现，但仓库里**没有通用的上传路由**（`src/routes/api/` 下没有 `/api/files`）。
> 这页讲的是「要用时怎么接」。不接 R2 不影响模板运行。

## 步骤

1. **在 Dashboard 开通 R2。** 这一步无法经 API 完成，必须先在 Dashboard 激活一次（需绑支付
   方法，免费额度内不产生费用）。没开通时 API 会拒绝：

   ```text
   [code: 10042] Please enable R2 through the Cloudflare Dashboard.
   ```

2. **创建 bucket。**

   ```bash
   pnpm exec wrangler r2 bucket create <your-bucket-name>
   ```

3. **配置绑定。** 把 `wrangler.jsonc` 里注释掉的 `r2_buckets` 取消注释并填上：

   ```jsonc title="wrangler.jsonc"
   "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<your-bucket-name>" }]
   ```

   `binding` 是代码里读的名字（`env.BUCKET`），须与 `src/types/cloudflare.d.ts` 一致。没绑定
   时 `env.BUCKET` 是 `undefined`，`getStorageProvider()` 会抛错——这是预期的降级。

4. **自己加一个上传路由。** 仓库没有通用的上传 API，在 `src/routes/api/` 下新建路由，
   自己做鉴权，在里面调 `uploadFile`（用法见下）。

## 用法

所有函数从 `@/storage` 导入，内部经 AsyncLocalStorage 取当前请求的 provider：

```ts
import { uploadFile, deleteFile, downloadFile, getFileInfo, listUserFiles } from '@/storage'

// 上传：folder 仅允许 uploads / avatars / documents
const result = await uploadFile(arrayBuffer, 'photo.png', 'image/png', {
  folder: 'uploads',
  userId: 'user_abc',
  visibility: 'private',
})
// → { key, url, metadata }

// 删除：第二参数 true 表示调用方已确认归属
await deleteFile(key, true)

// 下载：private 文件必须显式传 true
const stream = await downloadFile(key, true)

// 查询
const info = await getFileInfo(key)                 // { key, size, contentType, uploadedAt } | null
const { objects, nextCursor } = await listUserFiles('user_abc')
```

## 安全约定

- **bucket 不公开。** 不配公开域名，也不走 `r2.dev` 子域，所有读写都经过 Worker 服务端。
- **鉴权不在存储层。** `deleteFile` / `downloadFile` 只认 `authorized` 布尔值，不做所有权查询，
  调用方必须先校验会话与归属，否则任何登录用户都能删改他人文件。
- key 由服务端拼装，形如 `uploads/<userId>/<时间戳>-<文件名>`：`folder` 取白名单值，filename
  与 userId 里的 `/`、`\`、`..` 与前导 `.` 会被净化，其余非法字符换成 `_`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm exec wrangler r2 bucket create <name>` | 创建 bucket |
| `pnpm exec wrangler r2 bucket list` | 列出 bucket |
| `pnpm exec wrangler r2 object put <bucket>/<key> --file <path>` | 上传对象 |

配好后可以接着做[缓存](./cache)。
