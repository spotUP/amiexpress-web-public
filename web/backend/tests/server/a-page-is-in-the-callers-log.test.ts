/**
 * A page is in the CallersLog, as express.e's ccom() writes it.
 *
 * express.e:20343-20345 logs `\tOperator Paged at (<formatLongDateTime>)`
 * before it pages; SAmiLog sets the call's page flag from `Operator Paged`.
 * The board paged without a line, so no call ever showed one.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/operator-chat.handler', () => ({
  handlePageSysop: jest.fn(async () => ({ success: true, message: '' })),
}));
jest.mock('../../src/services/sysop-availability', () => ({ isSysopAvailable: () => true }));
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));
jest.mock('../../src/database', () => ({ db: { getOperatorChatRepository: () => ({}) } }));

import * as fs from 'fs';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { handlePageSysopCommand } from '../../src/handlers/command-handler/page-sysop-command';

const NODE = 7;

test('O writes express.e:20344 `\\tOperator Paged at (Day DD-Mon-YYYY HH:MM:SS)`', async () => {
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
  await handlePageSysopCommand(
    { emit: jest.fn(), server: {} } as any,
    { nodeId: NODE, pagesAllowed: -1, user: { username: 'spot' }, tempData: {} } as any,
    {},
  );
  const log = fs.readFileSync(callersLogManager.logPathFor(NODE), 'latin1');
  fs.rmSync(callersLogManager.logPathFor(NODE), { force: true });
  expect(log).toMatch(/^\tOperator Paged at \((Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d-[A-Z][a-z]{2}-\d{4} \d\d:\d\d:\d\d\)\n$/);
});
