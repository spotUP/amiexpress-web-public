/**
 * The admin has no authentication bypass.
 *
 * `VITE_BYPASS_AUTH` was added to let a sysop reach the admin when the
 * database held no account to log in with, and it stayed. It only ever
 * defeated the frontend guard - every API call still needed a token, and the
 * socket handshake reads secLevel server-side - so what it actually produced
 * was an admin shell that rendered and could not load anything, with a
 * console warning where the login screen should have been.
 *
 * A sysop account exists now. This test is here so the escape hatch is not
 * quietly reintroduced: the redesign plan lists socket authentication as a
 * security surface, and a build-time flag that turns the guard off is exactly
 * the thing that must not drift back in.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..');

function readSource(relative: string): string {
  return fs.readFileSync(path.join(SRC, relative), 'utf8');
}

describe('admin authentication guard', () => {
  it('has no build-time bypass in the route guard', () => {
    const app = readSource('App.tsx');

    expect(app).not.toMatch(/BYPASS_AUTH/);
    expect(app).not.toMatch(/bypassAuth/);
  });

  it('renders a private route only when authenticated', () => {
    // The guard's whole decision must rest on isAuthenticated. If a second
    // term ever joins that expression, this is where it gets noticed.
    const app = readSource('App.tsx');

    expect(app).toMatch(/return isAuthenticated \? <>\{children\}<\/> : <Navigate to="\/admin\/login" \/>;/);
  });
});
