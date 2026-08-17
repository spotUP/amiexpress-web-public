/**
 * Staleness guard for Doors/door-manager/repo-types.generated.ts.
 *
 * repo-client.ts (Doors/door-manager) cannot import DoorRepoManifest /
 * ManifestDoor directly from web/backend/src/doors/door-repo-manifest.ts --
 * that trips TS6059 (cross-package rootDir violation) and would
 * duplicate-compile backend server code into the door's dist (see
 * repo-client.ts's own doc comment and task-5-report.md for the full
 * analysis). Instead, Doors/door-manager/scripts/gen-repo-types.ts extracts
 * those two interfaces VERBATIM from the real source and writes a local
 * mirror, repo-types.generated.ts, which repo-client.ts imports.
 *
 * That mirror has no automatic drift protection on its own: nothing stops
 * someone from editing door-repo-manifest.ts's manifest shape (add/rename/
 * remove a field) without re-running `npm run gen:repo-types`. A field ADD
 * is invisible until a consumer happens to touch it; a RENAME/REMOVE is
 * worse -- the mirror keeps declaring the OLD shape, repo-client.ts
 * type-checks cleanly against a shape the server no longer actually sends,
 * and the drift only surfaces at runtime (the same failure category the
 * plan already ruled on for Task 2's duplicated revision-reader).
 *
 * This test re-runs the exact extraction logic the CLI uses (imported
 * directly, not spawned as a subprocess) against a temp output path and
 * diffs the result against the COMMITTED repo-types.generated.ts. Any
 * difference means the committed mirror is stale relative to its source.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeGeneratedTypes } from '../../../../Doors/door-manager/scripts/gen-repo-types';

const COMMITTED_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'Doors',
  'door-manager',
  'repo-types.generated.ts'
);

describe('Doors/door-manager/repo-types.generated.ts staleness guard', () => {
  it('matches a fresh run of the generator against the real source (fails loudly with a fix command when stale)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-types-staleness-'));
    const freshPath = path.join(tmpDir, 'repo-types.generated.ts');

    try {
      writeGeneratedTypes(freshPath);

      const fresh = fs.readFileSync(freshPath, 'utf8');
      const committed = fs.readFileSync(COMMITTED_PATH, 'utf8');

      if (fresh !== committed) {
        throw new Error(
          'Doors/door-manager/repo-types.generated.ts is STALE relative to its source ' +
            '(web/backend/src/doors/door-repo-manifest.ts). Run `npm run gen:repo-types` ' +
            'from Doors/door-manager and commit the result.'
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
