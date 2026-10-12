# Sub-Plan B：核心业务模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Sub-Plan A 的骨架上注入数据库（Better Auth + 业务表）、缓存（KV）、存储（R2）、邮件（React Email + provider registry）、Newsletter、Notification、Contact、支付（Stripe）、Admin 与 Dashboard，并完成 `pnpm run setup` CLI。

**Architecture:** 每个 feature 一个 `src/<feature>/` 顶层目录（auth、cache、storage、mail、newsletter、notification、contact、payment、admin），统一 `types.ts` + `provider/` + `index.ts` 注册表模式。Drizzle schema 集中于 `src/db/schema.ts`。wrangler.jsonc 添加 DB/CACHE/BUCKET/EMAIL/AI bindings。所有 server functions 走 `createServerFn` + 中间件注入 env。

**Tech Stack:** Drizzle ORM, Better Auth, Stripe SDK, Cloudflare R2, Cloudflare KV, React Email, @inquirer/prompts, zod.

## Global Constraints（继承自 Sub-Plan A）

- 所有 provider 必须实现 `providerRegistry` 注册表接口。
- 业务代码禁止直接读 `process.env` / `import.meta.env`；通过 `serverEnv`（server-only）与 `publicEnv`（client + server）访问。
- 测试三层：单元（Vitest）、组件（Vitest + Testing Library）、集成（Vitest + `@cloudflare/vitest-pool-workers`）。
- 提交前必须 `pnpm run check` 与 `pnpm run test` 通过。
- 不实现 Creem / Waffo / Sentry / Resend Audience 之外的具体 provider；预留点位与文档。
- 默认 baseLocale `zh`；中文优先。
- Stripe webhook 监听：`invoice.paid`、`checkout.session.completed`、`customer.subscription.{created,updated,deleted}`、`charge.refunded`。

---

### Task 1: 安装业务依赖

**Files:**
- Modify: `package.json`

**Step 1.1: 安装生产依赖**

```bash
pnpm add drizzle-orm better-auth stripe @aws-sdk/client-s3 @aws-sdk/s3-request-presigner resend react-email @react-email/components
pnpm add -D drizzle-kit @cloudflare/vitest-pool-workers @testing-library/react @testing-library/jest-dom jsdom @types/testing-library__jest-dom
```

**Step 1.2: 确认版本**

```bash
pnpm ls drizzle-orm better-auth stripe react-email
```

记录实际版本；后续任务如遇到 API 差异，按需查阅官方文档。

**Step 1.3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): 业务依赖（drizzle/better-auth/stripe/react-email）"
```

---

### Task 2: Drizzle 配置 + Schema

**Files:**
- Create: `drizzle.config.ts`
- Create: `drizzle.config.local.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`

**Step 2.1: 写入 `drizzle.config.ts`（远程/生产）**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
  verbose: true,
  strict: true,
});
```

**Step 2.2: 写入 `drizzle.config.local.ts`（本地）**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'd1-local',
  dbCredentials: { databaseId: 'local' },
  verbose: true,
  strict: true,
});
```

**Step 2.3: 写入 `src/db/schema.ts`**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Better Auth 自动生成的表（与 better-auth CLI 输出一致）
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// 业务表
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  customerId: text('customer_id'),
  subscriptionId: text('subscription_id'),
  status: text('status').notNull(),
  priceId: text('price_id'),
  amount: integer('amount'),
  currency: text('currency'),
  interval: text('interval'),
  currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  stripeInvoiceId: text('stripe_invoice_id'),
  stripeChargeId: text('stripe_charge_id'),
  status: text('status').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  description: text('description'),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
  refundedAt: integer('refunded_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  folder: text('folder'),
  visibility: text('visibility').notNull().default('private'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hashedKey: text('hashed_key').notNull(),
  prefix: text('prefix').notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const newsletterSubscriptions = sqliteTable('newsletter_subscriptions', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  provider: text('provider').notNull(),
  providerListId: text('provider_list_id'),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
```

**Step 2.4: 写入 `src/db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof createDb>;
export { schema };
```

**Step 2.5: 生成迁移**

```bash
pnpm exec drizzle-kit generate --config=drizzle.config.local.ts
```

预期：`src/db/migrations/0000_<name>.sql` 创建。

**Step 2.6: 写入 `package.json` scripts（追加）**

```json
"db:generate": "drizzle-kit generate --config=drizzle.config.local.ts",
"db:migrate:local": "wrangler d1 migrations apply DB --local",
"db:migrate:remote": "wrangler d1 migrations apply DB --remote",
"db:studio:local": "drizzle-kit studio --config=drizzle.config.local.ts",
"db:studio:remote": "drizzle-kit studio --config=drizzle.config.ts",
"auth:schema:generate": "pnpm exec @better-auth/cli generate --config src/auth/auth.ts --output src/db/auth-schema.ts"
```

**Step 2.7: Commit**

```bash
git add drizzle.config.ts drizzle.config.local.ts src/db package.json
git commit -m "feat(db): Drizzle schema（auth + 业务表）+ 配置"
```

---

### Task 3: Better Auth 集成

**Files:**
- Create: `src/auth/auth.ts`
- Create: `src/auth/client.ts`
- Create: `src/auth/types.ts`
- Create: `src/auth/middlewares.ts`
- Create: `src/routes/api/auth/$.ts`

**Step 3.1: 写入 `src/auth/types.ts`**

```ts
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: 'user' | 'admin' | 'superadmin';
  emailVerified: boolean;
  banned: boolean;
  deletedAt: Date | null;
}
```

**Step 3.2: 写入 `src/auth/auth.ts`**

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getRequestEvent } from 'solid-js/web';
import { createDb, schema } from '@/db';
import { parseServerEnv } from '@/env/server';

export function getAuth(env: Env) {
  const parsed = parseServerEnv({ ...(env as unknown as Record<string, unknown>), ...process.env });
  const db = createDb(env.DB);

  return betterAuth({
    secret: parsed.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
    },
    socialProviders: {
      google:
        parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
          ? {
              clientId: parsed.GOOGLE_CLIENT_ID,
              clientSecret: parsed.GOOGLE_CLIENT_SECRET,
            }
          : undefined,
    },
    user: {
      deleteUser: { enabled: true },
    },
  });
}
```

**Step 3.3: 写入 `src/auth/client.ts`**

```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

**Step 3.4: 写入 `src/auth/middlewares.ts`**

```ts
import { redirect } from '@tanstack/react-router';
import type { SessionUser } from './types';

export async function requireAuth(getSession: () => Promise<SessionUser | null>) {
  const session = await getSession();
  if (!session) throw redirect({ to: '/auth/login' });
  return session;
}

export async function requireRole(
  getSession: () => Promise<SessionUser | null>,
  allowed: Array<SessionUser['role']>,
) {
  const session = await requireAuth(getSession);
  if (!allowed.includes(session.role)) throw redirect({ to: '/dashboard' });
  return session;
}
```

**Step 3.5: 写入 `src/routes/api/auth/$.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { getAuth } = await import('@/auth/auth');
        const env = (context as { cloudflare: { env: Env } }).cloudflare.env;
        return getAuth(env).handler(request);
      },
      POST: async ({ request, context }) => {
        const { getAuth } = await import('@/auth/auth');
        const env = (context as { cloudflare: { env: Env } }).cloudflare.env;
        return getAuth(env).handler(request);
      },
    },
  },
});
```

> 实际 API 路径与 TanStack Start 1.x 的 server route 写法以官方文档为准；本 task 给出骨架。

**Step 3.6: 测试**

```bash
pnpm run typecheck
```

预期：0 错误。

**Step 3.7: Commit**

```bash
git add src/auth src/routes/api/auth
git commit -m "feat(auth): 集成 Better Auth + Drizzle adapter"
```

---

### Task 4: Cache 模块（KV）

**Files:**
- Create: `src/cache/constants.ts`
- Create: `src/cache/provider/kv.ts`
- Create: `src/cache/index.ts`
- Create: `tests/unit/cache.test.ts`

**Step 4.1: 写入 `src/cache/constants.ts`**

