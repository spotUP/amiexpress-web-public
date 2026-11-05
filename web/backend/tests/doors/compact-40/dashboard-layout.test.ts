/**
 * THE SYSOP DASHBOARD AT FORTY COLUMNS.
 *
 * This door knew how to stack its three panels - its resize handler has done
 * so at the `small` breakpoint since it was written - and BUILT them at
 * `width: '50%'`. A C64 caller opens the door at forty columns and never
 * resizes anything, so the handler never ran and he got two twenty-column
 * panels, eighteen wide inside their borders, holding rows like
 * `Memory:     68%  [====================]`.
 *
 * Three things were measured off the glass and are pinned here: the panels,
 * the gauge beside each percentage, and the node list's columns. The
 * eighty-column answers are what the door drew before.
 */
import {
  dashboardPanels,
  gaugeWidth,
  nodeColumns,
  panelRuleWidth,
  panelTextPlacement,
} from '../../../../../board/Doors/bbs-dashboard/layout';

describe('the three panels', () => {
  it('sit side by side on an eighty-column board, as they always have', () => {
    const panels = dashboardPanels(80);

    expect(panels.stacked).toBe(false);
    expect(panels.system).toEqual({ left: 0, top: 1, width: '50%', height: '50%' });
    expect(panels.stats).toEqual({ left: '50%', top: 1, width: '50%', height: '50%' });
    expect(panels.nodes).toEqual({ left: 0, top: '50%+1', width: '100%', bottom: 1 });
  });

  it('stack down a C64 screen, each of them full width', () => {
    const panels = dashboardPanels(40);

    expect(panels.stacked).toBe(true);
    for (const panel of [panels.system, panels.stats, panels.nodes]) {
      expect(panel.width).toBe('100%');
      expect(panel.left).toBe(0);
    }
  });

  /*
   * "the dashboard petscii layout needs a lot of work" (the sysop,
   * 2026-09-22). A third of twenty-five rows is eight, and the system panel
   * holds THREE lines - CPU, Memory, Disk - so a C64 caller was given a
   * nearly empty box, then another, and a node list squeezed under them.
   */
  it('are sized to what they hold, not to a third of the screen each', () => {
    const panels = dashboardPanels(40);

    expect(panels.system.height).toBe(5);   // border, three gauges, border
    expect(panels.stats.height).toBe(4);    // border, two statistics, border
    expect(panels.nodes.height).toBeUndefined();
    expect(panels.nodes.bottom).toBe(1);    // ...and the list takes the rest
  });

  it('stack without a gap and without overlapping', () => {
    const panels = dashboardPanels(40);

    expect(panels.stats.top).toBe(Number(panels.system.top) + Number(panels.system.height));
    expect(panels.nodes.top).toBe(Number(panels.stats.top) + Number(panels.stats.height));
    // ...and the masthead's row is still the masthead's.
    expect(Number(panels.system.top)).toBe(1);
  });

  it('leave the node list the rows a board with callers on it needs', () => {
    const panels = dashboardPanels(40);
    const rows = 25 - Number(panels.nodes.top) - 1;   // less the status row

    expect(rows).toBeGreaterThanOrEqual(12);
  });

  it('keeps the status row: the node list is anchored to the bottom either way', () => {
    expect(dashboardPanels(40).nodes.bottom).toBe(1);
    expect(dashboardPanels(80).nodes.bottom).toBe(1);
  });
});

describe('a gauge beside a percentage', () => {
  it('is the twenty columns it has always been at eighty', () => {
    // Frozen: this door's half-width panel has always clipped the last bars
    // against its border, and an eighty-column screen is not redrawn here.
    expect(gaugeWidth(80)).toBe(20);
    expect(gaugeWidth(132)).toBe(20);
    expect(gaugeWidth(60)).toBe(20);
  });

  it('fits the panel on a C64 - label, percentage, brackets and all', () => {
    const width = gaugeWidth(40);

    /*
     * The row is `CPU Usage:  100%  ` - seventeen columns - then the bar,
     * which `makeProgressBar` draws with a bracket at EACH END on top of the
     * width it is handed. The panel's text box has thirty-six.
     */
    expect(17 + width + 2).toBeLessThanOrEqual(36);
    expect(width).toBeGreaterThanOrEqual(4);
  });
});

describe('the node list', () => {
  it('shows who is on and where, on a board with room for it', () => {
    expect(nodeColumns(80)).toEqual({ handle: 16, status: 10, showLocation: true });
  });

  it('drops the location at forty rather than squeezing four fields', () => {
    const cols = nodeColumns(40);

    expect(cols.showLocation).toBe(false);
    // ` Node   ` + handle + 2 + status, inside a thirty-six column interior.
    expect(8 + cols.handle + 2 + cols.status).toBeLessThanOrEqual(36);
  });

  it('draws its rule to the panel, not to sixty columns', () => {
    expect(panelRuleWidth(80)).toBe(60);
    expect(panelRuleWidth(40)).toBe(36);
  });
});


describe("a panel's text inside it", () => {
  /*
   * "dashboard has no content" (the sysop, 2026-09-22) - after the panels
   * had been sized to what they hold and the CONTENT had not been told. Two
   * things were wrong at once: the rows were written with a blank spacer
   * above each gauge, the spacing of an eight-row panel, and the text box
   * was inset by `top: 1`, which in a bordered box is one row BELOW the
   * first interior row. Three gauges in three rows survived neither.
   */
  it('starts at the first interior row on a C64, and takes all of it', () => {
    expect(panelTextPlacement(true)).toEqual({ top: 0, height: '100%' });
  });

  it('keeps the inset it always had on a wide board', () => {
    expect(panelTextPlacement(false)).toEqual({ top: 1, height: '100%-2' });
  });

  it('leaves the system panel exactly the rows its three gauges need', () => {
    const panels = dashboardPanels(40);
    const interior = Number(panels.system.height) - 2;   // two border rows

    expect(interior).toBe(3);
    expect(panelTextPlacement(panels.stacked).top).toBe(0);
  });

  it('leaves the statistics panel the two it shows', () => {
    const panels = dashboardPanels(40);

    expect(Number(panels.stats.height) - 2).toBe(2);
  });
});
