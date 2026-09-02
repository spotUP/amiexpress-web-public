/**
 * `~TC` never exceeds five digits.
 *
 * express.e:5309 prints the call count as
 * `StringF(tempstr,'\d',loggedOnUser.timesCalled AND $FFFF)` - the mask is
 * part of the code, not an accident of the Amiga's 16-bit field. Our
 * dispatch (`mci-dispatch.ts`, the `TC:` entry both flavours share) printed
 * the raw number, so a board whose call counter ran past 65535 rendered a
 * six-, seven- or nine-digit value.
 *
 * That is a layout bug as well as a parity bug: the C64 logoff art
 * (`Screens/logoff/003.logoff.seq`) carries `~TC` on a 40-column row with
 * nothing to spare, and a value wider than five digits pushes the rest of
 * that row past column 40, where `PetsciiMachine` wraps it onto the next
 * one and shunts the art below it down a line.
 *
 * The screen half of this test renders the SHIPPED art file, so it fails if
 * either the mask or the art regresses.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/SystemStatsService', () => ({
  systemStats: { getTodayCalls: () => 3 },
}));

jest.mock('../../src/database', () => ({
  db: {
    getMessageBases: jest.fn(async () => []),
    getUsers: jest.fn(async () => []),
  },
}));

import * as fs from 'fs';
import * as path from 'path';

import type { BBSSession } from '../../src/index';
import type { MciFlavour } from '../../src/handlers/mci-dispatch';
import { buildMciDispatch, MCI_SENTINELS } from '../../src/handlers/mci-dispatch';
import {
  renderPetsciiScreen,
  petsciiRenderCtxFor,
} from '../../src/handlers/petscii-screen.render';
import { disposePetsciiSessionModel } from '../../src/utils/petscii-session-model';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LOGOFF_003 = path.join(REPO_ROOT, 'Screens', 'logoff', '003.logoff.seq');
const PETSCII_RETURN = 0x0d;
const C64_COLUMNS = 40;

function session(timesCalled: number): BBSSession {
  return {
    petsciiMode: true,
    nodeId: 1,
    currentConf: 0,
    currentConfName: 'Amiga',
    timeRemaining: 3600,
    user: { id: 7, username: 'Spot', secLevel: 30, timesCalled },
  } as unknown as BBSSession;
}

async function renderTc(flavour: MciFlavour, timesCalled: number): Promise<string> {
  const { dispatch } = await buildMciDispatch(session(timesCalled), {
    flavour,
    inlineMode: false,
    sentinels: MCI_SENTINELS,
  });
  // -1 is express.e's "no width prefix" (`~TC` with no digits).
  return dispatch.TC(-1) ?? '';
}

/** Mirrors `petscii-machine.ts`'s control rule: what actually advances the cursor. */
const advancesCursor = (b: number): boolean => !(b < 0x20 || (b >= 0x80 && b <= 0x9f));

function rowWidths(rendered: Buffer): number[] {
  const widths: number[] = [];
  let w = 0;
  for (const b of rendered) {
    if (b === PETSCII_RETURN) {
      widths.push(w);
      w = 0;
    } else if (advancesCursor(b)) {
      w++;
    }
  }
  widths.push(w);
  return widths;
}

const FLAVOURS: MciFlavour[] = ['ansi', 'petscii'];

describe('~TC never exceeds five digits (express.e:5309, AND $FFFF)', () => {
  it.each(FLAVOURS)('%s: a six-digit call count is masked to five digits', async (flavour) => {
    const rendered = await renderTc(flavour, 123456);
    expect(rendered).toBe(String(123456 & 0xffff));
    expect(rendered).toHaveLength(5);
  });

  it.each(FLAVOURS)('%s: a nine-digit call count is masked to five digits', async (flavour) => {
    const rendered = await renderTc(flavour, 123456789);
    expect(rendered).toBe(String(123456789 & 0xffff));
    expect(rendered.length).toBeLessThanOrEqual(5);
  });

  it.each(FLAVOURS)('%s: a count inside the mask is printed unchanged', async (flavour) => {
    expect(await renderTc(flavour, 0)).toBe('0');
    expect(await renderTc(flavour, 42)).toBe('42');
    expect(await renderTc(flavour, 65535)).toBe('65535');
  });

  it.each(FLAVOURS)('%s: no call count can render a sixth digit', async (flavour) => {
    for (const count of [65536, 99999, 100000, 999999, 1000000, 123456789, 4294967295]) {
      const rendered = await renderTc(flavour, count);
      expect(rendered.length).toBeLessThanOrEqual(5);
      expect(rendered).toMatch(/^\d{1,5}$/);
    }
  });
});

describe('the shipped 003.logoff.seq stays inside 40 columns at any call count', () => {
  // 003's `~TC` row is `YOU HAVE CALLED <TC> TIMES. THANKS!` - 31 fixed
  // columns, so a nine-digit value lands the row on exactly 40 and the art
  // below it wraps. Five digits leave it at 36.
  it.each([0, 42, 65535, 123456, 123456789, 4294967295])(
    'timesCalled=%s: no row over 40 columns and nothing wraps',
    async (timesCalled) => {
      const s = session(timesCalled);
      disposePetsciiSessionModel(s);
      const ctx = await petsciiRenderCtxFor(s, { inlineMode: false });
      const out = await renderPetsciiScreen(fs.readFileSync(LOGOFF_003), s, ctx);

      expect(Math.max(...rowWidths(out))).toBeLessThanOrEqual(C64_COLUMNS);
      // The oracle agrees with the byte stream: one row per RETURN, no wrap.
      const returns = out.filter((b) => b === PETSCII_RETURN).length;
      expect(ctx.machine.state.cursorY).toBe(returns);
      expect(ctx.machine.state.cursorX).toBe(0);
      // And the number that reached the screen is the masked one.
      expect(out.toString('latin1')).toContain(`CALLED ${timesCalled & 0xffff} TIMES`);
    },
  );
});
