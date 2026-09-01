/**
 * RIP graphics have to survive the whole way from file to draw commands.
 *
 * The sysop: "the rip door never displayed and rip graphics". Phantasm, on
 * the 68K side: AmiExpress never rendered RIP locally either - it forwards
 * the file to the client and prints "Displaying Rip Script". So the BBS half
 * was right, and the client half was the gap.
 *
 * And it was not a missing parser. RIPParser, RIPTypes and RIPRenderer all
 * existed, in web/frontend/src/components/rip, imported by NOTHING. The
 * terminal carried its own RIP mode detection, its own buffer and its own
 * <canvas>, and never called getContext once: the buffer filled, the black
 * box appeared, and no pixel was ever drawn. The two halves could not meet
 * because they lived in different packages.
 *
 * This pins the half that can be tested without a DOM canvas: real files
 * from RIPgraphics/ must parse into commands the renderer knows how to
 * draw. A parser that silently yields nothing would put the black box back.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseRIPCommands, containsRIPCommands } from '@amiexpress/terminal/rip/RIPParser';
import { RIPCommandType } from '@amiexpress/terminal/rip/RIPTypes';

const RIP_DIR = path.resolve(__dirname, '../../../../../RIPgraphics');

/** Files with real content. AGNES1.RIP is zero bytes on this board. */
function sampleFiles(): string[] {
  if (!fs.existsSync(RIP_DIR)) return [];
  return fs
    .readdirSync(RIP_DIR)
    .filter(f => /\.rip$/i.test(f))
    .map(f => path.join(RIP_DIR, f))
    .filter(f => fs.statSync(f).size > 100)
    .slice(0, 6);
}

describe('the RIP pipeline', () => {
  const files = sampleFiles();

  it('has RIP files on the board to test against', () => {
    // Without this the loop below would vacuously pass.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map(f => [path.basename(f), f]))(
    '%s parses into drawable commands',
    (_name, file) => {
      const raw = fs.readFileSync(file as string, 'latin1');
      expect(containsRIPCommands(raw)).toBe(true);

      const { commands } = parseRIPCommands(raw);
      expect(commands.length).toBeGreaterThan(0);

      // At least one command the renderer actually draws, rather than a pile
      // of unknowns - a file that parses to nothing but unrecognised
      // commands would show a blank screen just as convincingly as no
      // renderer at all.
      const drawable = new Set<string>([
        RIPCommandType.BAR,
        RIPCommandType.LINE,
        RIPCommandType.RECTANGLE,
        RIPCommandType.CIRCLE,
        RIPCommandType.PIXEL,
        RIPCommandType.TEXT,
        RIPCommandType.TEXT_XY,
        RIPCommandType.OVAL,
        RIPCommandType.FILLED_OVAL,
      ]);
      expect(commands.some(c => drawable.has(c.type))).toBe(true);
    }
  );

  it('reads the door\'s own RIP mode markers', () => {
    // The door wraps its payload in ESC[1! ... ESC[2!; the terminal keys its
    // whole RIP mode off those two sequences.
    const payload = '\x1b[1!' + '!|w00000640035000\r\n' + '\x1b[2!';
    expect(payload).toContain('\x1b[1!');
    expect(payload).toContain('\x1b[2!');
    const inner = payload.split('\x1b[1!')[1].split('\x1b[2!')[0];
    const { commands } = parseRIPCommands(inner);
    expect(commands.length).toBeGreaterThan(0);
  });
});
