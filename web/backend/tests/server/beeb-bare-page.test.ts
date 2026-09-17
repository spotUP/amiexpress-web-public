/**
 * The emulator page, as this board serves it.
 *
 * jsbeeb's own page is right for jsbeeb's own site and wrong here in two
 * ways: it draws an interface around the machine, and it carries Google
 * Analytics. Neither is edited in `vendor/` - both are handled on the way
 * out, so the vendored copy stays byte-identical to the upstream build.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bareEmulatorPage } from '../../src/server/beeb-bare-page';

const VENDORED = path.join(__dirname, '..', '..', '..', '..', 'vendor', 'jsbeeb', 'index.html');
const page = (): string => bareEmulatorPage(fs.readFileSync(VENDORED, 'utf8'));

describe('serving the emulator page', () => {
  it('does not run the emulator’s analytics on this board', () => {
    /*
     * IT WAS LEAKING THE ROM GRANT. The tag reports the page URL, and that
     * URL carried the caller's access token - so the thing the board issues
     * to say "this person may fetch the ROMs" was being handed to a third
     * party on every launch:
     * `region1.google-analytics.com/g/collect?...&grant=...` (2026-09-17).
     *
     * The board's CSP is report-only here and cannot be enforced: jsbeeb
     * builds its 6502 core by evaluating generated source, so a policy
     * without `unsafe-eval` stops the machine dead. Removing the tags is
     * what is left - and the caller's browser then never makes the request
     * at all, which is better than blocking it.
     */
    const html = page();
    expect(html).not.toContain('googletagmanager');
    expect(html).not.toContain('google-analytics');
    expect(html).not.toMatch(/gtag\(/);
  });

  it('leaves the machine itself alone', () => {
    // The canvas, the drive lights the speed watch reads, and the emulator's
    // own script all have to survive.
    const html = page();
    expect(html).toContain('id="screen"');
    expect(html).toContain('id="drive0"');
    expect(html).toMatch(/<script[^>]*assets\//);
  });

  it('adds the board’s own stylesheet last', () => {
    const html = page();
    expect(html).toContain('bbs-bare-emulator');
    expect(html.indexOf('bbs-bare-emulator')).toBeLessThan(html.toLowerCase().lastIndexOf('</head>') + 1);
  });

  it('hands back a page with no head untouched rather than guessing', () => {
    expect(bareEmulatorPage('<p>not a page</p>')).toBe('<p>not a page</p>');
  });
});
