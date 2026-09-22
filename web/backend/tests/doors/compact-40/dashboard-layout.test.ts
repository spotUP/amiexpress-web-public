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
} from '../../../../../Doors/bbs-dashboard/layout';

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
    // `CPU Usage:  100%  ` is eighteen columns, and the panel's interior at
    // forty is thirty-six.
    expect(18 + width + 2).toBeLessThanOrEqual(36 + 2);
    expect(width).toBeGreaterThanOrEqual(6);
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
