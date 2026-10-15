/**
 * A new-files scan is in the CallersLog, as express.e's myNewFiles writes it.
 *
 * express.e:27880-27881 logs `\tDirectory Scan for (<mm-dd-yy>)`, the date
 * the scan ran from; GLCUpdater marks the call `F` from it (GLCUpdater.e:729).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/file/file-listing.handler', () => ({
  FileListingHandler: { handleNewFileScan: jest.fn(async () => undefined) },
}));

import * as fs from 'fs';
import { callersLogManager, SOCKET_CONNECT_STRING } from '../../src/services/CallersLogManager';
import { displayNewFiles } from '../../src/handlers/file/file.handler';
import { findCallStart, parseCalls } from '../../src/utils/glc-updater';

const NODE = 8;

afterEach(() => fs.rmSync(callersLogManager.logPathFor(NODE), { force: true }));

test('N <date> logs the date as given, and GLCUpdater flags the call F', async () => {
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
  callersLogManager.logLogin(NODE, {
    slotNumber: 3, name: 'scanner', connectString: SOCKET_CONNECT_STRING, location: 'Here', isNew: false,
  });
  await displayNewFiles({ emit: jest.fn() }, { nodeId: NODE, user: { username: 'scanner' } } as any, '09-30-26');
  callersLogManager.logLogoff(NODE, 'scanner');

  const log = fs.readFileSync(callersLogManager.logPathFor(NODE));
  expect(log.toString('latin1').split('\n')[2]).toBe('\tDirectory Scan for (09-30-26)');
  const [call] = parseCalls(log, findCallStart(log, false)!, { ignoreLocal: true, ignoreSysop: true, ignoreSysopUser: false, processAll: false });
  expect(call.actions[4]).toBe('F');
});

test('N S logs the caller\'s new-since date', async () => {
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
  await displayNewFiles({ emit: jest.fn() }, { nodeId: NODE, user: { newSinceDate: new Date(2026, 8, 1) } } as any, 'S');
  expect(fs.readFileSync(callersLogManager.logPathFor(NODE), 'latin1')).toBe('\tDirectory Scan for (09-01-26)\n');
});
