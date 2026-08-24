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
import * as path from 'path';

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