```ts
export const CACHE_TTL = {
  newsletterStatus: 60 * 60,
  providerStatus: 5 * 60,
  publicList: 60,
} as const;
```

**Step 4.2: 写入 `src/cache/provider/kv.ts`**

```ts
import type { KVNamespace } from '@cloudflare/workers-types';

export class KVCacheProvider {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key, 'json');
    return raw as T | null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const result: { keys: { name: string }[]; list_complete: boolean; cursor?: string } =
        await this.kv.list({ prefix, cursor });
      await Promise.all(result.keys.map((k) => this.kv.delete(k.name)));
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  }
}
```

**Step 4.3: 写入 `src/cache/index.ts`**

```ts
import { CACHE_TTL } from './constants';
import type { KVCacheProvider } from './provider/kv';

let provider: KVCacheProvider | null = null;

export function initCache(p: KVCacheProvider) {
  provider = p;
}

export function createCacheKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p).replace(/[:]/g, '_')).join(':');
}

export async function getOrSetCache<T>(opts: {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
}): Promise<T> {
  if (!provider) return opts.fetcher();
  const cached = await provider.get<T>(opts.key);
  if (cached !== null) return cached;
  const fresh = await opts.fetcher();
  await provider.set(opts.key, fresh, opts.ttlSeconds);
  return fresh;
}

export async function deleteCache(key: string): Promise<void> {
  if (!provider) return;
  await provider.delete(key);
}

export async function deleteCacheByPrefix(prefix: string): Promise<void> {
  if (!provider) return;
  await provider.deleteByPrefix(prefix);
}

export { CACHE_TTL };
```

**Step 4.4: 写入 `tests/unit/cache.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCacheKey } from '@/cache';

describe('createCacheKey', () => {
  it('连接 parts 为字符串', () => {
    expect(createCacheKey('a', 'b', 'c')).toBe('a:b:c');
  });

  it('转义冒号避免键冲突', () => {
    expect(createCacheKey('a:b', 'c')).toBe('a_b:c');
  });
});
```

**Step 4.5: 在 `src/worker.ts` 注入 cache**

```ts
import { createStartHandler } from '@tanstack/react-start/server';
import { initCache, KVCacheProvider } from '@/cache';

export default createStartHandler(async ({ request }) => {
  return new Response('not implemented', { status: 501 });
});

export async function init(env: Env) {
  initCache(new KVCacheProvider(env.CACHE));
}
```

**Step 4.6: 测试**

```bash
pnpm run test
```

预期：`cache.test.ts` 通过。

**Step 4.7: Commit**

```bash
git add src/cache tests/unit/cache.test.ts src/worker.ts
git commit -m "feat(cache): KV cache 模块 + 注册表"
```

---

### Task 5: Storage 模块（R2）

**Files:**
- Create: `src/storage/types.ts`
- Create: `src/storage/provider/r2.ts`
- Create: `src/storage/index.ts`
- Create: `tests/unit/storage.test.ts`

**Step 5.1: 写入 `src/storage/types.ts`**

```ts
export interface UploadOptions {
  folder?: string;
  userId?: string;
  visibility?: 'private' | 'public';
}

export interface UploadResult {
  key: string;
  url: string;
  metadata: Record<string, string>;
}

export interface FileInfo {
  key: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
}
```

**Step 5.2: 写入 `src/storage/provider/r2.ts`**

```ts
import type { R2Bucket } from '@cloudflare/workers-types';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileInfo, UploadOptions, UploadResult } from '../types';

export class R2StorageProvider {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: R2Bucket,
    private readonly bindingName = 'BUCKET',
  ) {
    // R2 S3 兼容端点（通过 Cloudflare account id 推断）
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  private buildKey(filename: string, options: UploadOptions): string {
    const parts = [options.folder ?? 'uploads'];
    if (options.userId) parts.push(options.userId);
    parts.push(`${Date.now()}-${filename}`);
    return parts.join('/');
  }

  async uploadFile(
    file: ArrayBuffer | Uint8Array,
    filename: string,
    contentType: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const key = this.buildKey(filename, options);
    await this.bucket.put(key, file, {
      httpMetadata: { contentType },
      customMetadata: {
        userId: options.userId ?? '',
        visibility: options.visibility ?? 'private',
      },
    });
    return {
      key,
      url: `/api/files/${encodeURIComponent(key)}`,
      metadata: { contentType, visibility: options.visibility ?? 'private' },
    };
  }

  async deleteFile(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async downloadFile(key: string): Promise<ReadableStream | null> {
    const obj = await this.bucket.get(key);
    return obj?.body ?? null;
  }

  async getFileInfo(key: string): Promise<FileInfo | null> {
    const obj = await this.bucket.head(key);
    if (!obj) return null;
    return {
      key,
      size: obj.size,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      uploadedAt: obj.uploaded,
    };
  }

  async listUserFiles(userId: string, cursor?: string) {
    const prefix = `uploads/${userId}/`;
    const listed = await this.bucket.list({ prefix, cursor, limit: 50 });
    return {
      objects: listed.objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
      })),
      hasMore: !listed.truncated,
      nextCursor: listed.truncated ? listed.cursor : undefined,
    };
  }
}
```

**Step 5.3: 写入 `src/storage/index.ts`**

```ts
import { R2StorageProvider } from './provider/r2';
import type { FileInfo, UploadOptions, UploadResult } from './types';

export type { FileInfo, UploadOptions, UploadResult };

let provider: R2StorageProvider | null = null;

export function initStorage(p: R2StorageProvider) {
  provider = p;
}

function ensure(): R2StorageProvider {
  if (!provider) throw new Error('Storage provider 未初始化');
  return provider;
}

export async function uploadFile(
  file: ArrayBuffer | Uint8Array,
  filename: string,
  contentType: string,
  options?: UploadOptions,
) {
  return ensure().uploadFile(file, filename, contentType, options);
}

export async function deleteFile(key: string) {
  return ensure().deleteFile(key);
}

export async function downloadFile(key: string) {
  return ensure().downloadFile(key);
}

export async function getFileInfo(key: string): Promise<FileInfo | null> {
  return ensure().getFileInfo(key);
}

export async function listUserFiles(userId: string, cursor?: string) {
  return ensure().listUserFiles(userId, cursor);
}
```

**Step 5.4: 写入 `tests/unit/storage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCacheKey } from '@/cache';

describe('storage types', () => {
  it('exports UploadOptions 接口', () => {
    const opts: import('@/storage').UploadOptions = { folder: 'a', userId: 'u1' };
    expect(opts.folder).toBe('a');
  });
});
```

**Step 5.5: 在 `src/worker.ts` 注入 storage**

```ts
import { initStorage, R2StorageProvider } from '@/storage';

initStorage(new R2StorageProvider(env.BUCKET));
```

**Step 5.6: Commit**

```bash
git add src/storage tests/unit/storage.test.ts src/worker.ts
git commit -m "feat(storage): R2 provider + 注册表"
```

---

### Task 6: Mail 模块（React Email + 注册表）

**Files:**
- Create: `src/mail/components/EmailLayout.tsx`
- Create: `src/mail/components/EmailButton.tsx`
- Create: `src/mail/types.ts`
- Create: `src/mail/provider/cloudflare.ts`
- Create: `src/mail/provider/resend.ts`
- Create: `src/mail/templates/verify-email.tsx`
- Create: `src/mail/templates/forgot-password.tsx`
- Create: `src/mail/templates/contact-message.tsx`
- Create: `src/mail/render.ts`
- Create: `src/mail/index.ts`
- Create: `src/api/email.ts`

**Step 6.1: 写入 `src/mail/components/EmailLayout.tsx`**

```tsx
import { Html, Body, Container, Heading } from '@react-email/components';

interface Props {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html>
      <Body style={{ fontFamily: 'sans-serif', background: '#f4f4f5', padding: 24 }}>
        <Container style={{ background: '#ffffff', padding: 24, borderRadius: 8 }}>
          <Heading as="h2" style={{ marginTop: 0 }}>{preview}</Heading>
          {children}
        </Container>
      </Body>
    </Html>
  );
}
```

**Step 6.2: 写入 `src/mail/components/EmailButton.tsx`**

