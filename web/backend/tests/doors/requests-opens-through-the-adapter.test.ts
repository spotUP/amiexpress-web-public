/**
 * THE REQUESTS DOOR OPENS FOR A C64 THROUGH THE ADAPTER, NOT BY CLAIMING TO
 * FIT.
 *
 * The sysop, 2026-09-15: "the requests door is not working with 40 cols
 * either".
 *
 * `Commands/BBSCmd/REQ.info` carried `MIN_COLUMNS=40`, and that tooltype means
 * one specific thing (`utils/door-min-columns.util.ts`): "this door already
 * fits forty columns". For an unmodified 80-column 68K binary it is a lie, and
 * it is a COSTLY one - a door that fits needs no help, so the C64 adapter is
 * never installed and the caller is served the door's own 80-column bytes.
 * The door's own art gives it away: `Doors/requests/headers/Header5.ascii` is
 * 75 columns wide.
 *
 * `C64_ADAPT=40` is the honest claim for the same door: "usable at forty
 * columns THROUGH the adapter", which replays the door's ANSI onto an
 * 80-column grid and reduces every finished frame to the caller's width.
 */
import * as path from 'path';

import { readTooltypeMap } from '../../src/utils/info-file.util';
import { declaredMinColumns, resolveDoorAdaptColumns, ADAPTED_DOOR_TYPES } from '../../src/utils/door-min-columns.util';

const REQ_INFO = path.join(__dirname, '..', '..', '..', '..', 'board', 'Commands', 'BBSCmd', 'REQ.info');

/** The registration shape the resolver reads, built from the icon on disk. */
function registration() {
  const toolTypes = Object.fromEntries(readTooltypeMap(REQ_INFO));
  return { toolTypes, type: toolTypes['TYPE'] };
}

describe('the requests door', () => {
  it('is a 68K door, so the adapter can reach its output at all', () => {
    expect(ADAPTED_DOOR_TYPES.has(registration().type)).toBe(true);
  });

  it('claims forty columns THROUGH the adapter', () => {
    expect(resolveDoorAdaptColumns(registration() as any)).toBe(40);
  });

  it('does not claim to fit forty columns on its own', () => {
    // RED before the fix: this was 40, and a door that fits is a door the
    // adapter is never installed for.
    expect(declaredMinColumns(registration() as any)).toBeNull();
  });
});
