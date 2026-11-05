/**
 * A sysop should not have to know that a RIP region sends raw keystrokes.
 *
 * The editor used to offer one free-text field, "What a click sends to the
 * board", and a sysop who does not know the board's command letters had
 * nothing to go on. This replaces it with a picker of the board's real
 * actions - the common built-in commands (verified against command.handler),
 * the board's own doors, and a "Custom keystrokes" escape hatch for anything
 * exotic. The raw field is still reachable, so JOIN 3 and CR-terminated
 * commands are not lost.
 */
import { describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@amiexpress/terminal/rip', () => ({
  RIP_WIDTH: 640,
  RIP_HEIGHT: 350,
  // Sixteen entries, because the editor's swatches are INDEXES into the
  // palette and the tests click one by index. The real one lives in
  // packages/terminal/src/rip/RIPTypes.ts; vite cannot load it from here
  // without dragging in the canvas-bound vendor this mock exists to avoid.
  // `the palette the editor indexes into` (rip-ega-palette.test.ts) holds
  // the real one at sixteen so these indexes stay meaningful.
  EGA_PALETTE: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}`),
  RIPRenderer: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    useImperativeHandle(ref, () => ({ render: vi.fn(), clear: vi.fn(), reset: vi.fn(), getState: vi.fn() }));
    return <div data-testid="rip-canvas" />;
  }),
}));

vi.mock('../src/api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({
      data: [{ id: 1, door_name: 'Dashboard', door_command: 'DASHBOARD', door_type: 'BBSCMD' }],
    })),
  },
}));

import { RipScreenEditor } from '../src/components/RipScreenEditor';

// Button "Files" sends F (a known command); a mouse field sends JOIN 3 (custom).
const SCREEN =
  '!|c0F|B00003F27\r\n' +
  '!|1B0A040200E8010F000F080700000F00\r\n' +
  '!|1U0A0K2S141Y10<>Files<>F\r\n' +
  '!|1M010A0K2S141000000JOIN 3\r\n' +
  '!|#\r\n';
const asBase64 = (text: string) => btoa(text);
const fromBase64 = (base64: string) => atob(base64);

async function open() {
  const onSave = vi.fn();
  render(<RipScreenEditor content={asBase64(SCREEN)} onSave={onSave} onCancel={vi.fn()} />);
  return { onSave, user: userEvent.setup() };
}

describe('the RIP region command picker', () => {
  it('shows a known command on the picker, with no raw field', async () => {
    const { user } = await open();
    await user.click(screen.getAllByTestId('rip-region-row')[0]); // the F button
    const picker = await screen.findByLabelText(/when a caller clicks here/i);
    expect((picker as HTMLSelectElement).value).toBe('cmd:F');
    expect(screen.queryByLabelText('What a click sends to the board')).toBeNull();
  });

  it('drops an unknown command into Custom, with the raw field shown', async () => {
    const { user } = await open();
    await user.click(screen.getAllByTestId('rip-region-row')[1]); // JOIN 3
    const picker = await screen.findByLabelText(/when a caller clicks here/i);
    expect((picker as HTMLSelectElement).value).toBe('custom');
    expect((screen.getByLabelText('What a click sends to the board') as HTMLInputElement).value).toBe('JOIN 3');
  });

  it('picking a common action rewrites the command to its letter', async () => {
    const { onSave, user } = await open();
    await user.click(screen.getAllByTestId('rip-region-row')[1]); // JOIN 3 mouse field
    await user.selectOptions(await screen.findByLabelText(/when a caller clicks here/i), 'cmd:R');
    await user.click(screen.getByRole('button', { name: /save/i }));
    const written = fromBase64(onSave.mock.calls[0][0] as string);
    // Only that mouse field's command changed, to R.
    expect(written).toContain('!|1M010A0K2S141000000R\r\n');
    expect(written).toContain('!|1U0A0K2S141Y10<>Files<>F\r\n'); // the button untouched
  });

  it('picking a board door sends that door command', async () => {
    const { onSave, user } = await open();
    await user.click(screen.getAllByTestId('rip-region-row')[1]);
    await user.selectOptions(await screen.findByLabelText(/when a caller clicks here/i), 'door:DASHBOARD');
    await user.click(screen.getByRole('button', { name: /save/i }));
    const written = fromBase64(onSave.mock.calls[0][0] as string);
    expect(written).toContain('!|1M010A0K2S141000000DASHBOARD\r\n');
  });

  it('Custom keystrokes reveals the raw field for anything exotic', async () => {
    const { user } = await open();
    await user.click(screen.getAllByTestId('rip-region-row')[0]); // F, starts as a preset
    expect(screen.queryByLabelText('What a click sends to the board')).toBeNull();
    await user.selectOptions(await screen.findByLabelText(/when a caller clicks here/i), 'custom');
    expect(screen.getByLabelText('What a click sends to the board')).toBeTruthy();
  });
});
