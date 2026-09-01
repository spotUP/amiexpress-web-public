/**
 * Every RIP file on the board, through RIPtermJS's own parser and dispatch
 * table, headless. Guards two things at once:
 *
 *  - a vendor update must not LOSE coverage of a command the board uses;
 *  - a new board file that needs a command the renderer lacks fails here
 *    instead of drawing a hole on live.
 *
 * The allowlist below is the measured residue as of 2026-09-01: RIPscrip
 * 2.0 material (JPEG references, v2 one-letter ops) in six gallery art
 * files. RIPtermJS targets 1.54; those instructions are 2-10 per file and
 * the rest of each file renders. Shrinking the list is progress; growing
 * it is a decision, not an accident - add a line consciously.
 *
 * Splitting mirrors the stream reader (playStream's state machine): a
 * backslash before end-of-line joins the next line (ST_BSLASH), '|' splits
 * instructions, and control characters in a command code are shown as
 * Unicode symbols before dispatch (sendToRIP -> controlCharsToSymbols), so
 * RIP_QUERY arrives as '1␛', not '1\x1B'.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node's TextDecoder refuses the browser-only 'x-user-defined' encoding
// RIPterm's constructor asks for; one byte = one char is what it means.
class ByteDecoder {
  decode(buf: Uint8Array): string {
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
}
(globalThis as any).TextDecoder = ByteDecoder;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * The measured residue as of 2026-09-01: RIPscrip 2.0 material (v2
 * one-letter ops, `1i`/`1p` multimedia with MSG/JPEG references) plus a
 * handful of malformed-argument instructions - all of it in gallery art
 * under RIPgraphics/, 2-10 instructions per file, the rest of each file
 * renders. RIPtermJS targets 1.54, so these stay unsupported on purpose.
 *
 * The guard: unsupported instructions are tolerated ONLY for these
 * opcodes, ONLY under RIPgraphics/, and only up to the budget. Conference
 * menus and node titles must be fully covered. Raising the budget or the
 * opcode set is a decision, not an accident.
 */
const V2_RESIDUE_OPCODES = new Set([
  'y', 'J', 'n', 'M', 'f',      // v2 text/window ops (HAWK, LAYOUT, STARFLD, ...)
  'k', 'N', 'x', 'K',           // v2 ops (LAYOUT, TNG2, ...)
  '1T', '1A', '1i', '1p',       // v2 multimedia (LAYOUT: MSG, ASTRO.JPG)
  'p', 'w', '@', 'P',           // malformed args in single gallery files
]);
const V2_RESIDUE_DIR = 'RIPgraphics/';
const V2_RESIDUE_BUDGET = 60;

function findRipFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findRipFiles(p, out);
    else if (/\.rip$/i.test(e.name)) out.push(p);
  }
  return out;
}

function esc2symbol(cmd: string): string {
  // sendToRIP maps control chars to Unicode symbols before dispatch.
  return cmd.replace(/[\x00-\x1f]/g, (c) => String.fromCharCode(0x2400 + c.charCodeAt(0)));
}

describe('the board RIP corpus is covered by RIPtermJS', () => {
  it('every instruction outside the known v2 residue parses and runs', async () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'coverage-canvas';
    canvas.width = 640; canvas.height = 350;
    (canvas as any).getContext = () =>
      new Proxy({ canvas, createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) },
        { get: (t: any, p) => (p in t ? t[p] : () => undefined) });
    document.body.appendChild(canvas);

    const { RIPterm } = await import('@amiexpress/terminal/rip/vendor/ripterm');
    const term: any = new (RIPterm as any)({ canvasId: 'coverage-canvas', logQuiet: true });

    const files = [
      ...findRipFiles(path.join(REPO, 'RIPgraphics')),
      ...findRipFiles(path.join(REPO, 'Node1')),
      ...Array.from({ length: 24 }, (_, i) => findRipFiles(path.join(REPO, `Conf${i + 1}`))).flat(),
    ];
    expect(files.length).toBeGreaterThan(100); // the corpus is real, not a glob miss

    const unexpected: string[] = [];
    let residue = 0;
    let total = 0;

    for (const file of files) {
      const raw = fs.readFileSync(file);
      let text = '';
      for (let i = 0; i < raw.length; i++) text += String.fromCharCode(raw[i]);
      text = text.replace(/\\\r?\n/g, ''); // ST_BSLASH: join continuations
      const rel = path.relative(REPO, file);
      const inGallery = rel.startsWith(V2_RESIDUE_DIR);
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('!|')) continue;
        for (const inst of line.slice(2).split(/(?<!\\)\|/)) {
          if (!inst) continue;
          total++;
          const [rawCmd, args] = term.parseRIPcmd(inst);
          const cmd0 = esc2symbol(rawCmd);
          let ok = false;
          if (term.cmd[cmd0]) {
            const o = term.cmd[cmd0](args);
            ok = Boolean(o && o.run);
          }
          if (ok) continue;
          if (inGallery && V2_RESIDUE_OPCODES.has(rawCmd)) residue++;
          else unexpected.push(`${rel}: ${JSON.stringify(rawCmd)} ${args.slice(0, 30)}`);
        }
      }
    }

    expect(total).toBeGreaterThan(50000);
    expect(unexpected.slice(0, 20), `${unexpected.length} unsupported instructions outside the known residue`).toEqual([]);
    expect(residue, 'the v2 residue grew past its budget').toBeLessThanOrEqual(V2_RESIDUE_BUDGET);
  });
});
