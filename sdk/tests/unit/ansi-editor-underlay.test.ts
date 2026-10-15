/**
 * A ghost of another canvas, drawn under the transparent cells.
 *
 * This is what onion skin is made of: while drawing frame 2 you need to see
 * frame 1 through the holes, dimmed enough that you never mistake it for
 * your own work. The editor cannot composite it itself - it has no idea
 * what a frame is - so a host hands it one and the editor renders it
 * beneath, never as content.
 *
 * The invariant that makes it safe: the underlay is presentation only.
 * getCoreCanvas() must never return a cell that came from it, or the sprite
 * would be saved with the previous frame baked into its holes.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({ title: 'underlay', responsive: true, width: 100, height: 40 } as any);
}

const ghost = (char: string) => [[{ char, fg: 2, bg: 0 }]];

describe('ANSIEditor underlay', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const editor = (): any => new ANSIEditor({
    parent: screen, canvasWidth: 1, canvasHeight: 1,
    initialMode: 'draw', transparentBackground: true,
  } as any);

  it('draws nothing extra when no underlay is set', () => {
    const e = editor();
    const content = e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x]);
    expect(content.includes('G')).toBe(false);
  });

  it('shows the ghost through a transparent cell', () => {
    const e = editor();
    e.setUnderlay(ghost('G'));
    const content = e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x]);
    expect(content.includes('G')).toBe(true);
  });

  it('hides the ghost under a painted cell - your own work wins', () => {
    const e = editor();
    e.setUnderlay(ghost('G'));
    e.getCoreCanvas()[0][0] = { char: 'X', fg: 7, bg: 0 };
    const content = e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x]);
    expect(content.includes('X')).toBe(true);
    expect(content.includes('G')).toBe(false);
  });

  it('never lets the ghost into the canvas the host reads back', () => {
    const e = editor();
    e.setUnderlay(ghost('G'));
    e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x]);
    const canvas = e.getCoreCanvas();
    expect(canvas[0][0].char).not.toBe('G');
    expect(canvas[0][0].transparent).toBe(true);
  });

  it('clears again', () => {
    const e = editor();
    e.setUnderlay(ghost('G'));
    e.setUnderlay(null);
    const content = e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x]);
    expect(content.includes('G')).toBe(false);
  });

  it('tolerates an underlay smaller than the canvas', () => {
    const e: any = new ANSIEditor({
      parent: screen, canvasWidth: 3, canvasHeight: 2,
      initialMode: 'draw', transparentBackground: true,
    } as any);
    e.setUnderlay(ghost('G'));
    expect(() => e.buildCanvasContent((x: number, y: number) => e.getCoreCanvas()[y][x])).not.toThrow();
  });
});
