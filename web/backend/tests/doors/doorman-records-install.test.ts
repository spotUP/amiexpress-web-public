/**
 * Task 5: DOORMAN records installs locally instead of faking catalog rows.
 *
 * A source-text guard, not a behavioral test: it asserts app.ts's install/
 * uninstall paths have been rewired onto door_installs (recordInstall/
 * removeInstall, Task 1) and no longer synthesize a fake door_catalog row
 * (upsertCatalogEntry) purely to give the old markInstalled/markUninstalled
 * calls something to write to. Behavioral coverage for the rewired install
 * flow lives in doorman-consumer-install.test.ts, which exercises
 * installConsumerDoor/extractAndRegisterDoor directly with injected deps.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractAndRegisterDoor } from '../../../../Doors/door-manager/install-core';

describe('DOORMAN install path', () => {
  const appSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'Doors', 'door-manager', 'app.ts'), 'utf-8');

  it('records the install in door_installs', () => {
    expect(appSrc).toMatch(/recordInstall/);
  });

  it('no longer synthesizes a catalog row to hang the install flag on', () => {
    expect(appSrc).not.toMatch(/upsertCatalogEntry/);
    expect(appSrc).not.toMatch(/markInstalled/);
  });

  it('uninstall removes the install record rather than clearing a catalog flag', () => {
    expect(appSrc).toMatch(/removeInstall/);
    expect(appSrc).not.toMatch(/markUninstalled/);
  });
});

// Task 4: extractAndRegisterDoor threads the archive name through to
// recordInstall, so the recorder (Task 3's recordDoorInstall) can write the
// install as a link to the catalog archive it actually came from, rather
// than a guess reconstructed later.
describe('DOORMAN install path: archive name reaches the recorder', () => {
  it('hands the recorder the archive the door came from', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-record-'));
    const installDir = path.join(root, 'Doors', 'AEHELP');
    const infoPath = path.join(root, 'Commands', 'BBSCmd', 'AEHELP.info');
    fs.mkdirSync(path.dirname(infoPath), { recursive: true });
    const recorded: Array<[string, string, string]> = [];

    await extractAndRegisterDoor(
      path.join(root, 'AEHELP.LHA'), installDir, infoPath, 'XIM', 'AEHelp', 'AEHELP',
      {
        extractArchiveTo: async () => { fs.mkdirSync(installDir, { recursive: true }); return { ok: true, fileCount: 1 }; },
        findExtractedBinary: () => 'AEHelp',
        writeInfoFile: (p: string, c: string) => fs.writeFileSync(p, c),
        recordInstall: (cmd: string, dir: string, archive: string) => { recorded.push([cmd, dir, archive]); },
        refreshDoorRegistry: async () => true,
      } as any,
      'AEHELP.LHA'
    );

    expect(recorded).toEqual([['AEHELP', 'Doors/AEHELP', 'AEHELP.LHA']]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
