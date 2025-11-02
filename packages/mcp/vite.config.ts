import { resolve } from 'path.ts';

import { defineConfig } from 'vitest/config.ts';

export default defineConfig({
  resolve: {
    alias: {
      '@app': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.test.ts',
        'build/',
      ],
    },
  },
});
