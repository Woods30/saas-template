import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { config } from '@/config/db/schema';

const CONFIG_KEY = 'footer_badges';

/** Read directly so separate server instances cannot serve stale config cache data. */
export async function getStoredFooterBadges(): Promise<string | undefined> {
  const [row] = await db()
    .select({ value: config.value })
    .from(config)
    .where(eq(config.name, CONFIG_KEY))
    .limit(1);

  return row?.value ?? undefined;
}

/** Store the validated badge list in the shared config table. */
export async function saveStoredFooterBadges(value: string): Promise<void> {
  // One statement, including concurrent first saves; supported on D1 and
  // translated to onDuplicateKeyUpdate by the MySQL compatibility layer.
  await db()
    .insert(config)
    .values({ name: CONFIG_KEY, value })
    .onConflictDoUpdate({ target: config.name, set: { value } });
}
