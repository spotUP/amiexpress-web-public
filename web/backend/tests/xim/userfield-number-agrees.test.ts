import * as fs from 'fs';
import * as path from 'path';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
// The door asks by number; a number that differs is a door asking for someone else's answer
// (the 10300/10400 mix-up recorded in sdk/c/Makefile, AMIGA_HEADERS).
test('the SDK and the board agree on AEW_USERFIELD', () => {
  const header = fs.readFileSync(path.resolve(__dirname, '../../../../sdk/c/include/ae_session.h'), 'latin1');
  const m = /AE_FIELD_USERFIELD\s*=\s*(\d+)/.exec(header);
  expect(Number(m?.[1])).toBe(XIMCommand.AEW_USERFIELD);
});
