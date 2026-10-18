/**
 * A door's own settings, rendered from what the door declares.
 *
 * The admin could edit six fields and a raw tooltype list per door. The only
 * door that ever looked configurable was GWall, because a hand-written page was
 * written by hand for it - so a sysop with 42 TypeScript doors installed saw
 * exactly one of them configurable. This form is built from the door's own
 * door.settings.json, with no door-specific code in the admin.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const VIEW = {
  manifest: {
    command: 'TESTDOOR',
    settings: [
      { key: 'server', label: 'Server', type: 'string', default: 'bbs.example.org', help: 'Where the door connects' },
      { key: 'port', label: 'Port', type: 'number', default: 6667, min: 1, max: 65535 },
      // The Card Lobby's entry fee: a rate, declared fractional.
      { key: 'entryFeeRate', label: 'Entry fee rate', type: 'number', default: 0.02, min: 0, max: 1 },
      { key: 'announce', label: 'Announce joins', type: 'boolean', default: true },
      { key: 'style', label: 'Style', type: 'choice', default: '4',
        choices: [{ value: '1', label: 'One' }, { value: '4', label: 'Four' }] },
      { key: 'password', label: 'Password', type: 'string', secret: true },
    ],
  },
  values: { server: 'bbs.example.org', port: 6667, entryFeeRate: 0.02, announce: true, style: '4', password: '' },
  secretsSet: ['password'],
};

// Typed with the arguments the client passes: an untyped vi.fn() infers a
// zero-argument signature, so `tsc` rejects the call while vitest runs it
// happily - green under the test runner, red under build:check.
const saveDoorSettings = vi.fn(async (_command: string, _values: Record<string, unknown>) => ({ success: true, data: VIEW }));
const getDoorSettings = vi.fn(async (_command: string) => ({ success: true, data: VIEW }));

vi.mock('../api/client', () => ({
  apiClient: {
    getDoorSettings: (command: string) => getDoorSettings(command),
    saveDoorSettings: (command: string, values: Record<string, unknown>) =>
      saveDoorSettings(command, values),
  },
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { DoorSettingsForm } = await import('../components/DoorSettingsForm');

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DoorSettingsForm command="TESTDOOR" />
    </QueryClientProvider>
  );
}

describe('the door settings form', () => {
  beforeEach(() => { saveDoorSettings.mockClear(); getDoorSettings.mockClear(); });

  it('renders a control for every setting the door declares', async () => {
    renderForm();

    await waitFor(() => expect(screen.getByLabelText('Server')).toBeTruthy());
    expect(screen.getByLabelText('Port')).toBeTruthy();
    expect(screen.getByLabelText('Announce joins')).toBeTruthy();
    // Two-option sets render as radios under a legend, not a dropdown.
    expect(screen.getByText('Style')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Four' })).toBeTruthy();
    expect(screen.getByText('Where the door connects')).toBeTruthy();
  });

  it('lets a fractional setting hold a fraction', async () => {
    // `<input type="number">` defaults to step=1, so the browser REFUSED the
    // Card Lobby's own declared 0.02: "the two nearest valid values are 0 and
    // 1". Reported from the board on 2026-09-08.
    renderForm();

    const rate = await screen.findByLabelText('Entry fee rate') as HTMLInputElement;

    expect(rate.step).toBe('any');
    expect(rate.checkValidity()).toBe(true);
    expect(rate.value).toBe('0.02');
  });

  it('keeps whole numbers whole where the door declared them that way', async () => {
    renderForm();

    const port = await screen.findByLabelText('Port') as HTMLInputElement;

    // Turns, chips and ports have no fractional half; stepping by 1 is the
    // guard, and only a setting that declares a fraction gives it up.
    expect(port.step).toBe('1');
  });

  it('sends what the sysop changed, keyed the way the door declared it', async () => {
    const user = userEvent.setup();
    renderForm();

    const server = await screen.findByLabelText('Server') as HTMLInputElement;
    await user.clear(server);
    await user.type(server, 'wall.uprough.net');

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled(), { timeout: 3000 });
    const [command, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(command).toBe('TESTDOOR');
    expect(values.server).toBe('wall.uprough.net');
  });

  it('offers only the choices the door declares', async () => {
    renderForm();

    await waitFor(() => expect(screen.getByRole('radio', { name: 'One' })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Four' })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('a longer choice list keeps the dropdown', async () => {
    getDoorSettings.mockImplementationOnce(async () => ({
      success: true,
      data: {
        manifest: {
          command: 'TESTDOOR',
          settings: [
            { key: 'tz', label: 'Timezone', type: 'choice', default: 'a',
              choices: [
                { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
                { value: 'c', label: 'C' }, { value: 'd', label: 'D' },
              ] },
          ],
        },
        values: { tz: 'a' },
        secretsSet: [],
      },
    } as any));
    renderForm();

    const select = await screen.findByLabelText('Timezone') as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a radio pick saves the picked value', async () => {
    const user = userEvent.setup();
    renderForm();

    const one = await screen.findByRole('radio', { name: 'One' });
    await user.click(one);

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled(), { timeout: 3000 });
    const [, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(values).toEqual({ style: '1' });
  });

  it('hides a secret and says it is set', async () => {
    renderForm();

    const password = await screen.findByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.value).toBe('');
    expect(password.placeholder).toMatch(/leave blank to keep/i);
  });

  it('says so plainly when a door declares nothing', async () => {
    getDoorSettings.mockImplementationOnce(async () => { throw new Error('declares no settings'); });
    renderForm();

    await waitFor(() => expect(screen.getByText(/declares no settings/i)).toBeTruthy());
  });

  // Sending the whole form writes the door's own defaults into settings.json
  // as if a sysop had chosen them. The first board to use this had
  // maxNodes: 8 pinned that way, so raising the door's default to 255 would
  // never have reached it.
  it('sends only what the sysop changed, not the defaults they left alone', async () => {
    const user = userEvent.setup();
    renderForm();

    const server = await screen.findByLabelText('Server') as HTMLInputElement;
    await user.clear(server);
    await user.type(server, 'wall.uprough.net');

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled(), { timeout: 3000 });
    const [, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(values)).toEqual(['server']);
    expect(values.port).toBeUndefined();
  });

  // Empire doors declare dozens of fields (Bulls: toggles, 39 masks, join
  // settings). One flat wall is unusable, so consecutive settings sharing a
  // group render under one heading; ungrouped settings render bare.
  it('groups consecutive settings under one heading each', async () => {
    getDoorSettings.mockImplementationOnce(async () => ({
      success: true,
      data: {        manifest: {
          command: 'B',
          artSections: [{ label: 'Title logo' }],
          settings: [
            { key: 'dual_listing', label: 'Dual listing', type: 'choice', group: 'Listing',
              choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }], default: 'YES' },
            { key: 'cursor_keys', label: 'Cursor keys', type: 'choice', group: 'Listing',
              choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }], default: 'YES' },
            { key: 'conf_1_mask', label: 'Conference 1 bulletin mask', type: 'string', group: 'Conference access',
              default: '--------------------' },
            { key: 'plain', label: 'Plain', type: 'string', default: '' },
          ],
        },
        values: { dual_listing: 'YES', cursor_keys: 'NO', conf_1_mask: 'XXXX----------------', plain: '' },
        secretsSet: [],
      },
    } as any));
    renderForm();

    await waitFor(() => expect(screen.getByText('Dual listing')).toBeTruthy());
    // One heading per group, not one per setting.
    expect(screen.getAllByText('Listing')).toHaveLength(1);
    expect(screen.getAllByText('Conference access')).toHaveLength(1);
    expect(screen.getByText('Cursor keys')).toBeTruthy();
    // Both toggles render Yes/No radios - one pair each.
    expect(screen.getAllByRole('radio', { name: 'Yes' })).toHaveLength(2);
    expect(screen.getAllByRole('radio', { name: 'No' })).toHaveLength(2);
    expect(screen.getByLabelText('Conference 1 bulletin mask')).toBeTruthy();
    expect(screen.getByLabelText('Plain')).toBeTruthy();
    // Art notes where it lives instead of rendering a textarea for it.
    expect(screen.getByText(/drawn in/)).toBeTruthy();
  });

  // A setting a bespoke editor owns (Bulls masks live in the checkbox
  // matrix) stays a real setting - read, written, validated - but the
  // generic form skips it instead of drawing a second editor.
  it('hides settings a bespoke editor owns', async () => {
    getDoorSettings.mockImplementationOnce(async () => ({
      success: true,
      data: {
        manifest: {
          command: 'B',
          settings: [
            { key: 'dual_listing', label: 'Dual listing', type: 'choice', group: 'Listing',
              choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }], default: 'YES' },
            { key: 'conf_1_mask', label: 'Conference 1 bulletin mask', type: 'string',
              default: '--------------------', hidden: true },
          ],
        },
        values: { dual_listing: 'YES', conf_1_mask: 'XXXX----------------' },
        secretsSet: [],
      },
    } as any));
    renderForm();

    await waitFor(() => expect(screen.getByText('Dual listing')).toBeTruthy());
    expect(screen.queryByLabelText('Conference 1 bulletin mask')).toBeNull();
  });
});
