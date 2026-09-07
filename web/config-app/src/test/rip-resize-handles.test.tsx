/**
 * A region can be resized by dragging its corners, not only by typing numbers.
 *
 * The geometry maths is pure and tested here; the pointer-to-picture mapping is
 * the same `toRip` the drawing tool uses, which jsdom cannot lay out, so the
 * render test only asserts the handles appear for the selected region.
 */
import { describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@amiexpress/terminal/rip', () => ({
  RIP_WIDTH: 640,
  RIP_HEIGHT: 350,
  RIPRenderer: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    useImperativeHandle(ref, () => ({ render: vi.fn(), clear: vi.fn(), reset: vi.fn(), getState: vi.fn() }));
    return <div data-testid="rip-canvas" />;
  }),
}));
vi.mock('../api/client', () => ({ apiClient: { getDoors: vi.fn(async () => ({ data: [] })) } }));

import { RipScreenEditor, resizeCorner } from '../components/RipScreenEditor';

describe('resizeCorner', () => {
  const spot = { x0: 100, y0: 100, x1: 200, y1: 200 };

  it('nw moves the top-left corner', () => {
    expect(resizeCorner(spot, 'nw', { x: 120, y: 130 })).toEqual({ x0: 120, y0: 130 });
  });
  it('se moves the bottom-right corner', () => {
    expect(resizeCorner(spot, 'se', { x: 250, y: 260 })).toEqual({ x1: 250, y1: 260 });
  });
  it('ne moves right and top', () => {
    expect(resizeCorner(spot, 'ne', { x: 240, y: 90 })).toEqual({ x1: 240, y0: 90 });
  });
  it('never crosses the opposite corner - a box keeps a minimum size', () => {
    expect(resizeCorner(spot, 'nw', { x: 999, y: 999 })).toEqual({ x0: 196, y0: 196 });
    expect(resizeCorner(spot, 'se', { x: 0, y: 0 })).toEqual({ x1: 104, y1: 104 });
  });
  it('clamps to the RIP bounds', () => {
    expect(resizeCorner(spot, 'se', { x: 9999, y: 9999 })).toEqual({ x1: 639, y1: 349 });
    expect(resizeCorner(spot, 'nw', { x: -50, y: -50 })).toEqual({ x0: 0, y0: 0 });
  });
});

const SCREEN =
  '!|c0F|B00003F27\r\n' +
  '!|1M010A0K2S141000000F\r\n' +
  '!|#\r\n';

describe('the resize handles', () => {
  it('appear on the selected region and nowhere before selection', async () => {
    const user = userEvent.setup();
    render(<RipScreenEditor content={btoa(SCREEN)} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryAllByTestId('rip-resize-handle')).toHaveLength(0);
    await user.click(screen.getAllByTestId('rip-region-row')[0]);
    expect(screen.getAllByTestId('rip-resize-handle')).toHaveLength(4);
  });

  it('are not offered in read-only mode', async () => {
    render(<RipScreenEditor content={btoa(SCREEN)} readOnly />);
    expect(screen.queryAllByTestId('rip-resize-handle')).toHaveLength(0);
  });
});
