import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      // Files that need a DOM (jsdom) environment
      ['tests/unit/download.test.js', 'jsdom']
    ],
    include: ['tests/unit/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**']
  }
});
