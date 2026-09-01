/**
 * A door's own settings, rendered from what the door declares.
 *
 * The admin could edit six fields and a raw tooltype list per door. The only
 * door that ever looked configurable was GWall, because GlobalWallPage.tsx was
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
      { key: 'announce', label: 'Announce joins', type: 'boolean', default: true },
      { key: 'style', label: 'Style', type: 'choice', default: '4',
        choices: [{ value: '1', label: 'One' }, { value: '4', label: 'Four' }] },
      { key: 'password', label: 'Password', type: 'string', secret: true },
    ],
  },
  values: { server: 'bbs.example.org', port: 6667, announce: true, style: '4', password: '' },
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
    expect(screen.getByLabelText('Style')).toBeTruthy();
    expect(screen.getByText('Where the door connects')).toBeTruthy();
  });

  it('sends what the sysop changed, keyed the way the door declared it', async () => {
    const user = userEvent.setup();
    renderForm();

    const server = await screen.findByLabelText('Server') as HTMLInputElement;
    await user.clear(server);
    await user.type(server, 'wall.uprough.net');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    const [command, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(command).toBe('TESTDOOR');
    expect(values.server).toBe('wall.uprough.net');
  });

  it('offers only the choices the door declared', async () => {
    renderForm();

    const style = await screen.findByLabelText('Style') as HTMLSelectElement;
    expect([...style.options].map(o => o.value)).toEqual(['1', '4']);
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
  // as if the sysop had chosen them. The first board to use this had
  // maxNodes: 8 pinned that way, so raising the door's default to 255 would
  // never have reached it.
  it('sends only what the sysop changed, not the defaults they left alone', async () => {
    const user = userEvent.setup();
    renderForm();

    const server = await screen.findByLabelText('Server') as HTMLInputElement;
    await user.clear(server);
    await user.type(server, 'wall.uprough.net');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(saveDoorSettings).toHaveBeenCalled());
    const [, values] = saveDoorSettings.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(Object.keys(values)).toEqual(['server']);
    expect(values.port).toBeUndefined();
  });
});