```tsx
import { Button } from '@react-email/components';

interface Props {
  href: string;
  children: React.ReactNode;
}

export function EmailButton({ href, children }: Props) {
  return (
    <Button href={href} style={{ background: '#0070f3', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
      {children}
    </Button>
  );
}
```

**Step 6.3: 写入 `src/mail/types.ts`**

```ts
export type EmailTemplate =
  | 'verifyEmail'
  | 'forgotPassword'
  | 'contactMessage';

export interface SendTemplateParams {
  to: string;
  template: EmailTemplate;
  locale: 'zh' | 'en';
  context: Record<string, unknown>;
  fromAddress?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface MailProvider {
  getProviderName(): string;
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>;
}
```

**Step 6.4: 写入 `src/mail/provider/cloudflare.ts`**

```ts
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types';
import { renderTemplate } from '../render';

export class CloudflareEmailProvider implements MailProvider {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly sender: string,
  ) {}

  getProviderName() {
    return 'cloudflare';
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    const { subject, html } = await renderTemplate(params);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/rfz/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: params.fromAddress ?? this.sender,
          to: params.to,
          subject,
          html,
        }),
      },
    );
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { result?: { id?: string } };
    return { ok: true, id: data.result?.id };
  }
}
```

**Step 6.5: 写入 `src/mail/provider/resend.ts`**

```ts
import { Resend } from 'resend';
import type { MailProvider, SendEmailResult, SendTemplateParams } from '../types';
import { renderTemplate } from '../render';

export class ResendMailProvider implements MailProvider {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly sender: string) {
    this.client = new Resend(apiKey);
  }

  getProviderName() {
    return 'resend';
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendEmailResult> {
    const { subject, html } = await renderTemplate(params);
    const { data, error } = await this.client.emails.send({
      from: params.fromAddress ?? this.sender,
      to: params.to,
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  }
}
```

**Step 6.6: 写入 `src/mail/templates/verify-email.tsx`**

```tsx
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';

interface Props {
  username: string;
  actionUrl: string;
}

export default function VerifyEmail({ username, actionUrl }: Props) {
  return (
    <EmailLayout preview="验证邮箱">
      <p>你好，{username}。</p>
      <p>请点击下方按钮完成注册：</p>
      <EmailButton href={actionUrl}>验证邮箱</EmailButton>
    </EmailLayout>
  );
}
```

**Step 6.7: 写入 `src/mail/templates/forgot-password.tsx`**

```tsx
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';

interface Props {
  username: string;
  actionUrl: string;
}

export default function ForgotPassword({ username, actionUrl }: Props) {
  return (
    <EmailLayout preview="重置密码">
      <p>你好，{username}。</p>
      <p>如需重置密码，请点击下方按钮（1 小时内有效）：</p>
      <EmailButton href={actionUrl}>重置密码</EmailButton>
    </EmailLayout>
  );
}
```

**Step 6.8: 写入 `src/mail/templates/contact-message.tsx`**

```tsx
import { EmailLayout } from '../components/EmailLayout';

interface Props {
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
}

export default function ContactMessage({ fromName, fromEmail, subject, message }: Props) {
  return (
    <EmailLayout preview="新的联系表单消息">
      <p><strong>{fromName}</strong>（{fromEmail}）提交了消息：</p>
      <p><em>{subject}</em></p>
      <blockquote style={{ borderLeft: '3px solid #ccc', paddingLeft: 12, color: '#555' }}>
        {message}
      </blockquote>
    </EmailLayout>
  );
}
```

**Step 6.9: 写入 `src/mail/render.ts`**

```ts
import type { EmailTemplate, SendTemplateParams } from './types';
import VerifyEmail from './templates/verify-email';
import ForgotPassword from './templates/forgot-password';
import ContactMessage from './templates/contact-message';

const templates = {
  verifyEmail: VerifyEmail,
  forgotPassword: ForgotPassword,
  contactMessage: ContactMessage,
} as const;

const subjects: Record<EmailTemplate, Record<'zh' | 'en', string>> = {
  verifyEmail: { zh: '验证你的邮箱', en: 'Verify your email' },
  forgotPassword: { zh: '重置密码', en: 'Reset your password' },
  contactMessage: { zh: '新的联系消息', en: 'New contact message' },
};

export async function renderTemplate(params: SendTemplateParams) {
  const Component = templates[params.template];
  const element = Component(params.context as never);
  const { render } = await import('@react-email/render');
  const html = await render(element);
  return {
    subject: subjects[params.template][params.locale],
    html,
  };
}
```

> `@react-email/render` 需追加依赖：

```bash
pnpm add @react-email/render
```

**Step 6.10: 写入 `src/mail/index.ts`**

```ts
import type { MailProvider, SendTemplateParams, SendEmailResult } from './types';
import type { CloudflareEmailProvider } from './provider/cloudflare';
import type { ResendMailProvider } from './provider/resend';

type ProviderName = 'cloudflare' | 'resend';
type ProviderFactory = () => MailProvider;

const registry: Partial<Record<ProviderName, ProviderFactory>> = {};

export function registerMailProvider(name: ProviderName, factory: ProviderFactory) {
  registry[name] = factory;
}

export function getMailProvider(name: ProviderName): MailProvider {
  const factory = registry[name];
  if (!factory) throw new Error(`Mail provider 未注册：${name}`);
  return factory();
}

export async function sendMail(
  providerName: ProviderName,
  params: SendTemplateParams,
): Promise<SendEmailResult> {
  const provider = getMailProvider(providerName);
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await provider.sendTemplate(params);
    if (result.ok) return result;
    lastErr = result.error;
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  return { ok: false, error: lastErr ?? 'unknown' };
}

export type { MailProvider, SendTemplateParams, SendEmailResult };
export type { CloudflareEmailProvider, ResendMailProvider };
```

**Step 6.11: 在 `src/worker.ts` 注册 Mail providers**

```ts
import { registerMailProvider, CloudflareEmailProvider, ResendMailProvider } from '@/mail';
import { parseServerEnv } from '@/env/server';

const env = parseServerEnv({ ...process.env });
if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_EMAIL_SENDER) {
  registerMailProvider('cloudflare', () =>
    new CloudflareEmailProvider(env.CLOUDFLARE_ACCOUNT_ID!, env.CLOUDFLARE_API_TOKEN!, env.CLOUDFLARE_EMAIL_SENDER!),
  );
}
if (env.RESEND_API_KEY) {
  registerMailProvider('resend', () => new ResendMailProvider(env.RESEND_API_KEY!, 'SaaS Template <noreply@example.com>'));
}
```

**Step 6.12: Commit**

```bash
git add src/mail src/worker.ts package.json pnpm-lock.yaml
git commit -m "feat(mail): React Email + Cloudflare/Resend provider 注册表"
```

---

### Task 7: Newsletter 模块

**Files:**
- Create: `src/newsletter/types.ts`
- Create: `src/newsletter/provider/resend.ts`
- Create: `src/newsletter/provider/beehiiv.ts`
- Create: `src/newsletter/index.ts`
- Create: `src/api/newsletter.ts`

**Step 7.1: 写入 `src/newsletter/types.ts`**

```ts
export interface SubscribeNewsletterParams { email: string; locale?: 'zh' | 'en' }
export interface UnsubscribeNewsletterParams { email: string }
export interface CheckSubscribeStatusParams { email: string }

export interface NewsletterProvider {
  getProviderName(): string;
  subscribe(params: SubscribeNewsletterParams): Promise<boolean>;
  unsubscribe(params: UnsubscribeNewsletterParams): Promise<boolean>;
  checkSubscribeStatus(params: CheckSubscribeStatusParams): Promise<boolean>;
}
```

**Step 7.2: 写入 `src/newsletter/provider/resend.ts`**

