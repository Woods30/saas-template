import { defineConfig } from 'drizzle-kit'

// Local dev config: uses a local SQLite file via better-sqlite3 / libsql.
// No `driver` key = plain SQLite connection via dbCredentials.url.
// drizzle-kit@0.31.11 supports { dialect: 'sqlite', dbCredentials: { url: string } }.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    // file path is relative to cwd (project root)
    url: process.env.DATABASE_URL ?? 'file:./src/db/migrations/dev.db',
  },
  verbose: true,
  strict: true,
})
