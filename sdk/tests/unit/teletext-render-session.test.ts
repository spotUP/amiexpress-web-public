/**
 * Rendering one page for the terminal that asked for it.
 *
 * Two things differ from the vendored renderer and both are about the
 * caller's screen, not the page: DECDHL for real double height on a
 * teletext session, and ASCII mosaics for an ANSI caller whose font has no
 * Unicode sextants.
 */
import {
  renderSubpageLines,
  renderPageForSession,
  subpageToGrid,
  sextantsToAscii,
  DH_TOP,
  DH_BOTTOM,
} from '../../teletext/render-session';
import { createEmptySubpage, controlToken, charToken, mosaicToken, fillToken } from '../../teletext/marco/model/factories';
import type { TeletextSubpage, TeletextToken } from '../../teletext/marco/model/types';

const DOUBLE_HEIGHT = 0x0d;
const CONCEAL = 0x18;
const MOSAIC_WHITE = 0x17;
const FULL_MOSAIC = 0x7f; // all six sextant bits set

function pageWith(rows: Record<number, TeletextToken[]>): TeletextSubpage {
  const subpage = createEmptySubpage(0);
  for (const [index, tokens] of Object.entries(rows)) {
    const at = Number(index);
    subpage.rows[at] = { index: at, tokens: [...tokens, fillToken(40)] };
  }
  return subpage;
}

function text(str: string): TeletextToken[] {
  return Array.from(str).map(ch => charToken(ch.charCodeAt(0)));
}

/** Strip SGR so a test can assert on what the caller actually reads. */
function plain(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('double height', () => {
  const subpage = pageWith({ 2: [controlToken(DOUBLE_HEIGHT), ...text('NEWS')] });

  it('is DECDHL on a teletext session, top half then bottom half', () => {
    const lines = renderSubpageLines(subpage, { mode: 'teletext' });
    expect(lines[2].startsWith(DH_TOP)).toBe(true);
    expect(lines[3].startsWith(DH_BOTTOM)).toBe(true);
    // The board's terminal filter maps the escape onto the font's baked
    // halves, so both rows carry the same text.
    expect(plain(lines[2])).toContain('NEWS');
    expect(plain(lines[3])).toContain('NEWS');
  });

  it('is never DECDHL on an ANSI session', () => {
    // A terminal without the filter would print ESC#3 as stray glyphs.
    const lines = renderSubpageLines(subpage, { mode: 'ansi' });
    expect(lines.some(line => line.includes('\x1b#'))).toBe(false);
    expect(plain(lines[2])).toContain('NEWS');
    expect(plain(lines[3])).toContain('NEWS');
  });

  it('leaves a single-height row unattributed', () => {
    const lines = renderSubpageLines(pageWith({ 2: text('NEWS') }), { mode: 'teletext' });
    expect(lines[2].includes('\x1b#')).toBe(false);
  });

  it('positions the attribute so it survives a cursor move', () => {
    // The caller writes ESC[row;1H then the line. The attribute has to come
    // after the motion, which means first in the line itself.
    const lines = renderSubpageLines(subpage, { mode: 'teletext' });
    expect(lines[2].indexOf(DH_TOP)).toBe(0);
  });
});

describe('conceal and reveal', () => {
  const subpage = pageWith({ 5: [controlToken(CONCEAL), ...text('PARIS')] });

  it('hides concealed text by default', () => {
    const lines = renderSubpageLines(subpage, { mode: 'teletext' });
    expect(plain(lines[5])).not.toContain('PARIS');
  });

  it('shows it when the caller reveals', () => {
    const lines = renderSubpageLines(subpage, { mode: 'teletext', reveal: true });
    expect(plain(lines[5])).toContain('PARIS');
  });
});

describe('mosaics', () => {
  const subpage = pageWith({
    7: [controlToken(MOSAIC_WHITE), mosaicToken(FULL_MOSAIC), mosaicToken(FULL_MOSAIC)],
  });

  it('are Unicode sextants on a teletext session', () => {
    const lines = renderSubpageLines(subpage, { mode: 'teletext' });
    expect(plain(lines[7])).toContain('\u2588\u2588');
  });

  it('are ASCII on an ANSI session, because topaz has no sextants', () => {
    const lines = renderSubpageLines(subpage, { mode: 'ansi' });
    expect(plain(lines[7])).toContain('##');
    expect(plain(lines[7])).not.toContain('\u2588');
  });

  it('can be forced either way', () => {
    const forced = renderSubpageLines(subpage, { mode: 'teletext', mosaicStyle: 'ascii' });
    expect(plain(forced[7])).toContain('##');
  });

  it('maps every sextant to a density, not to tofu', () => {
    // U+1FB00 is one bit set, U+2588 all six, U+258C the left column.
    expect(sextantsToAscii('\u{1FB00}')).toBe('.');
    expect(sextantsToAscii('\u2588')).toBe('#');
    expect(sextantsToAscii('\u258C')).toBe('o');
    expect(sextantsToAscii('ABC')).toBe('ABC');
    // Every sextant in the block resolves, so no page can print tofu.
    for (let cp = 0x1fb00; cp <= 0x1fb3b; cp++) {
      const out = sextantsToAscii(String.fromCodePoint(cp));
      expect(out).toHaveLength(1);
      expect(' .:oO8#').toContain(out);
    }
  });
});

describe('page geometry', () => {
  it('is always 24 rows of 40 columns', () => {
    const lines = renderSubpageLines(createEmptySubpage(0));
    expect(lines).toHaveLength(24);
    for (const line of lines) expect(plain(line)).toHaveLength(40);
  });

  it('places a row by its declared index, not its position in the array', () => {
    // A t42 recovery hands over only the rows it captured. Row 20 must stay
    // on row 20 even when it is the only row in the array.
    const subpage = createEmptySubpage(0);
    subpage.rows = [{ index: 20, tokens: [...text('LATE'), fillToken(40)] }];
    const lines = renderSubpageLines(subpage, { mode: 'ansi' });
    expect(plain(lines[20])).toContain('LATE');
    expect(plain(lines[0])).not.toContain('LATE');
  });

  it('resolves a subpage to a 24x40 grid', () => {
    const grid = subpageToGrid(createEmptySubpage(0));
    expect(grid).toHaveLength(24);
    expect(grid[0]).toHaveLength(40);
  });

  it('joins with CRLF when the caller just wants the page', () => {
    expect(renderPageForSession(createEmptySubpage(0)).split('\r\n')).toHaveLength(24);
  });
});
