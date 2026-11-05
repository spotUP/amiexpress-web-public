import { createCanvas, parseANSIToCanvas } from '../../engines/ui/ansi-editor/core/canvas';
import { loadANSFile } from '../../engines/ui/ansi-editor/core/file-ops';
import { EditorState } from '../../engines/ui/ansi-editor/core/editor-state';

// ESC[49m / ESC[39m are the default background / foreground. Board art writes
// them after a coloured run; a reader that ignores them leaks the colour.
const BG = '\x1b[44m A\x1b[49m B';
const FG = '\x1b[31m A\x1b[39m B';

describe('SGR 49 and 39 return to the editor defaults', () => {
  it('canvas parser: 49 resets the background, 39 the foreground', () => {
    const c1 = createCanvas(10, 2);
    parseANSIToCanvas(c1, BG);
    expect(c1[0][1].bg).toBe(4);
    expect(c1[0][3].bg).toBe(0);
    const c2 = createCanvas(10, 2);
    parseANSIToCanvas(c2, FG);
    expect(c2[0][1].fg).toBe(1);
    expect(c2[0][3].fg).toBe(7);
  });

  it('file importer (the screen editor load path) honours both', async () => {
    const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
    const b = await loadANSFile(enc(BG));
    expect(b.canvas[0][1].bg).toBe(4);
    expect(b.canvas[0][3].bg).toBe(0);
    const f = await loadANSFile(enc(FG));
    expect(f.canvas[0][1].fg).toBe(1);
    expect(f.canvas[0][3].fg).toBe(7);
  });

  it('editor-state loader honours both', () => {
    const st = new EditorState();
    st.loadCanvasFromANSI(BG, 10, 2);
    const cb = st.getState().canvas!;
    expect(cb[0][1].bg).toBe(4);
    expect(cb[0][3].bg).toBe(0);
    st.loadCanvasFromANSI(FG, 10, 2);
    const cf = st.getState().canvas!;
    expect(cf[0][3].fg).toBe(7);
  });
});