```ts
import { Resend } from 'resend';
import type { NewsletterProvider, SubscribeNewsletterParams, UnsubscribeNewsletterParams, CheckSubscribeStatusParams } from '../types';

export class ResendNewsletterProvider implements NewsletterProvider {
  constructor(private readonly apiKey: string, private readonly audienceId: string) {
    this.client = new Resend(apiKey);
  }
  private readonly client: Resend;

  getProviderName() {
    return 'resend';
  }

  async subscribe({ email }: SubscribeNewsletterParams) {
    const { error } = await this.client.contacts.create({ email, audienceId: this.audienceId });
    return !error;
  }

  async unsubscribe({ email }: UnsubscribeNewsletterParams) {
    const { error } = await this.client.contacts.update({ email, audienceId: this.audienceId, unsubscribed: true });
    return !error;
  }

  async checkSubscribeStatus({ email }: CheckSubscribeStatusParams) {
    const { data } = await this.client.contacts.get({ email, audienceId: this.audienceId });
    return Boolean(data && !data.unsubscribed);
  }
}
```

**Step 7.3: 写入 `src/newsletter/provider/beehiiv.ts`**

```ts
import type { NewsletterProvider, SubscribeNewsletterParams, UnsubscribeNewsletterParams, CheckSubscribeStatusParams } from '../types';

export class BeehiivNewsletterProvider implements NewsletterProvider {
  constructor(private readonly apiKey: string, private readonly publicationId: string) {}

  getProviderName() {
    return 'beehiiv';
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async subscribe({ email }: SubscribeNewsletterParams) {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, send_welcome_email: true }),
    });
    return res.ok;
  }

  async unsubscribe({ email }: UnsubscribeNewsletterParams) {
    const res = await fetch(`https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions`, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ email }),
    });
    return res.ok;
  }

  async checkSubscribeStatus({ email }: CheckSubscribeStatusParams) {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${this.publicationId}/subscriptions?email=${encodeURIComponent(email)}`,
      { headers: this.headers() },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { data?: Array<{ status: string }> };
    return Boolean(data.data?.[0]?.status === 'active');
  }
}
```

**Step 7.4: 写入 `src/newsletter/index.ts`**

```ts
import { createCacheKey, deleteCache, getOrSetCache, CACHE_TTL } from '@/cache';
import type { NewsletterProvider, SubscribeNewsletterParams, CheckSubscribeStatusParams, UnsubscribeNewsletterParams } from './types';

type ProviderName = 'resend' | 'beehiiv';
type ProviderFactory = () => NewsletterProvider;

const registry: Partial<Record<ProviderName, ProviderFactory>> = {};

export function registerNewsletterProvider(name: ProviderName, factory: ProviderFactory) {
  registry[name] = factory;
}

function get(name: ProviderName): NewsletterProvider {
  const factory = registry[name];
  if (!factory) throw new Error(`Newsletter provider 未注册：${name}`);
  return factory();
}

export async function subscribe(name: ProviderName, params: SubscribeNewsletterParams) {
  const result = await get(name).subscribe(params);
  await deleteCache(createCacheKey('newsletter:status', params.email));
  return result;
}

export async function unsubscribe(name: ProviderName, params: UnsubscribeNewsletterParams) {
  const result = await get(name).unsubscribe(params);
  await deleteCache(createCacheKey('newsletter:status', params.email));
  return result;
}

export async function checkStatus(name: ProviderName, params: CheckSubscribeStatusParams) {
  return getOrSetCache({
    key: createCacheKey('newsletter:status', params.email),
    ttlSeconds: CACHE_TTL.newsletterStatus,
    fetcher: () => get(name).checkSubscribeStatus(params),
  });
}

export type { NewsletterProvider, SubscribeNewsletterParams, UnsubscribeNewsletterParams, CheckSubscribeStatusParams };
```

**Step 7.5: 在 `src/worker.ts` 注册**

```ts
import { registerNewsletterProvider, ResendNewsletterProvider, BeehiivNewsletterProvider } from '@/newsletter';

if (env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID) {
  registerNewsletterProvider('resend', () => new ResendNewsletterProvider(env.RESEND_API_KEY!, env.RESEND_AUDIENCE_ID!));
}
if (env.BEEHIIV_API_KEY && env.BEEHIIV_PUBLICATION_ID) {
  registerNewsletterProvider('beehiiv', () => new BeehiivNewsletterProvider(env.BEEHIIV_API_KEY!, env.BEEHIIV_PUBLICATION_ID!));
}
```

**Step 7.6: Commit**

```bash
git add src/newsletter src/worker.ts
git commit -m "feat(newsletter): Resend Audiences + Beehiiv 注册表"
```

---

### Task 8: Notification 模块

**Files:**
- Create: `src/notification/types.ts`
- Create: `src/notification/provider/discord.ts`
- Create: `src/notification/provider/feishu.ts`
- Create: `src/notification/index.ts`

**Step 8.1: 写入 `src/notification/types.ts`**

```ts
export type NotificationChannel = 'discord' | 'feishu';

export interface NotificationPayload {
  title: string;
  message: string;
  meta?: Record<string, string>;
}

export interface NotificationProvider {
  getProviderName(): string;
  send(payload: NotificationPayload): Promise<boolean>;
}
```

**Step 8.2: 写入 `src/notification/provider/discord.ts`**

```ts
import type { NotificationPayload, NotificationProvider } from '../types';

export class DiscordNotificationProvider implements NotificationProvider {
  constructor(private readonly webhookUrl: string) {}

  getProviderName() {
    return 'discord';
  }

  async send({ title, message, meta }: NotificationPayload) {
    const fields = Object.entries(meta ?? {}).map(([name, value]) => ({ name, value }));
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title, description: message, fields }],
      }),
    });
    return res.ok;
  }
}
```

**Step 8.3: 写入 `src/notification/provider/feishu.ts`**

```ts
import type { NotificationPayload, NotificationProvider } from '../types';

export class FeishuNotificationProvider implements NotificationProvider {
  constructor(private readonly webhookUrl: string) {}

  getProviderName() {
    return 'feishu';
  }

  async send({ title, message, meta }: NotificationPayload) {
    const text = [`**${title}**`, message, ...Object.entries(meta ?? {}).map(([k, v]) => `${k}: ${v}`)].join('\n');
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'interactive', card: { elements: [{ tag: 'markdown', content: text }] } }),
    });
    return res.ok;
  }
}
```

**Step 8.4: 写入 `src/notification/index.ts`**

```ts
import type { NotificationChannel, NotificationPayload, NotificationProvider } from './types';

type ProviderFactory = () => NotificationProvider;
const registry: Partial<Record<NotificationChannel, ProviderFactory>> = {};

export function registerNotificationProvider(name: NotificationChannel, factory: ProviderFactory) {
  registry[name] = factory;
}

export async function notify(name: NotificationChannel, payload: NotificationPayload) {
  const factory = registry[name];
  if (!factory) return false;
  const result = await result.send(payload);
  if (!result) {
    console.warn(`[notification] ${name} 投递失败`);
  }
  return result;
}

export type { NotificationChannel, NotificationPayload, NotificationProvider };
```

> 注：上方 `result.send(payload)` 应为 `provider.send(payload)`；修正：

```ts
const provider = factory();
const result = await provider.send(payload);
if (!result) console.warn(`[notification] ${name} 投递失败`);
return result;
```

**Step 8.5: 在 `src/worker.ts` 注册**

```ts
import { registerNotificationProvider, DiscordNotificationProvider, FeishuNotificationProvider } from '@/notification';

if (env.DISCORD_WEBHOOK_URL) {
  registerNotificationProvider('discord', () => new DiscordNotificationProvider(env.DISCORD_WEBHOOK_URL!));
}
if (env.FEISHU_WEBHOOK_URL) {
  registerNotificationProvider('feishu', () => new FeishuNotificationProvider(env.FEISHU_WEBHOOK_URL!));
}
```

**Step 8.6: Commit**

```bash
git add src/notification src/worker.ts
git commit -m "feat(notification): Discord + Feishu 注册表"
```

---

### Task 9: Contact 模块

**Files:**
- Create: `src/contact/schema.ts`
- Create: `src/contact/notifications.ts`
- Create: `src/api/contact.ts`
- Create: `src/routes/{-$locale}/contact.tsx`

**Step 9.1: 写入 `src/contact/schema.ts`**

```ts
import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(1).max(100),
  fromEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

