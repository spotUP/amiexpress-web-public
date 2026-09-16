/**
 * The port draws what the original draws.
 *
 * The sysop, 2026-09-16: "we first need to make its screen output byte
 * identical to the original i dont think it is that yet". It was not - the
 * abandoned port wrote literal spaces where `GLCViewer.e` writes `ESC[5C`,
 * and its column header was a different line altogether.
 *
 * So the art is not transcribed any more. `dev/extract-art.py` lifts it out of
 * the E source into `art.generated.ts`, and THIS test re-extracts at run time
 * and compares: a logo edited in one place and not the other fails here
 * instead of drifting. The E source is the specification; these tests are the
 * gate the logo work waits behind.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

import * as art from '../../../../Doors/glc-viewer/src/art.generated';
import { formatE, leftField, rightField, transferField } from '../../../../Doors/glc-viewer/src/estringf';
import { renderGlcScreen, type GlcScreen } from '../../../../Doors/glc-viewer/src/render';

/** Re-run the extractor and read what it says the art is, right now. */
function artFromTheESource(): Record<string, unknown> {
  const script = path.join(__dirname, '../../../../Doors/glc-viewer/dev/extract-art.py');
  const ts = execFileSync('python3', [script], { encoding: 'utf8', maxBuffer: 4 << 20 });
  const values: Record<string, unknown> = {};
  // The generator emits `export const NAME = <json>;` and array forms; read
  // them back rather than importing, so a stale generated file cannot hide.
  const single = /export const (\w+) = (".*?");\n/gs;
  const list = /export const (\w+): readonly string\[\] = \[\n(.*?)\n\];/gs;
  for (const m of ts.matchAll(single)) values[m[1]] = JSON.parse(m[2]);
  for (const m of ts.matchAll(list)) {
    values[m[1]] = m[2].split('\n').map((line) => JSON.parse(line.trim().replace(/,$/, '')));
  }
  return values;
}

describe('the art is the E source\'s art', () => {
  const fromSource = artFromTheESource();

  it('extracted something for every constant the renderer uses', () => {
    for (const name of [
      'LOGO_STYLE_1_3', 'LOGO_STYLE_2_4', 'BANNER_1_3', 'BANNER_2_4',
      'COLUMNS_LOCATION_1_3', 'COLUMNS_BBS_1_3', 'COLUMNS_LOCATION_2_4', 'COLUMNS_BBS_2_4',
      'RULER_TOP', 'RULER_BOTTOM', 'RULE_PLAIN', 'RULE_FINAL',
      'LEGEND', 'ROW_TEMPLATE', 'FOOTER_1_2', 'FOOTER_3_4',
    ]) {
      expect(fromSource[name]).toBeDefined();
    }
  });

  it('matches the committed file byte for byte', () => {
    for (const [name, value] of Object.entries(fromSource)) {
      expect({ [name]: (art as Record<string, unknown>)[name] }).toEqual({ [name]: value });
    }
  });

  it('kept the cursor-forward jumps the abandoned port turned into spaces', () => {
    // `ESC[5C` inside the logo: five columns SKIPPED, not five spaces painted.
    expect(art.LOGO_STYLE_1_3.join('')).toContain('\x1b[5C');
    expect(art.LOGO_STYLE_2_4.join('')).toContain('\x1b[6C');
    expect(art.COLUMNS_LOCATION_1_3).toContain('\x1b[10C');
  });
});

describe('the E format codes', () => {
  it('left-justifies, right-justifies and TRUNCATES to the field width', () => {
    expect(leftField('ab', 5)).toBe('ab   ');
    expect(rightField('ab', 5)).toBe('   ab');
    // E cuts rather than widening the row - the column after it must not move.
    expect(leftField('abcdefgh', 5)).toBe('abcde');
    expect(rightField('abcdefgh', 5)).toBe('abcde');
  });

  it('fills a template in argument order', () => {
    expect(formatE('[\\l\\s[4]][\\r\\s[4]]', ['a', 'b'])).toBe('[a   ][   b]');
  });

  it('prints a transfer the way the original does', () => {
    // The server sends KILOBYTES - `upkb` in the E source, not bytes.
    expect(transferField('1234')).toBe('1234');   // four digits pass through
    expect(transferField('42')).toBe('--42');     // short values keep the dashes
    expect(transferField('0')).toBe('---0');
    // 10240 KB -> 10M, right-aligned into four columns.
    expect(transferField('10240')).toBe('-10M');
    // Over 999M becomes gigabytes with one decimal...
    expect(transferField(String(1024 * 1024 * 2))).toBe('2.0G');
    // ...and loses the decimal at ten, because the field is four wide.
    expect(transferField(String(1024 * 1024 * 12))).toBe('-12G');
    // A value so large it overflows a 68K LONG is NAMED, not truncated: the
    // original's `Shr` runs on a signed 32-bit register and so does ours.
    expect(transferField(String(1024 * 1024 * 1024 * 2))).toBe('LOTS');
  });
});

