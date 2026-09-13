/**
 * Storage - one implementation, re-exported.
 *
 * This file used to be a SECOND, near-identical copy of `core/Storage.ts`
 * (the only difference was how `keys()` spelled its local variables), and
 * the copy that DOORS load is the other one: `tsconfig.json` includes
 * `core/**` and not `src/**`, and `@amiexpress/bbs-door-sdk/core` resolves
 * to `dist/core/index.js`. Only `server/index.ts` reaches in here, for
 * `src/core/Door`.
 *
 * That split is how the redeploy-data-loss guard came to test a file
 * nothing ships: `tests/unit/storage-basedir.test.ts` imported
 * `defaultBaseDir` from HERE, so deleting it from the shipped copy left
 * the suite green (2026-09-13). One implementation now, so the two cannot
 * drift again; the test points at the shipped path.
 */
export { Storage, defaultBaseDir } from '../../core/Storage';
