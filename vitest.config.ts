import { defineConfig } from 'vitest/config';

// Cold SDK/SQLite start can exceed vitest's 5 s default on a loaded Windows machine.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 } });