const CALL = {
  Username: 'Spot', Location: 'Sweden', Bbsname: 'uPtOWN',
  Dateon: '16-09', Timeon: '08:38', Timeoff: '08:44',
  Actions: 'UD', Upload: '1024', Download: '2048',
};

const SCREEN: GlcScreen = {
  style: 1, screenClear: false, showLocation: true, centreName: false,
  calls: [CALL],
  yesterday: { statdate: '15-09', calls: '12', topcps: '9600', uploads: '5', downloads: '9' },
  previousDay: { statdate: '14-09', calls: '8', topcps: '4800', uploads: '1', downloads: '2' },
  records: {
    allcalls: '900', recordcalls: '42', calls: '11', mostcalled: 'reference-board',
    calls2: '9', secondmostcalled: 'uPtOWN', calls3: '7', thirdmostcalled: 'Nowhere',
  },
};

describe('a rendered screen', () => {
  it('opens with the logo and closes with the final rule', () => {
    const lines = renderGlcScreen(SCREEN);
    expect(lines[0]).toBe(art.LOGO_STYLE_1_3[0]);
    expect(lines[lines.length - 1]).toBe(art.RULE_FINAL);
  });

  it('carries the form feed on the FIRST logo line, as E builds it', () => {
    // `StringF(tempStr,'\c',12)` then `StrAdd(tempStr, <logo line 1>)` - one
    // transmit, not a clear of its own.
    const [first] = renderGlcScreen({ ...SCREEN, screenClear: true });
    expect(first).toBe('\x0c' + art.LOGO_STYLE_1_3[0]);
  });

  it('draws every call as one row, between the two ruled lines', () => {
    const lines = renderGlcScreen({ ...SCREEN, calls: [CALL, CALL, CALL] });
    const top = lines.indexOf(art.RULER_TOP);
    const bottom = lines.indexOf(art.RULER_BOTTOM);
    expect(bottom - top - 1).toBe(3);
  });

  it('shows the BBS name instead of the location when asked', () => {
    const withBbs = renderGlcScreen({ ...SCREEN, showLocation: false });
    expect(withBbs).toContain(art.COLUMNS_BBS_1_3);
    expect(withBbs.join('\n')).toContain('uPtOWN');
  });

  it('gives styles 3 and 4 the top-three footer, not the day totals', () => {
    const three = renderGlcScreen({ ...SCREEN, style: 3 }).join('\n');
    expect(three).toContain('TOP 3 MOST');
    const one = renderGlcScreen({ ...SCREEN, style: 1 }).join('\n');
    expect(one).toContain('TOP-CPS');
  });

  it('treats a style outside 1-4 as style 1, as GLCViewer.e:862 does', () => {
    expect(renderGlcScreen({ ...SCREEN, style: 9 })).toEqual(renderGlcScreen({ ...SCREEN, style: 1 }));
    expect(renderGlcScreen({ ...SCREEN, style: 0 })).toEqual(renderGlcScreen({ ...SCREEN, style: 1 }));
  });

  it('clamps a stat that will not fit rather than letting it be cut', () => {
    // `IF StrLen(statcalls1)>3 THEN StrCopy(statcalls1,'999')` - 1234 calls
    // reads as 999, never as 123.
    const busy = renderGlcScreen({
      ...SCREEN,
      yesterday: { ...SCREEN.yesterday, calls: '1234' },
    }).join('\n');
    expect(busy).toContain('999');
    expect(busy).not.toContain('123]');
  });
});
