import { defineConfig } from 'vitest/config';

// Local overrides such as TEST_DATABASE_URL live in apps/api/.env (CI sets them directly).
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: fall back to the defaults (docker compose on port 5433).
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/helpers/global-setup.ts'],
          // Integration files share one database, so they run one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
