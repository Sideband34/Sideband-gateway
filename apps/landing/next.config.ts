import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// Store badges render only when a real listing URL is configured. If one is, the official vendor
// artwork must be present too; fail the build rather than ship a broken or recreated badge.
const badges: [string, string][] = [
  ['NEXT_PUBLIC_APP_STORE_URL', 'public/badges/app-store.svg'],
  ['NEXT_PUBLIC_PLAY_STORE_URL', 'public/badges/google-play.png'],
];
for (const [env, file] of badges) {
  if (process.env[env]?.trim() && !existsSync(join(process.cwd(), file))) {
    throw new Error(`${env} is set but ${file} is missing. Add the official badge artwork first.`);
  }
}

// Static export: the landing site has no server logic and no secrets.
const config: NextConfig = { output: 'export', images: { unoptimized: true } };
export default config;
