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
 *
 * Driven through the real express app (same technique as
 * security-headers.test.ts): the header a browser receives is what is read.
 */

import request from 'supertest';
import { app } from '../../src/server/app';

/**
 * The policy the board actually sends, directive by directive - read from
 * the response of a real request through the app's middleware, enforced or
 * report-only (it is report-only today).
 */
async function policy(): Promise<Map<string, string[]>> {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  const header: string | undefined =
    res.headers['content-security-policy'] ?? res.headers['content-security-policy-report-only'];
  expect(header).toBeDefined();
  const directives = new Map<string, string[]>();
  for (const part of header!.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

describe('the content security policy', () => {
  let csp: Map<string, string[]>;
  beforeAll(async () => {
    csp = await policy();
  });

  it('declares media-src', () => {
    expect(csp.has('media-src')).toBe(true);
  });

  it('allows the blob: URLs a webcam produces', () => {
    expect(csp.get('media-src')).toEqual(expect.arrayContaining(["'self'", 'blob:']));
  });

  it('still refuses everything by default', () => {
    // Adding media-src must not loosen the rest.
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    // `'self'` since 6e7d87509, which serves the BBC Micro as its own page for
    // the terminal to frame. Still nothing cross-origin, which is the point.
    expect(csp.get('frame-ancestors')).toEqual(["'self'"]);
  });
});
