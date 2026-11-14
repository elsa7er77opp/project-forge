import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // The suite shares one database, and several tests assert on the absence of
    // another workspace's data. Running files in parallel would let one file's
    // fixtures appear in another's assertions, so they run one at a time. The
    // whole suite finishes in seconds, which makes this a cheap guarantee.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