export type ContactInput = z.infer<typeof contactSchema>;
```

**Step 9.2: 写入 `src/contact/notifications.ts`**

```ts
import { notify } from '@/notification';
import { sendMail } from '@/mail';
import { websiteConfig } from '@/config/website';

export async function deliverContactNotification(input: { name: string; fromEmail: string; subject: string; message: string }) {
  const supportEmail = websiteConfig.mail?.supportEmail ?? 'support@example.com';

  await sendMail('cloudflare', {
    to: supportEmail,
    template: 'contactMessage',
    locale: 'zh',
    context: input,
  });

  if (websiteConfig.notification?.enable) {
    await notify('discord', {
      title: `新的联系消息：${input.subject}`,
      message: input.message,
      meta: { from: `${input.name} <${input.fromEmail}>` },
    });
  }
}
```

**Step 9.3: 写入 `src/api/contact.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import { contactSchema } from '@/contact/schema';
import { deliverContactNotification } from '@/contact/notifications';

export const submitContact = createServerFn({ method: 'POST' })
  .validator(contactSchema)
  .handler(async ({ data }) => {
    await deliverContactNotification(data);
    return { ok: true };
  });
```

**Step 9.4: 写入 `src/routes/{-$locale}/contact.tsx`（最小骨架）**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { submitContact } from '@/api/contact';

export const Route = createFileRoute('/{-$locale}/contact')({
  component: ContactPage,
});

function ContactPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 className="text-2xl font-bold">联系我们</h1>
      <ContactForm />
    </main>
  );
}

function ContactForm() {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        await submitContact({
          data: {
            name: String(form.get('name')),
            fromEmail: String(form.get('email')),
            subject: String(form.get('subject')),
            message: String(form.get('message')),
          },
        });
        alert('已发送');
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}
    >
      <input name="name" placeholder="姓名" required className="rounded border px-3 py-2" />
      <input name="email" type="email" placeholder="邮箱" required className="rounded border px-3 py-2" />
      <input name="subject" placeholder="主题" required className="rounded border px-3 py-2" />
      <textarea name="message" placeholder="消息" rows={6} required className="rounded border px-3 py-2" />
      <button type="submit" className="rounded bg-blue-500 px-4 py-2 text-white">发送</button>
    </form>
  );
}
```

**Step 9.5: Commit**

```bash
git add src/contact src/api/contact.ts src/routes/{-\$locale}/contact.tsx
git commit -m "feat(contact): 联系表单 server function + 通知投递"
```

---

### Task 10: Payment 模块（Stripe）

**Files:**
- Create: `src/payment/types.ts`
- Create: `src/payment/provider/stripe.ts`
- Create: `src/payment/index.ts`
- Create: `src/api/payment.ts`
- Create: `src/routes/api/webhooks/stripe.ts`

**Step 10.1: 写入 `src/payment/types.ts`**

```ts
export type SubscriptionStatus =
  | 'active' | 'canceled' | 'incomplete' | 'incomplete_expired'
  | 'past_due' | 'paused' | 'trialing' | 'unpaid';

export interface CheckoutParams {
  priceId: string;
  userId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  locale?: 'zh' | 'en';
  mode: 'subscription' | 'payment';
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

export interface PortalResult {
  url: string;
}

export interface PaymentProvider {
  getProviderName(): string;
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
  createCustomerPortalLink(params: { customerId: string; returnUrl: string }): Promise<PortalResult>;
  verifyWebhook(rawBody: string, signature: string): boolean;
  parseWebhookEvent(rawBody: string, signature: string): Stripe.Event;
}
```

**Step 10.2: 写入 `src/payment/provider/stripe.ts`**

```ts
import Stripe from 'stripe';
import type { CheckoutParams, CheckoutResult, PaymentProvider, PortalResult } from '../types';

export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  constructor(secretKey: string, private readonly webhookSecret: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion });
  }

  getProviderName() {
    return 'stripe';
  }

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: params.mode,
      line_items: [{ price: params.priceId, quantity: 1 }],
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      locale: params.locale === 'zh' ? 'zh' : 'en',
      metadata: { userId: params.userId },
      ...(params.mode === 'payment' ? { invoice_creation: { enabled: true } } : {}),
      ...(params.mode === 'payment' ? { allow_promotion_codes: true } : {}),
    });
    return { url: session.url ?? '', sessionId: session.id };
  }

  async createCustomerPortalLink({ customerId, returnUrl }: { customerId: string; returnUrl: string }): Promise<PortalResult> {
    const portal = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: portal.url };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawBody: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
```

**Step 10.3: 写入 `src/payment/index.ts`**

```ts
import type { PaymentProvider } from './types';
import type { StripePaymentProvider } from './provider/stripe';

type ProviderName = 'stripe' | 'creem' | 'waffo';
type ProviderFactory = () => PaymentProvider;

const registry: Partial<Record<ProviderName, ProviderFactory>> = {};

export function registerPaymentProvider(name: ProviderName, factory: ProviderFactory) {
  registry[name] = factory;
}

export function getPaymentProvider(name: ProviderName): PaymentProvider {
  const factory = registry[name];
  if (!factory) throw new Error(`Payment provider 未注册：${name}`);
  return factory();
}

export type { PaymentProvider };
```

**Step 10.4: 写入 `src/api/payment.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getPaymentProvider } from '@/payment';
import { websiteConfig } from '@/config/website';

const createCheckoutSchema = z.object({
  priceId: z.string(),
  userId: z.string(),
  customerEmail: z.string().email(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  locale: z.enum(['zh', 'en']).optional(),
  mode: z.enum(['subscription', 'payment']),
});

export const createCheckoutSession = createServerFn({ method: 'POST' })
  .validator(createCheckoutSchema)
  .handler(async ({ data }) => {
    const provider = getPaymentProvider(websiteConfig.payment.provider);
    return provider.createCheckoutSession(data);
  });

const createPortalSchema = z.object({
  customerId: z.string(),
  returnUrl: z.string().url(),
});

export const createCustomerPortal = createServerFn({ method: 'POST' })
  .validator(createPortalSchema)
  .handler(async ({ data }) => {
    const provider = getPaymentProvider(websiteConfig.payment.provider);
    return provider.createCustomerPortalLink(data);
  });
```

**Step 10.5: 写入 `src/routes/api/webhooks/stripe.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getPaymentProvider } from '@/payment';
import { websiteConfig } from '@/config/website';
import { createDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export const Route = createFileRoute('/api/webhooks/stripe')({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const env = (context as { cloudflare: { env: Env } }).cloudflare.env;
        const rawBody = await request.text();
        const signature = request.headers.get('stripe-signature') ?? '';
        const provider = getPaymentProvider(websiteConfig.payment.provider);

        if (!provider.verifyWebhook(rawBody, signature)) {
          return new Response('invalid signature', { status: 400 });
        }
        const event = provider.parseWebhookEvent(rawBody, signature);
        const db = createDb(env.DB);

        switch (event.type) {
          case 'checkout.session.completed': {
            const s = event.data.object as Stripe.Checkout.Session;
            await db.insert(schema.subscriptions).values({
              id: `sub_${s.id}`,
              userId: String(s.metadata?.userId ?? ''),
              customerId: String(s.customer ?? ''),
              subscriptionId: String(s.subscription ?? ''),
              status: 'active',
              priceId: '',
            });
            break;
          }
          case 'invoice.paid': {
            const inv = event.data.object as Stripe.Invoice;
            await db.insert(schema.payments).values({
              id: `pay_${inv.id}`,
              userId: null,
              type: inv.subscription ? 'subscription' : 'invoice',
              stripeInvoiceId: inv.id,
              status: 'paid',
              amount: inv.amount_paid,
              currency: inv.currency,
              paidAt: new Date(inv.created * 1000),
            });
            break;
          }
          case 'customer.subscription.updated':
          case 'customer.subscription.created': {
            const sub = event.data.object as Stripe.Subscription;
            await db
              .update(schema.subscriptions)
              .set({
                status: sub.status,
                priceId: sub.items.data[0]?.price.id ?? '',
                currentPeriodStart: new Date(sub.current_period_start * 1000),
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
              })
              .where(eq(schema.subscriptions.subscriptionId, sub.id));
            break;
          }
          case 'customer.subscription.deleted': {
            const sub = event.data.object as Stripe.Subscription;
            await db
              .update(schema.subscriptions)
              .set({ status: 'canceled', cancelAtPeriodEnd: true })
              .where(eq(schema.subscriptions.subscriptionId, sub.id));
            break;
          }
          case 'charge.refunded': {
            const ch = event.data.object as Stripe.Charge;
            await db
              .update(schema.payments)
              .set({ status: 'refunded', refundedAt: new Date() })
              .where(eq(schema.payments.stripeChargeId, ch.id));
            break;
          }
        }

        return new Response('ok');
      },
    },
  },
});
```

