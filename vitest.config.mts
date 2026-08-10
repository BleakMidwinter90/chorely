import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**/*.ts'],
      // The domain layer is the product's core reasoning. It gets held to a
      // higher standard than the UI around it.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
  resolve: {
    alias: { '@': new URL('.', import.meta.url).pathname.replace(/\/$/, '') },
  },
});
