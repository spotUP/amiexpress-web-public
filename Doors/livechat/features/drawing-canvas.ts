import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { PANEL_BORDER } from '../ui/theme';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

export function createDrawingCanvas(s: Screen, sock: any, st: any, cl: any, tb: any, bbs: any, ib: any, gcdn: (c: string) => string, ucl: () => void, usb: () => void, asm: (m: string) => void, MH: number, SW: number, SH: number, IH: number) {
  const dcs = new Set<string>();
  let dm = false;
  let cdc: string | null = null;
  let dc = 'white';
  let pc: string | null = null;
  let ldx = -1;
  let ldy = -1;

  const idc = (cn: string): boolean => dcs.has(cn) || cn.startsWith('art:');

  const canvas = blessed.canvas({ parent: s, top: MH, left: SW, right: 0, bottom: SH + IH, label: ' Drawing [Resize: Corner] - Click/Drag | C: Colors | X: Clear | ESC: Exit ', border: { type: 'line' }, hidden: true, mouse: true, fillChar: '\u2588', clearChar: ' ', ch: ' ', style: { fg: 'white', bg: 'black', border: { fg: PANEL_BORDER } } });

  const cols = ['white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray'];
  let ci = 0;

  canvas.enableResize();

  const pal = blessed.box({ parent: s, top: 0, left: 0, width: 1, height: 1, hidden: true, tags: true });

  canvas.on('mouse', (e: any) => {
    if (!dm) return;
    const cl = (canvas as any).aleft || 0;
    const ct = (canvas as any).atop || 0;
    const x = e.x - cl - 1;
    const y = e.y - ct - 1;
    if (e.action === 'mousemove' || e.action === 'mousedown') {
      s.program.cup(e.y, e.x);
      s.program.showCursor();
    }
    if (e.action === 'mousedown' || (e.action === 'mousemove' && e.button === 'left')) {
      if (ldx >= 0 && ldy >= 0) {
        canvas.drawLine(ldx, ldy, x, y, '\u2588');
      } else {
        canvas.setPixel(x, y, '\u2588');
      }
      ldx = x;
      ldy = y;
      canvas.render();
      sock.emit('draw:pixel', { channel: cdc, x, y, color: dc, lastX: ldx, lastY: ldy });
    } else if (e.action === 'mouseup') {
      ldx = -1;
      ldy = -1;
    }
  });

  sock.on('draw:pixel', (d: any) => {
    if (d.channel !== cdc) return;
    if (d.lastX >= 0 && d.lastY >= 0) {
      canvas.drawLine(d.lastX, d.lastY, d.x, d.y, '\u2588');
    } else {
      canvas.setPixel(d.x, d.y, '\u2588');
    }
    canvas.render();
  });

  sock.on('draw:clear', (d: any) => { if (d.channel === cdc) canvas.clearCanvas(); });

  canvas.key(['c'], () => { ci = (ci + 1) % cols.length; dc = cols[ci]; asm(`Drawing color: ${dc}`); });

  canvas.key(['x'], () => { canvas.clearCanvas(); sock.emit('draw:clear', { channel: cdc }); asm('Canvas cleared'); });

  canvas.key(['escape'], () => { exit(); });

  function enter(cn: string) {
    pc = st.currentChannel;
    cdc = cn;
    dm = true;
    cl.hide();
    tb.hide();
    canvas.show();
    pal.show();
    canvas.setLabel(` Drawing: #${cn} - C: Colors | X: Clear | ESC: Exit `);
    const cp = (canvas as any)._getCoords?.();
    if (cp) {
      const sy = cp.yi + 1;
      const sx = cp.xi + 1;
      const ey = cp.yl - 1;
      const ex = cp.xl - 1;
      const bb = '\x1b[40m';
      const wf = '\x1b[37m';
      for (let y = sy; y < ey; y++) {
        bbs.write(`\x1b[${y + 1};${sx + 1}H${bb}${wf}${' '.repeat(ex - sx)}`);
      }
      bbs.write('\x1b[0m');
    }
    canvas.clearCanvas();
    canvas.focus();
    s.render();
    asm(`Entered drawing mode for #${cn}`);
  }

  function exit() {
    dm = false;
    cdc = null;
    canvas.hide();
    pal.hide();
    cl.show();
    tb.show();
    s.program.hideCursor();
    ib.focus();
    if (pc && !idc(pc)) {
      const pn = gcdn(pc);
      sock.emit('room:leave');
      if (pn) sock.emit('room:join', { roomName: pn });
      st.currentChannel = pc;
      ucl();
      usb();
      asm(`Returned to #${pn || pc}`);
    }
    pc = null;
    s.render();
  }

  return { drawingCanvas: canvas, drawingChannels: dcs, isDrawingChannel: idc, enterDrawingMode: enter, exitDrawingMode: exit };
}
