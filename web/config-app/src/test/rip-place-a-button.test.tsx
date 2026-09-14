/**
 * Dragging on a RIP screen makes a clickable REGION or a BUTTON, and the
 * difference is who owns the look.
 *
 * The sysop draws in Illustrator and brings the art in as SVG - "drawing is
 * not a gap it will be done in illustrator can we add buttons etc?"
 * (2026-09-14) - so a region over that art is the default: invisible, the
 * picture says what it looks like. A button is drawn BY RIP from the current
 * button style, for where there is no art behind it.
 *
 * The editor could already EDIT a button that existed (the label field has
 * been there all along); it had no way to make one.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';

vi.mock('@amiexpress/terminal/rip', () => ({
  RIP_WIDTH: 640,
  RIP_HEIGHT: 350,
  RIPRenderer: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    useImperativeHandle(ref, () => ({
      render: vi.fn(), clear: vi.fn(), reset: vi.fn(), getState: vi.fn(),
    }));
    return <div data-testid="rip-canvas" />;
  }),
}));

import { RipScreenEditor } from '../components/RipScreenEditor';

/** Artwork and an end-of-scene marker, and nothing clickable yet. */
const SCREEN = '!|c0F|B00003F27\r\n!|#\r\n';

const asBase64 = (text: string) => btoa(text);
const fromBase64 = (base64: string) => atob(base64);

/**
 * The drag surface measures 0x0 in jsdom, and `toRip` divides by its width -
 * so without a box every drag lands at 0,0 and is discarded as too small.
 */
function giveTheSurfaceASize(element: HTMLElement) {
  element.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 640, height: 350, right: 640, bottom: 350, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect;
}

/** Drag a rectangle across the picture, in RIP's own coordinates. */
function drag(surface: HTMLElement, x0: number, y0: number, x1: number, y1: number) {
  fireEvent.pointerDown(surface, { clientX: x0, clientY: y0 });
  fireEvent.pointerMove(surface, { clientX: x1, clientY: y1 });
  fireEvent.pointerUp(surface, { clientX: x1, clientY: y1 });
}

async function placeAndSave(kind: 'region' | 'button') {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<RipScreenEditor content={asBase64(SCREEN)} onSave={onSave} onCancel={vi.fn()} />);

  if (kind === 'button') {
    await user.selectOptions(
      screen.getByLabelText('Dragging on the picture makes'),
      'button',
    );
  }

  const surface = screen.getByTestId('rip-surface');
  giveTheSurfaceASize(surface);
  drag(surface, 100, 200, 300, 260);

  return { user, onSave };
}

describe('placing something clickable on a RIP screen', () => {
  it('makes a mouse field by default, so the art keeps the look', async () => {
    const { user, onSave } = await placeAndSave('region');

    await user.click(screen.getByRole('button', { name: /save/i }));

    const written = fromBase64(onSave.mock.calls[0][0] as string);
    expect(written).toContain('!|1M');
    expect(written).not.toContain('!|1U');
  });

  it('makes a real button when asked, with its label', async () => {
    const { user, onSave } = await placeAndSave('button');

    await user.type(screen.getByLabelText('Label on the button'), 'Files');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const written = fromBase64(onSave.mock.calls[0][0] as string);
    expect(written).toContain('!|1U');
    // RIP packs a button's text as icon<>label<>command.
    expect(written).toContain('<>Files<>');
  });

  it('leaves the artwork alone either way', async () => {
    const { user, onSave } = await placeAndSave('button');

    await user.click(screen.getByRole('button', { name: /save/i }));

    const written = fromBase64(onSave.mock.calls[0][0] as string);
    expect(written.startsWith('!|c0F|B00003F27\r\n')).toBe(true);
    // And it runs BEFORE the end of the scene, or it never runs at all.
    expect(written.indexOf('!|1U')).toBeLessThan(written.indexOf('!|#'));
  });
});
