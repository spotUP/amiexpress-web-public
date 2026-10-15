/**
 * The admin is a sysop's tool, not a code review.
 *
 * Pages had grown prose citing this project's own sources at the reader:
 * "AmiExpress rounds a level down to a multiple of five and walks down until
 * it finds a file (express.e:3025)", "reads a tooltype's PRESENCE and never
 * its value (tooltypes.e:204-218)", flag notes ending "(ACP.e:2649)", and a
 * node badge whose tooltip read "Reserved for X (express.e:7649-7656)". The
 * sysop reported it as comments left on the security page.
 *
 * Why the citations existed is worth keeping - in the code, where the next
 * person changing the behaviour will read it. This test draws that line: the
 * source of every page is stripped of its comments, and what remains, which
 * is what can reach the screen, must carry no file:line reference.
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pages');

/** Everything that is not a comment - i.e. everything that can be rendered. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments, JSX {/* */} included
    .replace(/^\s*\/\/.*$/gm, '');     // whole-line // comments
}

/** express.e:3025, tooltypes.e:204-218, ACP.e:2649 - and any other .e source. */
const CITATION = /\b[A-Za-z_][A-Za-z0-9_]*\.e:\d+/;

function pageFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return pageFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

describe('admin pages', () => {
  it('cite no source files in anything the sysop can see', () => {
    const offenders: string[] = [];

    for (const file of pageFiles(pagesDir)) {
      const renderable = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [index, line] of renderable.split('\n').entries()) {
        const hit = line.match(CITATION);
        if (hit) offenders.push(`${path.basename(file)}:${index + 1}: ${hit[0]} - ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
