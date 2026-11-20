import { createServerFn } from '@tanstack/react-start';

/**
 * Whether the documentation site is enabled.
 *
 * The switch lives in the config table (admin → General → Documentation) and
 * defaults to off. The database access stays behind a server function so
 * drizzle never reaches the client bundle.
 */
export const getDocsEnabledFn = createServerFn().handler(async () => {
  const { getAllConfigs } = await import('@/modules/config/service');
  const configs = await getAllConfigs();
  return configs.docs_enabled === 'true';
});
