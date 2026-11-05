/**
 * The SDK's editor core has to run in a browser bundle, not just in Node.
 *
 * core/, tools/ and input/ carry no Node imports - only api/ and ui/ bind to
 * blessed - so this is a packaging question, and packaging is exactly what a
 * smoke test should settle before three tasks are built on top of it.
 */
import { describe, expect, it } from 'vitest';
import {
  createCanvas, setCell, getCell,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

describe('the SDK editor core, in a browser bundle', () => {
  it('creates a canvas and holds a cell', () => {
    const canvas = createCanvas(4, 2);
    setCell(canvas, 1, 1, { char: 'A', fg: 15, bg: 0 });

    expect(getCell(canvas, 1, 1)).toMatchObject({ char: 'A', fg: 15 });
  });

  it('draws a line through the cells between two points', async () => {
    const { drawLine } = await import('@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas');
    const canvas = createCanvas(8, 2);

    drawLine(canvas, 0, 0, 4, 0, { char: '#', fg: 7, bg: 0 });

    expect(getCell(canvas, 2, 0)?.char).toBe('#');
  });
});
