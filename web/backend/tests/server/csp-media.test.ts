/**
 * The webcam's blob: URL is allowed by the CSP.
 *
 * Seen in the console during a video call on the live site:
 *
 *   Loading media from 'blob:<URL>' violates the following Content Security
 *   Policy directive: "default-src 'self'". Note that 'media-src' was not
 *   explicitly set, so 'default-src' is used as a fallback.
 *
 * A MediaStream is attached to a <video> as a blob: URL, and no media-src
 * was declared, so default-src caught it. The policy is report-only today,
 * which is the only reason the camera still worked - the day it is enforced,
 * video breaks.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const app = readFileSync(join(__dirname, '..', '..', 'src', 'server', 'app.ts'), 'utf8');

describe('the content security policy', () => {
  it('declares media-src', () => {
    expect(app).toMatch(/mediaSrc:/);
  });

  it('allows the blob: URLs a webcam produces', () => {
    const directive = app.slice(app.indexOf('mediaSrc:'), app.indexOf('mediaSrc:') + 120);

    expect(directive).toContain("'self'");
    expect(directive).toContain('blob:');
  });

  it('still refuses everything by default', () => {
    // Adding media-src must not loosen the rest.
    expect(app).toMatch(/defaultSrc: \["'self'"\]/);
    expect(app).toMatch(/objectSrc: \["'none'"\]/);
    expect(app).toMatch(/frameAncestors: \["'none'"\]/);
  });
});