**Step 10.6: 在 `src/worker.ts` 注册**

```ts
import { registerPaymentProvider, StripePaymentProvider } from '@/payment';

if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
  registerPaymentProvider('stripe', () => new StripePaymentProvider(env.STRIPE_SECRET_KEY!, env.STRIPE_WEBHOOK_SECRET!));
}
```

**Step 10.7: Commit**

```bash
git add src/payment src/api/payment.ts src/routes/api/webhooks/stripe.ts src/worker.ts
git commit -m "feat(payment): Stripe provider + webhook 路由"
```

---

### Task 11: Auth 路由（登录/注册/重置）

**Files:**
- Create: `src/routes/{-$locale}/auth/login.tsx`
- Create: `src/routes/{-$locale}/auth/register.tsx`
- Create: `src/routes/{-$locale}/auth/forgot-password.tsx`
- Create: `src/routes/{-$locale}/auth/reset-password.tsx`
- Create: `src/routes/{-$locale}/auth/error.tsx`

**Step 11.1: 添加 shadcn 表单组件**

```bash
pnpm dlx shadcn@latest add input label form card
```

**Step 11.2: 写入 `src/routes/{-$locale}/auth/login.tsx`**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { signIn } from '@/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/{-$locale}/auth/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">登录</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await signIn.email({
            email: String(form.get('email')),
            password: String(form.get('password')),
          });
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">密码</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full">登录</Button>
      </form>
    </main>
  );
}
```

**Step 11.3: 写入 `src/routes/{-$locale}/auth/register.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { signUp } from '@/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/{-$locale}/auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">注册</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await signUp.email({
            email: String(form.get('email')),
            password: String(form.get('password')),
            name: String(form.get('name')),
          });
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="name">昵称</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">密码（≥ 8 字符）</Label>
          <Input id="password" name="password" type="password" minLength={8} required />
        </div>
        <Button type="submit" className="w-full">注册</Button>
      </form>
    </main>
  );
}
```

**Step 11.4: 写入 `src/routes/{-$locale}/auth/forgot-password.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { authClient } from '@/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/{-$locale}/auth/forgot-password')({
  component: ForgotPage,
});

function ForgotPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">找回密码</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await authClient.requestPasswordReset({
            email: String(form.get('email')),
            redirectTo: '/auth/reset-password',
          });
        }}
        className="space-y-4"
      >
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" name="email" type="email" required />
        <Button type="submit" className="w-full">发送重置链接</Button>
      </form>
    </main>
  );
}
```

**Step 11.5: 写入 `src/routes/{-$locale}/auth/reset-password.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { authClient } from '@/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/{-$locale}/auth/reset-password')({
  component: ResetPage,
});

function ResetPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">重置密码</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await authClient.resetPassword({
            newPassword: String(form.get('password')),
          });
        }}
        className="space-y-4"
      >
        <Label htmlFor="password">新密码（≥ 8 字符）</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
        <Button type="submit" className="w-full">提交</Button>
      </form>
    </main>
  );
}
```

**Step 11.6: 写入 `src/routes/{-$locale}/auth/error.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$locale}/auth/error')({
  component: ErrorPage,
});

function ErrorPage() {
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <h1 className="mb-4 text-2xl font-bold">认证出错</h1>
      <p className="mb-6">链接可能已过期或无效。</p>
      <Link to="/auth/login" className="text-blue-500 underline">返回登录</Link>
    </main>
  );
}
```

**Step 11.7: Commit**

```bash
git add src/routes/{-\$locale}/auth
git commit -m "feat(auth): 登录/注册/重置密码路由"
```

---

### Task 12: Dashboard 与 Billing 页面

**Files:**
- Create: `src/routes/{-$locale}/dashboard/__layout.tsx`
- Create: `src/routes/{-$locale}/dashboard/index.tsx`
- Create: `src/routes/{-$locale}/dashboard/billing.tsx`
- Create: `src/routes/{-$locale}/dashboard/files.tsx`
- Create: `src/routes/{-$locale}/dashboard/api-keys.tsx`
- Create: `src/routes/{-$locale}/dashboard/settings.tsx`

**Step 12.1: 写入 `src/routes/{-$locale}/dashboard/__layout.tsx`**

```tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { authClient } from '@/auth/client';

export const Route = createFileRoute('/{-$locale}/dashboard')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: '/auth/login' });
    return { user: session.data.user };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <nav className="space-y-2 text-sm">
          <a href="/dashboard">总览</a>
          <a href="/dashboard/billing">订阅</a>
          <a href="/dashboard/files">文件</a>
          <a href="/dashboard/api-keys">API Keys</a>
          <a href="/dashboard/settings">设置</a>
        </nav>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  );
}
```

**Step 12.2: 写入 `src/routes/{-$locale}/dashboard/index.tsx`**

```tsx
import { createFileRoute, useRouteContext } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$locale}/dashboard/')({
  component: DashboardHome,
});

function DashboardHome() {
  const { user } = Route.useRouteContext();
  return (
    <div>
      <h1 className="text-2xl font-bold">欢迎，{user.name ?? user.email}</h1>
      <p className="mt-4 text-muted-foreground">从左侧菜单管理订阅、文件与账户。</p>
    </div>
  );
}
```

**Step 12.3: 写入 `src/routes/{-$locale}/dashboard/billing.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { createCustomerPortal } from '@/api/payment';

export const Route = createFileRoute('/{-$locale}/dashboard/billing')({
  component: BillingPage,
});

function BillingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">订阅管理</h1>
      <Button
        className="mt-4"
        onClick={async () => {
          const result = await createCustomerPortal({
            data: {
              customerId: 'cus_placeholder',
              returnUrl: `${window.location.origin}/dashboard/billing`,
            },
          });
          window.location.href = result.url;
        }}
      >
        管理订阅
      </Button>
    </div>
  );
}
```

> `cus_placeholder` 在 Sub-Plan D 由真实订阅查询替换。

**Step 12.4: 写入 `src/routes/{-$locale}/dashboard/files.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$locale}/dashboard/files')({
  component: FilesPage,
});

function FilesPage() {
  return <div><h1 className="text-2xl font-bold">文件</h1><p>上传与列表（Sub-Plan D 详细化）。</p></div>;
}
```

**Step 12.5: 写入 `src/routes/{-$locale}/dashboard/api-keys.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$locale}/dashboard/api-keys')({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  return <div><h1 className="text-2xl font-bold">API Keys</h1><p>管理你的 API Key。</p></div>;
}
```

**Step 12.6: 写入 `src/routes/{-$locale}/dashboard/settings.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { authClient } from '@/auth/client';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/{-$locale}/dashboard/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">设置</h1>
      <Button
        variant="destructive"
        className="mt-4"
        onClick={async () => {
          if (!confirm('确定删除账号？此操作不可恢复。')) return;
          await authClient.deleteUser();
        }}
      >
        删除账户
      </Button>
    </div>
  );
}
```

**Step 12.7: Commit**

```bash
git add src/routes/{-\$locale}/dashboard
git commit -m "feat(dashboard): 总览/订阅/文件/API Keys/设置页面"
```

---

### Task 13: Admin 最小版

**Files:**
- Create: `src/routes/{-$locale}/admin/__layout.tsx`
- Create: `src/routes/{-$locale}/admin/index.tsx`
- Create: `src/routes/{-$locale}/admin/users.tsx`
- Create: `src/api/users.ts`

**Step 13.1: 写入 `src/api/users.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

const listSchema = z.object({ search: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) });

