/**
 * The one loader the board has must fit the screen it is drawn on.
 *
 * DoorLoader asked for `width: 60` whatever the caller had. Sixty columns is
 * wider than a PETSCII caller's entire screen, so the door that finally had
 * a working progress bar drew it off the edge for every C64 - and the sysop's
 * report was that the preloaders are broken across the board (2026-09-13).
 *
 * The door rules say it outright: geometry comes from the screen, never from
 * a number. calculateDialogWidth is the SDK's own ladder, so the loader lands
 * where every other dialog does at each width.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DoorLoader } from '../../utils/DoorLoader';
import { calculateDialogWidth } from '../../engines/ui/blessed/core/responsive-constants';

function screenOf(width: number, height = 25): any {
  return new Screen({ title: 'loader', responsive: true, width, height } as any);
}

/** Every box the loader drew, with its real painted width. */
function widths(screen: any): number[] {
  const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
  return all(screen)
    .filter((el: any) => el !== screen && typeof el.width === 'number')
    .map((el: any) => el.width as number);
}

describe('the loader fits the screen it is on', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('fits a C64 at forty columns, where sixty never could', () => {
    screen = screenOf(40);
    const loader = new DoorLoader(screen);
    loader.show('Loading the lobby...');

    for (const w of widths(screen)) {
      expect(w).toBeLessThanOrEqual(40);
    }
    loader.hide();
  });

  it('takes the SDK ladder at eighty, like every other dialog', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');

    // Not 60-by-decree: whatever the shared helper says for this width, so
    // a change to the ladder moves the loader with everything else.
    expect(widths(screen)).toContain(calculateDialogWidth(80));
    loader.hide();
  });

  it('grows with a wide terminal instead of sitting in a fixed box', () => {
    screen = screenOf(132, 40);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');

    expect(widths(screen)).toContain(calculateDialogWidth(132));
    expect(calculateDialogWidth(132)).toBeGreaterThan(calculateDialogWidth(80));
    loader.hide();
  });

  it('drops its frame at forty, where two columns of border are two too many', () => {
    screen = screenOf(40);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');

    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    const framed = all(screen).filter((el: any) => el !== screen && el.options?.border);
    expect(framed).toHaveLength(0);
    loader.hide();
  });

  it('still shows a progress bar when one is asked for', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');
    loader.update(50, 'Half way');

    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    const bar = all(screen).find((el: any) => typeof el.setProgress === 'function');
    expect(bar).toBeTruthy();
    expect(bar.hidden).toBe(false);
    loader.hide();
  });
});

/**
 * The loader has to COVER the door it is waiting for.
 *
 * Loading's own `overlay` is a CSS dim: an OSC sequence the browser shades,
 * painting no cells. So the door's panels - created but not yet filled -
 * showed through it as loose coloured bars, and a telnet or SSH caller got
 * no dimming at all. The sysop's screenshot, 2026-09-13: "the preloader
 * looks super broken", with half a lobby visible around the box.
 */
describe('the loader covers what is behind it', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  /** Every element that paints the full screen, in draw order. */
  function fullScreenBoxes(s: any): any[] {
    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    return all(s).filter(
      (el: any) => el !== s && el.width === s.width && el.height === s.height,
    );
  }

  it('paints a backdrop over the whole screen, not a browser-side dim', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');

    const covers = fullScreenBoxes(screen).filter((el: any) => !el.hidden);
    expect(covers.length).toBeGreaterThan(0);
    // Cells, not an escape the terminal cannot honour: a fill character.
    expect(covers.some((el: any) => el.options?.ch === ' ')).toBe(true);
    // And NO browser-side overlay beside it: Loading turns that on when
    // either `overlay` or `overlayOpacity` is set, so passing an opacity
    // put the CSS dim straight back.
    expect(covers.some((el: any) => el.constructor?.name === 'Overlay')).toBe(false);
  });

  it('takes the backdrop away again when it hides', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');
    loader.hide();

    const covers = fullScreenBoxes(screen).filter((el: any) => !el.hidden);
    expect(covers).toHaveLength(0);
  });

  it('keeps the dialog above the backdrop', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Loading...');

    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    const order = all(screen);
    const backdrop = order.find((el: any) => el !== screen && el.options?.ch === ' ' && el.width === screen.width);
    // The dialog is the one that is NOT full-screen - Box has setText too,
    // so "has setText" alone finds the backdrop first.
    const dialog = order.find(
      (el: any) => el !== screen && typeof el.setText === 'function' && typeof el.stop === 'function',
    );
    expect(backdrop).toBeTruthy();
    expect(dialog).toBeTruthy();
    // Later in the tree is painted later, so the dialog must come after.
    expect(order.indexOf(dialog)).toBeGreaterThan(order.indexOf(backdrop));
    loader.hide();
  });
});

/**
 * The loader has to stay on top of a door that is still building itself.
 *
 * "i see it when the door ui has drawn already, then it's too late it
 * should run before the door is ready" (sysop, 2026-09-14). Two halves to
 * that: the door must raise the loader before it builds anything - that is
 * the door's job - and the loader must survive what gets built afterwards,
 * which is this one. Blessed paints in TREE ORDER, so a panel created after
 * the loader is painted over it; the box looking transparent was never a
 * transparency problem.
 */
describe('the loader stays above a door still being built', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  const Box = require('../../engines/ui/blessed/widgets/box').Box;
  const order = (s: any): any[] => {
    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    return all(s);
  };

  it('is painted after panels the door builds while it is showing', () => {
    screen = screenOf(80);
    const loader = new DoorLoader(screen);
    loader.show('Initializing...');

    // The door carries on assembling itself underneath.
    const panel = new Box({
      parent: screen, top: 2, left: 2, width: 20, height: 3, ch: ' ',
    } as any);

    loader.update(20, 'Loading player profiles...');

    // screen.children IS the paint order - later is painted on top. A
    // flattened depth-first walk is not: it interleaves each element's own
    // children and says nothing about siblings.
    const kids: any[] = screen.children;
    const backdrop = kids.find((el: any) => el.options?.ch === ' ' && el.width === screen.width);
    const dialog = kids.find(
      (el: any) => typeof el.setText === 'function' && typeof el.stop === 'function',
    );

    expect(kids.indexOf(backdrop)).toBeGreaterThan(kids.indexOf(panel));
    expect(kids.indexOf(dialog)).toBeGreaterThan(kids.indexOf(backdrop));
    loader.hide();
  });
});
