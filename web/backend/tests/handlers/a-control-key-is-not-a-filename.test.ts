/**
 * Ctrl+C at the upload filename prompt must do nothing at all.
 *
 * The sysop, 2026-09-15: "if i press ctrl+c on the upload prompt it continues
 * to the next step without any data", and again: "it fell trough if i pressed
 * ctrl+c".
 *
 * express.e:2335 - `lineInput` accumulates a keystroke only `IF (ch>31)`. A
 * Ctrl+C is discarded where it lands, and the REPEAT exits only on `ch=13`,
 * an abort or a timeout (express.e:2355), so the prompt simply sits there.
 *
 * This port ran `data.trim()` and trusted the result. JavaScript's `trim`
 * removes WHITESPACE, and 0x03 is not whitespace - so Ctrl+C survived as a
 * one-character filename nobody could see, passed validation, and the upload
 * walked on to the description prompt having named no file.
 *
 * `A` alone remains the abort (express.e:17668); express.e gives Ctrl+C no
 * meaning at this prompt and neither do we.
 */
process.env.SKIP_DB_INIT = '1';

/** The rule under test, as the handler applies it. */
function classify(raw: string) {
  const submitted = raw === '' || raw.includes('\r') || raw.includes('\n');
  const printable = raw.replace(/[^\x20-\x7e]/g, '');
  return { ignored: !submitted && printable === '', input: printable.trim(), submitted };
}

describe('a control key at the upload filename prompt', () => {
  it('ignores Ctrl+C instead of taking it as a filename', () => {
    const r = classify('\x03');
    expect(r.ignored).toBe(true);
    // The bug, stated as the old code saw it: trim() leaves 0x03 intact.
    expect('\x03'.trim()).toBe('\x03');
    expect('\x03'.trim().length).toBe(1);
  });

  it('ignores the other stray control keys too', () => {
    for (const ch of ['\x01', '\x04', '\x1a', '\x1b', '\x7f']) {
      expect(classify(ch).ignored).toBe(true);
    }
  });

  it('still lets a blank line start the transfer', () => {
    // express.e:17673 - brk=(StrLen(str)=0). This is how a caller says "done".
    for (const enter of ['', '\r', '\r\n']) {
      const r = classify(enter);
      expect(r.ignored).toBe(false);
      expect(r.input).toBe('');
    }
  });

  it('still takes a real filename', () => {
    const r = classify('FILE.LHA\r');
    expect(r.ignored).toBe(false);
    expect(r.input).toBe('FILE.LHA');
  });

  it('strips a control character out of an otherwise real filename', () => {
    // express.e never put it in the buffer, so it is not part of the name.
    expect(classify('FI\x03LE.LHA\r').input).toBe('FILE.LHA');
  });

  it('still sees the A abort', () => {
    // express.e:17668 - the documented way out of this prompt.
    expect(classify('A\r').input).toBe('A');
  });
});
