/**
 * The codes a screen runs, found on the canvas.
 *
 * A screen on this board is a program: `~CC_gwall|` runs a door, `~SS_` pulls
 * in another screen. The editor has to show those as what they are - and show
 * a broken one - rather than as decoration a sysop might paint over.
 *
 * The patterns themselves are the BOARD'S, imported from the backend parser.
 * A copy of those regexes living here would be the third one in the repo and
 * the first to drift.
 */
import { describe, expect, it } from 'vitest';
import { findMciTokens, MCI_INSERTS } from '../pages/mci-tokens';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';

function canvasFromText(...lines: string[]): Cell[][] {
  const width = Math.max(...lines.map(l => l.length), 1);
  const canvas = createCanvas(width, lines.length);
  lines.forEach((line, y) => {
    [...line].forEach((char, x) => setCell(canvas, x, y, { char, fg: 7, bg: 0 }));
  });
  return canvas;
}

describe('the MCI codes on a canvas', () => {
  it('finds a ~CC_ token and where it sits', () => {
    const canvas = canvasFromText('run ~CC_gwall| now');

    const [token] = findMciTokens(canvas, [
      { code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false },
    ]);

    expect(token).toMatchObject({ code: 'CC', target: 'gwall', line: 0, column: 4, resolves: true });
  });

  it('measures the token so it can be highlighted, tilde to target', () => {
    const [token] = findMciTokens(canvasFromText('~CC_gwall|'), [
      { code: 'CC', target: 'gwall', resolves: true, scopeSpecific: false },
    ]);

    expect(token.length).toBe('~CC_gwall'.length);
  });

  it('a token whose target is gone is reported as broken, in place', () => {
    const [token] = findMciTokens(canvasFromText('~CC_nosuchdoor|'), [
      { code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false },
    ]);

    expect(token).toMatchObject({ resolves: false, line: 0, column: 0 });
  });

  it('reads each row as its own line, so line and column are the canvas', () => {
    const canvas = canvasFromText('title', '  ~SS_BBS:Node1/x.txt');

    const [token] = findMciTokens(canvas, [
      { code: 'SS', target: 'BBS:Node1/x.txt', resolves: true, scopeSpecific: true },
    ]);

    expect(token).toMatchObject({ code: 'SS', line: 1, column: 2 });
  });

  it('a token the index says nothing about is shown, and not claimed to resolve', () => {
    // The index carries the facts for the file on disk. A code the sysop has
    // just typed is not in it yet, and pretending it resolves would be a lie
    // in the one colour that matters.
    const [token] = findMciTokens(canvasFromText('~CC_brandnew|'), []);

    expect(token).toMatchObject({ code: 'CC', target: 'brandnew', resolves: false });
  });

  it('a literal ~~ is not the start of a code', () => {
    expect(findMciTokens(canvasFromText('~~CC_gwall|'), [])).toHaveLength(0);
  });

  it('finds every code the board actually uses', () => {
    const canvas = canvasFromText('~CC_a| ~SS_b ~SR_c ~CL.');

    expect(findMciTokens(canvas, []).map(t => t.code)).toEqual(['CC', 'SS', 'SR', 'CL']);
  });

  it('the insert list offers the codes this board actually uses', () => {
    expect(MCI_INSERTS.map(i => i.code)).toEqual(['CC', 'SS', 'SR', 'CL']);
  });
});
