/**
 * No NEW file may become unreachable from the server or its scripts.
 *
 * On 2026-09-08 a parity audit found fixes that had been applied to files the
 * running server does not import: `handlers/command-handler/*` is a barrel
 * nothing imports, and the live dispatcher `handlers/command.handler.ts` kept
 * the old behaviour. The fixes were real, their tests passed, and the board did
 * not change. 50 files and about 15000 lines are unreachable today.
 *
 * This is the ratchet. The known-dead files are listed below and the list may
 * only shrink: delete one and remove its line. Add a new unreachable file and
 * this fails, naming it.
 *
 * It is deliberately not a "no dead code" rule - dead code is the symptom. The
 * failure it prevents is a fix that lands somewhere nothing runs.
 */
import * as path from 'path';
import { walk, entryPoints } from '../../dev-scripts/module-reachability';

/**
 * Unreachable as of 2026-09-08, each awaiting a disposition in the parity
 * plan's Phase 0 (thoughts/shared/plans/2026-09-08-express-parity-100.md).
 * Shrink this list; never grow it.
 */
const KNOWN_UNREACHABLE = new Set<string>([
  'src/amiga-emulation/AREXXDoorSession.ts',
  'src/amiga-emulation/PythonDoorSession.ts',
  'src/amiga-emulation/SystemStructures.ts',
  'src/amiga-emulation/api/AmiExpressLibrary.ts',
  'src/amiga-emulation/api/RexxArpLibrary.ts',
  'src/amiga-emulation/api/RexxSupportLibrary.ts',
  'src/amiga-emulation/api/rexx-path.ts',
  'src/amiga-emulation/constants/lvo-params.generated.ts',
  'src/amiga-emulation/constants/struct-fields.generated.ts',
  'src/amiga-emulation/doorHandler.ts',
  'src/amiga-emulation/session/lifecycle/index.ts',
  'src/amiga-emulation/structures/UserStructures.ts',
  'src/amiga-emulation/xim/host-service.ts',
  'src/amigaguide/AmigaGuideParser.ts',
  'src/amigaguide/AmigaGuideViewer.ts',
  'src/constants/security-levels.ts',
  'src/doors/door-path.util.ts',
  'src/doors/door-repo-manifest.ts',
  'src/handlers/command-handler/command-processing.ts',
  'src/handlers/command-handler/index.ts',
  'src/handlers/command-handler/internal-commands.ts',
  'src/handlers/command-handler/types.ts',
  'src/handlers/door-handler/door-types.ts',
  'src/handlers/examples/modern-handler.example.ts',
  'src/handlers/operations/navigation-quick.handler.ts',
  'src/nodes/index.ts',
  'src/server/api-routes.ts',
  'src/server/file-routes.ts',
  'src/services/mrc-client.ts',
  'src/utils/background-check.util.ts',
  'src/utils/diz-fallback.util.ts',
  'src/utils/file-io.util.ts',
  'src/utils/format-util.ts',
  'src/utils/iff-parser.util.ts',
  'src/utils/lha-list-parser.ts',
  'src/utils/multitop-generator.ts',
  'src/utils/string-util.ts',
]);

const BACKEND = path.resolve(__dirname, '..', '..');
const relative = (file: string): string => path.relative(BACKEND, file);

describe('every file under src is reachable from an entry point', () => {
  it('counts the admin UI as an entry point, not just the server', () => {
    // web/config-app imports backend modules through the `@bbs/screens/*` and
    // `@bbs/config-services/*` aliases. src/screens/rip-document.ts is live in
    // the RIP screen editor and reached by no backend entry point at all; the
    // first version of this tool called it dead, and deleting it on that
    // verdict would have broken the editor.
    const reachable = new Set([...walk().reachable].map(relative));

    expect(reachable.has(path.join('src', 'screens', 'rip-document.ts'))).toBe(true);
  });

  it('has no unreachable file that is not already known', () => {
    const found = walk().unreachable.map(relative);

    const surprises = found.filter((file) => !KNOWN_UNREACHABLE.has(file));

    expect(surprises).toEqual([]);
  });

  it('does not list a file that has since been deleted or wired up', () => {
    // The other direction: when a file is deleted or imported, its line here
    // must go too, or the list rots into a lie about what is dead.
    const found = new Set(walk().unreachable.map(relative));

    const stale = [...KNOWN_UNREACHABLE].filter((file) => !found.has(file));

    expect(stale).toEqual([]);
  });

  it('walks from the server entry and every standalone script', () => {
    // A regression guard for the tool itself: judging the tree against
    // src/index.ts alone called 2500 lines of working script tooling dead.
    const entries = entryPoints();

    expect(entries.some((file) => file.endsWith(path.join('src', 'index.ts')))).toBe(true);
    expect(entries.length).toBeGreaterThan(1);
  });

  it('follows a bare side-effect import', () => {
    // `import './door-catalog.service';` has no `from`, and the first version
    // of this tool could not see it - so it reported the module dead one line
    // after it had been deliberately wired up with exactly that syntax, for
    // exactly the reason it must not be deleted (DOORMAN finds it through
    // require.cache). Rebuilding the regex per file also dropped its `m` flag,
    // which anchored ^ to the whole file and hid four more live modules.
    const reachable = new Set([...walk().reachable].map(relative));

    expect(reachable.has(path.join('src', 'doors', 'door-catalog.service.ts'))).toBe(true);
  });

  it('resolves NodeNext .js specifiers back to their .ts source', () => {
    // The first run of the tool reported the whole 68K emulation subtree dead
    // because `import { DoorLoader } from "./DoorLoader.js"` did not resolve.
    const reachable = new Set([...walk().reachable].map(relative));

    expect(reachable.has(path.join('src', 'amiga-emulation', 'DoorLoader.ts'))).toBe(true);
    expect(reachable.has(path.join('src', 'amiga-emulation', 'session', 'DoorMessageHandler.ts'))).toBe(true);
  });
});
