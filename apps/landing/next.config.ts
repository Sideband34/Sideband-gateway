import type { NextConfig } from 'next';

// Static export: the landing site has no server logic and no secrets.
const config: NextConfig = { output: 'export', images: { unoptimized: true } };
export default config;