export const listUsers = createServerFn({ method: 'POST' })
  .validator(listSchema)
  .handler(async ({ data, context }) => {
    const env = (context as { cloudflare: { env: Env } }).cloudflare.env;
    const db = createDb(env.DB);
    const all = await db.select().from(schema.users).limit(data.limit);
    return data.search ? all.filter((u) => u.email.includes(data.search!)) : all;
  });

const banSchema = z.object({ userId: z.string(), reason: z.string().optional(), expiresAt: z.number().optional() });

export const setBanStatus = createServerFn({ method: 'POST' })
  .validator(banSchema)
  .handler(async ({ data, context }) => {
    const env = (context as { cloudflare: { env: Env } }).cloudflare.env;
    const db = createDb(env.DB);
    await db
      .update(schema.users)
      .set({
        banned: true,
        banReason: data.reason ?? null,
        banExpires: data.expiresAt ? new Date(data.expiresAt * 1000) : null,
      })
      .where(eq(schema.users.id, data.userId));
    return { ok: true };
  });
```

**Step 13.2: 写入 `src/routes/{-$locale}/admin/__layout.tsx`**

```tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { authClient } from '@/auth/client';

export const Route = createFileRoute('/{-$locale}/admin')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: '/auth/login' });
    const role = (session.data.user as { role?: string }).role ?? 'user';
    if (!['admin', 'superadmin'].includes(role)) throw redirect({ to: '/dashboard' });
    return { user: session.data.user };
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">管理后台</h1>
      <Outlet />
    </div>
  );
}
```

**Step 13.3: 写入 `src/routes/{-$locale}/admin/index.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/{-$locale}/admin/')({
  component: AdminHome,
});

function AdminHome() {
  return (
    <nav className="space-y-2 text-sm">
      <Link to="/admin/users" className="block text-blue-500 underline">用户管理</Link>
    </nav>
  );
}
```

**Step 13.4: 写入 `src/routes/{-$locale}/admin/users.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listUsers, setBanStatus } from '@/api/users';

export const Route = createFileRoute('/{-$locale}/admin/users')({
  component: UsersPage,
});

function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; banned: boolean }>>([]);

  async function refresh() {
    const result = await listUsers({ data: { search, limit: 50 } });
    setUsers(result as never);
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Input placeholder="搜索邮箱" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={refresh}>刷新</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th>邮箱</th><th>角色</th><th>状态</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.banned ? '已禁用' : '正常'}</td>
              <td>
                {!u.banned && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await setBanStatus({ data: { userId: u.id, reason: 'admin action' } });
                      refresh();
                    }}
                  >
                    禁用
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 13.5: Commit**

```bash
git add src/api/users.ts src/routes/{-\$locale}/admin
git commit -m "feat(admin): 用户列表 + 禁用功能"
```

---

### Task 14: Pricing 页面（订阅入口）

**Files:**
- Create: `src/routes/{-$locale}/pricing.tsx`
- Create: `src/lib/price-plan.ts`
- Create: `tests/unit/price-plan.test.ts`

**Step 14.1: 写入 `src/lib/price-plan.ts`**

```ts
import { websiteConfig } from '@/config/website';

export function getPlan(id: string) {
  return websiteConfig.payment.price.plans[id];
}

export function getPlanPrices(planId: string) {
  return getPlan(planId)?.prices ?? [];
}

export function formatPrice(amount: number, currency: string, locale: 'zh' | 'en' = 'zh') {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
```

**Step 14.2: 写入 `tests/unit/price-plan.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/price-plan';

describe('formatPrice', () => {
  it('以分单位金额与币种格式化', () => {
    expect(formatPrice(990, 'USD', 'en')).toMatch(/\$9\.90/);
  });

  it('本地化为中文', () => {
    expect(formatPrice(9900, 'CNY', 'zh')).toMatch(/￥|¥/);
  });
});
```

**Step 14.3: 写入 `src/routes/{-$locale}/pricing.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { websiteConfig } from '@/config/website';
import { formatPrice, getPlanPrices } from '@/lib/price-plan';
import { createCheckoutSession } from '@/api/payment';
import { authClient } from '@/auth/client';

export const Route = createFileRoute('/{-$locale}/pricing')({
  component: PricingPage,
});

function PricingPage() {
  const plans = Object.values(websiteConfig.payment.price.plans);
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-3xl font-bold text-center">价格方案</h1>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="p-6">
            <h2 className="text-xl font-semibold">{plan.id}</h2>
            {plan.prices.map((p, i) => (
              <div key={i} className="mt-2">
                <span className="text-2xl font-bold">{formatPrice(p.amount, p.currency, 'zh')}</span>
                <span className="text-sm text-muted-foreground">/{p.interval ?? '一次性'}</span>
              </div>
            ))}
            <Button
              className="mt-4 w-full"
              disabled={plan.isFree}
              onClick={async () => {
                const session = await authClient.getSession();
                const price = plan.prices[0];
                if (!price) return;
                const result = await createCheckoutSession({
                  data: {
                    priceId: price.priceId,
                    userId: session.data?.user.id ?? '',
                    customerEmail: session.data?.user.email ?? '',
                    successUrl: `${window.location.origin}/dashboard/billing`,
                    cancelUrl: `${window.location.origin}/pricing`,
                    mode: price.type === 'subscription' ? 'subscription' : 'payment',
                    locale: 'zh',
                  },
                });
                window.location.href = result.url;
              }}
            >
              {plan.isFree ? '当前方案' : '订阅'}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

**Step 14.4: 扩展 websiteConfig（补充 payment 字段）**

> Sub-Plan A 已写入骨架；本 task 扩展 payment 字段：

```ts
payment: {
  enable: !!env.VITE_PAYMENT_PROVIDER,
  provider: env.VITE_PAYMENT_PROVIDER,
  price: {
    currency: 'USD',
    plans: {
      free: { id: 'free', isFree: true, prices: [] },
      pro: {
        id: 'pro', popular: true, isFree: false, isLifetime: false,
        prices: [
          { type: 'subscription', priceId: env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? '', amount: 990, currency: 'USD', interval: 'month' },
          { type: 'subscription', priceId: env.VITE_STRIPE_PRICE_PRO_YEARLY ?? '', amount: 9900, currency: 'USD', interval: 'year' },
        ],
      },
      lifetime: {
        id: 'lifetime', isFree: false, isLifetime: true,
        prices: [
          { type: 'one_time', priceId: env.VITE_STRIPE_PRICE_LIFETIME ?? '', amount: 19900, currency: 'USD', allowPromotionCode: true },
        ],
      },
    },
  },
},
mail: {
  enable: true,
  provider: env.CLOUDFLARE_EMAIL_SENDER ? 'cloudflare' : 'resend',
  fromEmail: 'SaaS Template <support@example.com>',
  supportEmail: 'SaaS Template <support@example.com>',
},
newsletter: {
  enable: true,
  provider: env.RESEND_AUDIENCE_ID ? 'resend' : 'beehiiv',
  autoSubscribeAfterSignUp: true,
},
notification: {
  enable: !!env.DISCORD_WEBHOOK_URL,
  provider: env.DISCORD_WEBHOOK_URL ? 'discord' : undefined,
},
```

**Step 14.5: 测试**

```bash
pnpm run test
```

预期：price-plan.test.ts 通过。

**Step 14.6: Commit**

```bash
git add src/lib/price-plan.ts tests/unit/price-plan.test.ts src/routes/{-\$locale}/pricing.tsx src/config/website.ts
git commit -m "feat(pricing): 价格页 + price-plan 助手"
```

---

### Task 15: Setup CLI

**Files:**
- Create: `scripts/setup.ts`
- Modify: `package.json`（追加 script）

**Step 15.1: 写入 `scripts/setup.ts`**

```ts
#!/usr/bin/env tsx
import { input, password, select, confirm } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

