/**
 * A sysop can change what a RIP screen's clickable regions send, and save it.
 *
 * The guarantee under all of it: the ARTWORK is not touched. A .rip file is a
 * vector program of several hundred drawing commands, and the manager writes
 * through the same path an upload does - so a save that re-wrote the picture,
 * even "equivalently", would be a diff on a live screen with no way back but
 * the backup.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef, useImperativeHandle } from 'react';

// RIPtermJS needs a real 2D canvas context and fetches its .CHR fonts over
// the network; jsdom has neither. What is under test here is the authoring
// layer, so the picture is stubbed and the bytes are asserted.
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

/**
 * A small scene with one button and one mouse field: a bar of artwork, a
 * button style, a button labelled Files that sends F, a mouse field that
 * sends JOIN 3, and the end-of-scene marker.
 */
const SCREEN =
  '!|c0F|B00003F27\r\n' +
  '!|1B0A040200E8010F000F080700000F00\r\n' +
  '!|1U0A0K2S141Y10<>Files<>F\r\n' +
  '!|1M010A0K2S141000000JOIN 3\r\n' +
  '!|#\r\n';

const asBase64 = (text: string) => btoa(text);
const fromBase64 = (base64: string) => atob(base64);

describe('editing a RIP screen', () => {
  it('lists what each clickable region sends to the board', () => {
    render(<RipScreenEditor content={asBase64(SCREEN)} onSave={vi.fn()} onCancel={vi.fn()} />);

    const rows = screen.getAllByTestId('rip-region-row').map(row => row.textContent);
    expect(rows).toEqual(['Filessends F', 'Mouse field 1sends JOIN 3']);
  });

  it('changes what a mouse field sends, and rewrites only that instruction', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RipScreenEditor content={asBase64(SCREEN)} onSave={onSave} onCancel={vi.fn()} />);

    await user.click(screen.getAllByTestId('rip-region-row')[1]);
    const field = screen.getByLabelText('What a click sends to the board');
    await user.clear(field);
    await user.type(field, 'JOIN 7');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const written = fromBase64(onSave.mock.calls[0][0] as string);
    expect(written).toBe(
      '!|c0F|B00003F27\r\n' +
      '!|1B0A040200E8010F000F080700000F00\r\n' +
      '!|1U0A0K2S141Y10<>Files<>F\r\n' +
      '!|1M010A0K2S141000000JOIN 7\r\n' +
      '!|#\r\n',
    );
  });

  it('saves a screen nobody changed as the bytes it arrived as', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RipScreenEditor content={asBase64(SCREEN)} onSave={onSave} onCancel={vi.fn()} />);

    // Selecting a region is not an edit.
    await user.click(screen.getAllByTestId('rip-region-row')[0]);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(fromBase64(onSave.mock.calls[0][0] as string)).toBe(SCREEN);
  });

  it('removes a region without disturbing the artwork', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RipScreenEditor content={asBase64(SCREEN)} onSave={onSave} onCancel={vi.fn()} />);

    await user.click(screen.getAllByTestId('rip-region-row')[1]);
    await user.click(screen.getByRole('button', { name: /remove this region/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(fromBase64(onSave.mock.calls[0][0] as string)).toBe(
      '!|c0F|B00003F27\r\n' +
      '!|1B0A040200E8010F000F080700000F00\r\n' +
      '!|1U0A0K2S141Y10<>Files<>F\r\n' +
      '!|#\r\n',
    );
  });

  it('says so when a coordinate will not fit a RIP field', async () => {
    const user = userEvent.setup();
    render(<RipScreenEditor content={asBase64(SCREEN)} onSave={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getAllByTestId('rip-region-row')[1]);
    const right = screen.getByLabelText('Right');
    await user.clear(right);
    await user.type(right, '1300');

    // 1300 is past what two MegaNum digits hold; writing it would overrun the
    // next argument rather than draw a wide region.
    expect(await screen.findByText(/does not fit/i)).toBeTruthy();
  });

  it('offers no way to change anything when it is only previewing', () => {
    render(<RipScreenEditor content={asBase64(SCREEN)} readOnly />);

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getAllByTestId('rip-region-row')).toHaveLength(2);
  });
});
