/**
 * The NOTIFY logon offer on the live web terminal had a broken border: the
 * frame was PC box-drawing for any Unicode-capable session, and the Topaz web
 * terminal does not own those glyphs. The offer now reaches a web caller in
 * the SDK's Amiga border alphabet, wrapped on word boundaries.
 */
import { noticeBytes } from '../../src/achievements/notices';
import { OFFER_NOTICE } from '../../src/notify/board';

describe('the NOTIFY offer for a web caller', () => {
  it('is drawn in Amiga ASCII with the body wrapped on words, every row the same width', () => {
    const out = noticeBytes({ screenWidth: 80, ...{ unicodeCapable: true } } as never, OFFER_NOTICE);
    const rows = out.replace(/\x1b\[[0-9;]*m/g, '').split('\r\n').filter((l) => l !== '');
    expect(/^[\x20-\x7e]*$/.test(rows.join(''))).toBe(true);
    expect(rows[0].startsWith('.- NOTIFICATIONS ')).toBe(true);
    for (const r of rows) expect(r.length).toBe(rows[0].length);
    expect(rows.slice(1, -1).map((r) => r.slice(2, -2).trim()).join(' ')).toBe(OFFER_NOTICE.text);
  });
});