function run(cmd: string) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function readEnv(): Record<string, string> {
  if (!existsSync('.env')) return {};
  const raw = readFileSync('.env', 'utf-8');
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

function writeEnv(env: Record<string, string>) {
  const content = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync('.env', content);
  console.log('✅ .env 已更新');
}

async function main() {
  console.log('🚀 SaaS Template Setup\n');

  // 0. 校验 wrangler 登录
  try {
    run('wrangler whoami');
  } catch {
    console.error('❌ wrangler 未登录。请先运行 `wrangler login`。');
    process.exit(1);
  }

  // 1. 项目名与资源名
  const projectName = await input({ message: '项目名（用于 Cloudflare 资源前缀）', default: 'saas-template' });
  const dbName = `${projectName}-db`;
  const r2Name = `${projectName}-uploads`;
  const kvName = `${projectName}-cache`;

  // 2. 创建 D1
  let dbId = '';
  try {
    const out = execSync(`wrangler d1 create ${dbName} --json`).toString();
    dbId = (JSON.parse(out) as { uuid: string }).uuid;
  } catch {
    const out = execSync(`wrangler d1 create ${dbName}`).toString();
    const m = out.match(/database_id = "([a-f0-9-]+)"/);
    if (!m) throw new Error('无法解析 D1 database_id');
    dbId = m[1];
  }
  console.log(`✅ D1 创建：${dbId}`);

  // 3. 创建 R2
  try {
    run(`wrangler r2 bucket create ${r2Name}`);
  } catch {
    console.warn(`R2 bucket ${r2Name} 已存在`);
  }

  // 4. 创建 KV
  let kvId = '';
  try {
    const out = execSync(`wrangler kv namespace create ${kvName}`).toString();
    const m = out.match(/id = "([a-f0-9]+)"/);
    if (!m) throw new Error('无法解析 KV id');
    kvId = m[1];
  } catch {
    console.warn(`KV namespace ${kvName} 已存在`);
  }

  // 5. 生成 Better Auth secret
  const authSecret = randomBytes(32).toString('base64');

  // 6. Stripe 配置
  const stripeChoice = await select({
    message: 'Stripe 配置？',
    choices: [
      { name: 'skip', value: 'skip' },
      { name: 'configure', value: 'configure' },
    ],
  });
  const env = readEnv();
  if (stripeChoice === 'configure') {
    env.VITE_PAYMENT_PROVIDER = 'stripe';
    env.STRIPE_SECRET_KEY = await password({ message: 'STRIPE_SECRET_KEY' });
    env.STRIPE_WEBHOOK_SECRET = await password({ message: 'STRIPE_WEBHOOK_SECRET' });
    env.VITE_STRIPE_PRICE_PRO_MONTHLY = await input({ message: 'VITE_STRIPE_PRICE_PRO_MONTHLY' });
    env.VITE_STRIPE_PRICE_PRO_YEARLY = await input({ message: 'VITE_STRIPE_PRICE_PRO_YEARLY' });
    env.VITE_STRIPE_PRICE_LIFETIME = await input({ message: 'VITE_STRIPE_PRICE_LIFETIME' });
  }

  // 7. Email provider
  const mailProvider = await select({
    message: '邮件 provider？',
    choices: [
      { name: 'cloudflare', value: 'cloudflare' },
      { name: 'resend', value: 'resend' },
      { name: 'skip', value: 'skip' },
    ],
  });
  if (mailProvider === 'cloudflare') {
    env.CLOUDFLARE_ACCOUNT_ID = await input({ message: 'CLOUDFLARE_ACCOUNT_ID' });
    env.CLOUDFLARE_API_TOKEN = await password({ message: 'CLOUDFLARE_API_TOKEN' });
    env.CLOUDFLARE_EMAIL_SENDER = await input({ message: 'CLOUDFLARE_EMAIL_SENDER (e.g. support@example.com)' });
  } else if (mailProvider === 'resend') {
    env.RESEND_API_KEY = await password({ message: 'RESEND_API_KEY' });
  }

  // 8. Discord Webhook
  const enableDiscord = await confirm({ message: '启用 Discord 通知？', default: false });
  if (enableDiscord) {
    env.DISCORD_WEBHOOK_URL = await input({ message: 'DISCORD_WEBHOOK_URL' });
  }

  // 9. 写入 .env
  env.CLOUDFLARE_DATABASE_ID = dbId;
  env.BETTER_AUTH_SECRET = authSecret;
  if (!existsSync('.env.example')) {
    execSync('cp .env.example .env');
  }
  writeEnv(env);

  // 10. 写入 wrangler.jsonc binding
  const wrangler = JSON.parse(readFileSync('wrangler.jsonc', 'utf-8')) as Record<string, unknown>;
  wrangler.d1_databases = [{ binding: 'DB', database_name: dbName, database_id: dbId, migrations_dir: './src/db/migrations' }];
  wrangler.r2_buckets = [{ binding: 'BUCKET', bucket_name: r2Name }];
  wrangler.kv_namespaces = [{ binding: 'CACHE', id: kvId }];
  writeFileSync('wrangler.jsonc', JSON.stringify(wrangler, null, 2));

  // 11. 迁移
  run('pnpm run db:migrate:local');

  console.log('\n✅ Setup 完成。下一步：');
  console.log('  pnpm dev    启动开发服务器');
  console.log('  pnpm deploy 部署到 Cloudflare');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 15.2: 安装 inquirer**

```bash
pnpm add inquirer @inquirer/prompts
```

**Step 15.3: 在 `package.json` scripts 追加**

```json
"setup": "tsx scripts/setup.ts"
```

**Step 15.4: Commit**

```bash
git add scripts/setup.ts package.json pnpm-lock.yaml
git commit -m "feat(cli): pnpm run setup 交互式脚手架"
```

---

### Task 16: wrangler.jsonc 完整绑定

**Files:**
- Modify: `wrangler.jsonc`

**Step 16.1: 完整 `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "saas-template",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./src/worker.ts",
  "vars": {
    "NODE_ENV": "production"
  },
  "observability": { "enabled": true },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "REPLACE_ME",
      "migrations_dir": "./src/db/migrations"
    }
  ],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "saas-template-uploads" }
  ],
  "kv_namespaces": [
    { "binding": "CACHE", "id": "REPLACE_ME" }
  ]
}
```

> 占位 `REPLACE_ME` 由 setup CLI 写入。

**Step 16.2: Commit**

```bash
git add wrangler.jsonc
git commit -m "chore: wrangler.jsonc 完整 binding 模板"
```

---

### Task 17: Sub-Plan B 端到端验证

**Files:** 无新增

**Step 17.1: 类型校验**

```bash
pnpm run typecheck
```

预期：0 错误。如有错误按提示修复。

**Step 17.2: 单元测试**

```bash
pnpm run test
```

预期：env/cache/storage/price-plan 全部 PASS。

**Step 17.3: 完整 check**

```bash
pnpm run check
```

预期：通过。

**Step 17.4: 构建**

```bash
pnpm run build
```

预期：`dist/client` 与 `dist/server` 产出；构建日志无 `error`。

**Step 17.5: 客户端 bundle 校验**

```bash
pnpm run check:client-bundle
```

预期：✅。

**Step 17.6: dev server 冒烟**

```bash
pnpm dev
```

- `curl -s http://localhost:3000` 返回 HTML 含 `SaaS Template`
- `curl -s http://localhost:3000/pricing` 返回价格页 HTML
- `curl -s http://localhost:3000/auth/login` 返回登录页 HTML

**Step 17.7: Commit（如有格式调整）**

```bash
git add -A
git commit -m "chore: Sub-Plan B 收尾（lint + 测试 + 构建验证）" --allow-empty
```

---

## Sub-Plan B 完成标志

- [ ] Drizzle schema 已生成迁移
- [ ] Better Auth 注册 / 登录 / 重置流程可走通（dev 模式）
- [ ] Stripe provider 已注册，webhook 路由返回 200
- [ ] Newsletter subscribe / unsubscribe / checkStatus 实现
- [ ] Notification Discord provider 可发 webhook
- [ ] Contact 表单提交后 mail + Discord 触发
- [ ] Admin 用户管理页可见（角色 admin/superadmin）
- [ ] Pricing 页可点击触发 checkout session
- [ ] `pnpm run setup` 脚本完整执行无崩溃
- [ ] 单元测试 + 类型校验 + 构建全部通过

进入 Sub-Plan C 之前，确保以上所有项就位。