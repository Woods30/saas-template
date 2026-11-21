import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const declaredTables = (dialect: string) => {
  const source = read(`src/config/db/schema.${dialect}.ts`);
  // Each template may alias its dialect constructor (`const table = mysqlTable`).
  return [
    ...source.matchAll(
      /export const (\w+) =\s*(?:sqliteTable|pgTable|mysqlTable|table)\(/g
    ),
  ]
    .map((match) => match[1])
    .sort();
};

// A dialect template that has drifted is not a formatting problem: a buyer who
// picks that DATABASE_PROVIDER gets tables the service code imports and the
// database does not have.
test('every dialect template declares the same tables', () => {
  const sqlite = declaredTables('sqlite');
  const postgres = declaredTables('postgres');
  const mysql = declaredTables('mysql');

  assert.deepEqual(postgres, sqlite, 'postgres template drifted from sqlite');
  assert.deepEqual(mysql, sqlite, 'mysql template drifted from sqlite');
});
