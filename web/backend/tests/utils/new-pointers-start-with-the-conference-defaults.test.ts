/**
 * A caller's new pointers for a conference start with the scans its icon
 * names (express.e:8616-8621 clearMsgPointers): DEFAULT_NEWSCAN adds mail
 * scan, DEFAULT_NEW_FILES file scan, DEFAULT_ZOOM Zoom - and nothing else.
 * The port started every new pointer at 0 whatever the icon said.
 */
process.env.SKIP_DB_INIT = '1';

const iconFlags: Record<number, Record<string, boolean>> = {
  1: {},
  2: { defaultNewscan: true, defaultNewFiles: true },
  3: { defaultZoom: true },
};
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: (conf: number) => iconFlags[conf] ?? {},
}));

import { defaultScanFlags } from '../../src/utils/message-pointers.util';

describe('the scan flags a new pointer starts with', () => {
  test('a conference whose icon names no default scans nothing', () => {
    expect(defaultScanFlags(1)).toBe(0);
  });

  test('DEFAULT_NEWSCAN and DEFAULT_NEW_FILES give mail and file scan (4 | 8)', () => {
    expect(defaultScanFlags(2)).toBe(12);
  });

  test('DEFAULT_ZOOM gives the Zoom bit (2)', () => {
    expect(defaultScanFlags(3)).toBe(2);
  });
});
