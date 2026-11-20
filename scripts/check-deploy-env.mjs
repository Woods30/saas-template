#!/usr/bin/env node
/**
 * Pre-deploy gate: refuse to deploy with a missing or placeholder secret.
 *
 * Reads process.env first (CI/Workers/Docker), then falls back to the
 * dotenv files the app itself loads: .env.production, then .env.
 */
import { readFileSync } from 'node:fs';

const PLACEHOLDER = 'development-secret-change-in-production';

function readEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    const values = {};
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    return values;
  } catch {
    return {};
  }
}

const fileEnv = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.production'),
};
const env = { ...fileEnv, ...process.env };

const failures = [];

const authSecret = (env.AUTH_SECRET ?? '').trim();
if (!authSecret) failures.push('AUTH_SECRET is missing.');
else if (authSecret === PLACEHOLDER)
  failures.push('AUTH_SECRET is still the development placeholder.');

const encryptionKey = (env.CONFIG_ENCRYPTION_KEY ?? '').trim();
if (!encryptionKey)
  failures.push(
    'CONFIG_ENCRYPTION_KEY is missing — secrets stored in the config table would be unreadable after this deploy.'
  );
else if (encryptionKey.length < 32)
  failures.push('CONFIG_ENCRYPTION_KEY must be at least 32 characters.');

if (failures.length > 0) {
  console.error(
    'Refusing to deploy:\n' + failures.map((f) => `  - ${f}`).join('\n')
  );
  process.exit(1);
}

console.log('Deploy env check passed.');
