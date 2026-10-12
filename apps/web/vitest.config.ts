import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Cap workerów: jsdom worker ~2,3 GB RAM; przy 16 CPU vitest domyślnie
// spawnuje kilkanaście procesów naraz (incydent 2026-10-12: 16×2,4 GB = 37 GB
// i zamrożenie systemu przy równoległych gate'ach worktree). 2 wątki wystarczą.
const MAX_WORKERS = 2;

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
      css: false,
      pool: 'threads',
      poolOptions: {
        threads: {
          minThreads: 1,
          maxThreads: MAX_WORKERS,
        },
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/test/**',
          'src/**/*.test.{ts,tsx}',
          'src/main.tsx',
          'src/vite-env.d.ts',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },
    },
  })
);
