#!/usr/bin/env node
// Check the Cloudflare working config before a build.
//
// The nitro cloudflare preset reads wrangler.jsonc with JSON.parse, so the
// file has to be plain JSON: no `//` comments and no trailing commas — even
// though wrangler itself accepts both. This turns a cryptic nitro build
// error into a message that says what to do.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

// nitro looks for wrangler.json first, then wrangler.jsonc.
const candidates = ['wrangler.json', 'wrangler.jsonc'];
const path = candidates
  .map((name) => resolve(root, name))
  .find((candidate) => existsSync(candidate));

if (path === undefined) {
  console.log(
    '[check-wrangler-config] no wrangler.json / wrangler.jsonc — skipping (Node-only deploy).'
  );
  process.exit(0);
}

const raw = readFileSync(path, 'utf8');

try {
  JSON.parse(raw);
} catch (error) {
  console.error(`[check-wrangler-config] ${path} is not valid JSON.`);
  console.error(
    '  The cloudflare build parses it with JSON.parse: comments (//) and trailing commas break it.'
  );
  console.error(
    '  Start from wrangler.example.jsonc and fill in the values without adding comments.'
  );
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log(`[check-wrangler-config] ${path} is valid JSON.`);
