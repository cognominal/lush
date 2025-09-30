import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true, // Enables global test functions like describe, it, expect without imports
    environment: 'node', // Bun is Node-compatible, so this works; no native 'bun' environment in Vitest
    include: ['tests/**/*.{test,spec}.{ts,js}'], // Pattern to match test files
    pool: 'threads', // Optional: Use threads for better parallelism (Bun handles this efficiently)
    coverage: {
      provider: 'v8', // Use V8 for coverage reports (compatible with Bun)
      reporter: ['text', 'json', 'html'], // Output formats
      include: ['src/**/*.{ts,js}'], // Cover source files (adjust 'src' to your source dir)
      exclude: ['node_modules/**', 'tests/**', 'bun.lockb'], // Exclude Bun-specific files from coverage
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Optional: Alias for easier imports (e.g., import from '@/module')
    },
  },
});
