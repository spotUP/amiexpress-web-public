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

  // Uninstall used to remove the .info, the install_dir and the door_installs
  // row, but never touched door_installed_files - a stale row then named a
  // previous door's directory, and reusing that command later let a delete
  // act on the wrong door's files. Both branches of doInstallUninstall
  // (the successful delete and the "kept the files" refusal) call
  // removeInstall, so both must also clear the file rows.
  it('uninstall clears door_installed_files alongside every removeInstall call', () => {
    const removeInstallCalls = appSrc.match(/getInstallsRepo\(\)\?\.removeInstall\([^)]*\)/g) ?? [];
    // Excludes the function's own declaration line, matching only call sites.
    const clearCalls = appSrc.match(/clearInstalledFilesViaRecorder\(e\.[^)]*\)/g) ?? [];

    expect(removeInstallCalls.length).toBeGreaterThan(0);
    expect(clearCalls.length).toBe(removeInstallCalls.length);
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
