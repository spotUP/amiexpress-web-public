/**
 * The key reader, mostly.
 *
 * A terminal is free to split ESC [ C across three writes, and a door that
 * reads the chunk boundary as the sequence boundary turns an arrow key into
 * the letter C - the cyan fastext key. This is the regression that cost the
 * browser door a bug, and it is pinned here so the next teletext door
 * inherits the fix instead of the bug.
 */
import { KeyStream, TeletextScreen, fit } from '../../teletext/screen';
import { PageBuilder } from '../../teletext/compose';
import { importTti } from '../../teletext/marco/tti/index';

function recorder() {
  const keys: string[] = [];
  const arrows: string[] = [];
  let escapes = 0;
  const stream = new KeyStream(
    {
      key: ch => keys.push(ch),
      escape: () => { escapes++; },
      arrow: direction => arrows.push(direction),
    },
    { graceMs: 5 },
  );
  return { stream, keys, arrows, escaped: () => escapes };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('reading keys', () => {
  it('passes printable characters straight through', () => {
    const r = recorder();
    r.stream.feed('103');
    expect(r.keys).toEqual(['1', '0', '3']);
    r.stream.dispose();
  });

  it('reads an arrow that arrives whole', () => {
    const r = recorder();
    r.stream.feed('\x1b[C');
    expect(r.arrows).toEqual(['right']);
    expect(r.keys).toEqual([]);
    r.stream.dispose();
  });

  it('reads an arrow that arrives one byte at a time', () => {
    const r = recorder();
    r.stream.feed('\x1b');
    r.stream.feed('[');
    r.stream.feed('C');
    expect(r.arrows).toEqual(['right']);
    expect(r.keys).toEqual([]);
    expect(r.escaped()).toBe(0);
    r.stream.dispose();
  });

  it('reads an SS3 arrow as well', () => {
    const r = recorder();
    r.stream.feed('\x1bOD');
    expect(r.arrows).toEqual(['left']);
    r.stream.dispose();
  });

  it('reports a bare ESC once nothing follows it', async () => {
    const r = recorder();
    r.stream.feed('\x1b');
    expect(r.escaped()).toBe(0);
    await settle();
    expect(r.escaped()).toBe(1);
    r.stream.dispose();
  });

  it('treats ESC then an ordinary key as both of them', () => {
    const r = recorder();
    r.stream.feed('\x1bq');
    expect(r.escaped()).toBe(1);
    expect(r.keys).toEqual(['q']);
    r.stream.dispose();
  });

  it('does not let an abandoned half-sequence swallow the next key', async () => {
    const r = recorder();
    r.stream.feed('\x1b[');
    await settle();
    expect(r.escaped()).toBe(0);
    r.stream.feed('5');
    expect(r.keys).toEqual(['5']);
    r.stream.dispose();
  });

  it('gives up on a sequence that never ends', () => {
    const r = recorder();
    r.stream.feed('\x1b[');
    r.stream.feed('0'.repeat(20));
    r.stream.feed('x');
    expect(r.keys).toContain('x');
    r.stream.dispose();
  });

  it('goes quiet once disposed', async () => {
    const r = recorder();
    r.stream.feed('\x1b');
    r.stream.dispose();
    await settle();
    expect(r.escaped()).toBe(0);
    r.stream.feed('a');
    expect(r.keys).toEqual([]);
  });
});

describe('the screen', () => {
  function screen(rows: number, mode: 'teletext' | 'ansi' = 'teletext') {
    const written: string[] = [];
    const s = new TeletextScreen({ write: d => written.push(d), rows, mode });
    return { s, written, all: () => written.join('') };
  }

  it('keeps the bottom line for the status bar', () => {
    expect(screen(25).s.pageRows).toBe(24);
    // A 24-row session gives up the page's own fastext bar, which is what
    // our status bar replaces anyway.
    expect(screen(24).s.pageRows).toBe(23);
  });

  describe('row 24 (D5)', () => {
    const withRow24 = () =>
      importTti(['PN,10000', 'SC,0000', 'PS,8000', 'OL,1,TOP', 'OL,24,FASTEXT ROW'].join('\n')).pages[0].subpages[0];

    it('is painted on a session with a row to spare below it', () => {
      const { s, all } = screen(26);
      s.paint(withRow24());
      expect(all()).toContain('\x1b[25;1H');
      expect(all()).toContain('FASTEXT ROW');
    });

    it('never overwrites the status bar on the 25-row web session', () => {
      const { s, all } = screen(25);
      s.paint(withRow24());
      expect(all()).toContain('\x1b[24;1H');
      expect(all()).not.toContain('\x1b[25;1H');
      expect(all()).not.toContain('FASTEXT ROW');
    });
  });

  it('paints a page in one write, positioned row by row', () => {
    const { s, written } = screen(25);
    s.paint(new PageBuilder().write(0, 0, 'ROW ZERO').subpage());
    expect(written).toHaveLength(1);
    expect(written[0].startsWith('\x1b[1;1H')).toBe(true);
    expect(written[0]).toContain('\x1b[24;1H');
    expect(written[0]).toContain('ROW ZERO');
  });

  it('puts the cursor move before the double height attribute', () => {
    // The board's terminal filter drops a line attribute when the cursor
    // leaves the line, so this order is the whole reason paint exists.
    const { s, all } = screen(25);
    s.paint(new PageBuilder().write(2, 0, 'BIG', { doubleHeight: true }).subpage());
    expect(all()).toContain('\x1b[3;1H\x1b#3');
  });

  it('writes the status bar on the session bottom row', () => {
    const { s, all } = screen(25);
    s.status('P100');
    expect(all()).toContain('\x1b[25;1H');
    expect(all()).toContain('P100');
  });

  it('never lets the status bar run past 40 columns', () => {
    const { s, all } = screen(25);
    s.status('x'.repeat(80));
    const body = all().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    expect(body).toHaveLength(40);
  });

  it('marks text it had to cut', () => {
    expect(fit('short', 10)).toBe('short');
    expect(fit('a very long line indeed', 10)).toBe('a very lo.');
  });
});
