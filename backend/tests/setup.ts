import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Runs before any module under test is imported.
 *
 * Two settings must be in place first. STORAGE_DIR is resolved once, when the
 * storage module loads, so pointing it at a temporary directory afterwards
 * would have no effect and the suite would write into the real volume. The JWT
 * secrets are set so a developer without a configured .env can still run the
 * tests; a value here is never a production credential, because these tokens
 * are only ever verified by this process.
 */
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'forge-test-storage-'));
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-not-used-outside-tests';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-not-used-outside-tests';
process.env.TRUST_PROXY ??= 'false';
