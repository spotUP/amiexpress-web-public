/**
 * EXECUTE_ON_* / EXECUTE_ASYNC_ON_* reach the sysop.
 *
 * `batch-scheduler.ts` has run these hooks since it was written - eight events
 * (express.e:6666-6744), each with a synchronous and an asynchronous form -
 * and nothing in the admin could set one, so a sysop had to write them into
 * bbsConfig.info by hand.
 *
 * The chain that has to hold for the field to survive a save is: the page
 * registers it, `SystemConfigSchema` declares it (an undeclared key is
 * stripped by the API), `TOOLTYPE_MAP` maps it to the tooltype the board
 * reads, and `saveBBSConfig` writes it. This checks the two ends that live in
 * this package; `config-round-trip-contract` covers the backend halves.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const page = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'pages', 'SystemConfigPage.tsx'),
  'utf8',
);

const EVENTS = [
  'connect', 'logon', 'new_user', 'upload',
  'sysop_page', 'sysop_comment', 'status_change', 'logoff',
];

describe('the event command hooks', () => {
  it('offers every event express fires a command on', () => {
    // Eight, per express.e:6666-6744. A missing one is a hook the sysop
    // cannot reach.
    for (const event of EVENTS) {
      expect(page).toContain(`field: '${event}'`);
    }
  });

  it('registers both the waiting and the non-waiting form', () => {
    expect(page).toContain('`execute_on_${field}`');
    expect(page).toContain('`execute_async_on_${field}`');
  });

  it('shows the sysop which tooltype each field writes', () => {
    // TooltypeKey resolves the name from the backend's own TOOLTYPE_MAP, so a
    // field the map does not know shows nothing and silently saves nowhere.
    expect(page).toContain('<TooltypeKey field={`execute_on_${field}`} />');
  });

  it('is declared in the config-app type, or the form cannot bind it', () => {
    const types = fs.readFileSync(
      path.resolve(__dirname, '..', 'src', 'types', 'index.ts'),
      'utf8',
    );

    for (const event of EVENTS) {
      expect(types).toContain(`execute_on_${event}?`);
      expect(types).toContain(`execute_async_on_${event}?`);
    }
  });
});
