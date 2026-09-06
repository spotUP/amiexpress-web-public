/**
 * Two pages that share a react-query key share a CACHE ENTRY, so they must
 * cache the same shape.
 *
 * Reported 2026-09-07: Drive Setup said "no drives configured" the moment the
 * Conferences page had been opened. Both used `queryKey: ['drives']`, but
 * Drive Setup cached the whole response and read `.data` off it, while
 * Conferences cached the bare array. Whichever query resolved last won the
 * entry, and reading `.data` off an array gives undefined.
 *
 * This reads the sources rather than rendering: the defect is in what the
 * queryFn RETURNS, which no amount of rendering one page alone can show.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = join(__dirname, '..', 'pages');

function queryFnFor(file: string, key: string): string {
  const source = readFileSync(join(PAGES, file), 'utf8');
  const at = source.indexOf(`queryKey: ['${key}']`);
  expect(at).toBeGreaterThan(-1);
  // The queryFn is the next line or two after the key.
  return source.slice(at, at + 260);
}

describe("pages sharing the 'drives' query key", () => {
  it('both cache the whole response, not one the response and one the array', () => {
    const drivesPage = queryFnFor('DrivesPage.tsx', 'drives');
    const conferences = queryFnFor('ConferencesPage.tsx', 'drives');

    // Drive Setup's shape is the established one: it caches the response.
    expect(drivesPage).toMatch(/queryFn: \(\) => apiClient\.getDrives\(\)/);
    expect(conferences).toMatch(/queryFn: \(\) => apiClient\.getDrives\(\)/);

    // Conferences narrows with `select`, which does not change what is cached.
    expect(conferences).toMatch(/select:/);
    // And it must NOT unwrap inside the queryFn, which is what broke it.
    expect(conferences).not.toMatch(/queryFn:[^}]*\.data\s*\?\?/);
  });
});
