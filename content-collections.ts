import { defineCollection, defineConfig } from '@content-collections/core'
import { z } from 'zod'
import { defaultLocale, localeSchema } from './src/config/locale'
import { resolveContentLocale } from './src/lib/content-locale'

const docs = defineCollection({
  name: 'docs',
  directory: 'content/docs',
  include: '**/*.md',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    locale: localeSchema.default(defaultLocale),
    order: z.number().default(0),
    group: z.string().default(''),
    /** 最近更新日期（`YYYY-MM-DD`）；缺省为空串，页面不渲染该行。 */
    updated: z.string().default(''),
    content: z.string().optional(),
  }),
  transform: (doc) => ({ ...doc, locale: resolveContentLocale(doc._meta.fileName) }),
})

const blog = defineCollection({
  name: 'blog',
  directory: 'content/blog',
  include: '**/*.md',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string().datetime(),
    published: z.boolean().default(true),
    locale: localeSchema.default(defaultLocale),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    content: z.string().optional(),
  }),
  transform: (doc) => ({ ...doc, locale: resolveContentLocale(doc._meta.fileName) }),
})

const changelog = defineCollection({
  name: 'changelog',
  directory: 'content/changelog',
  include: '**/*.md',
  schema: z.object({
    title: z.string(),
    date: z.string().datetime(),
    summary: z.string(),
    locale: localeSchema.default(defaultLocale),
    content: z.string().optional(),
  }),
  transform: (doc) => ({ ...doc, locale: resolveContentLocale(doc._meta.fileName) }),
})

const legal = defineCollection({
  name: 'legal',
  directory: 'content/legal',
  include: '**/*.md',
  schema: z.object({
    title: z.string(),
    locale: localeSchema.default(defaultLocale),
    content: z.string().optional(),
  }),
  transform: (doc) => ({ ...doc, locale: resolveContentLocale(doc._meta.fileName) }),
})

export default defineConfig({
  content: [docs, blog, changelog, legal],
})
