/**
 * The DoorsPage edit-dialog harness, shared by the tests that open the Edit
 * dialog of one door and look at its .info tooltypes (W5, and the W doors
 * after it). One door row (GWall), a mocked API client whose `.info` is
 * whatever the test hands in, and a page renderer.
 *
 * Not a test file: no `.test` in the name, so vitest does not collect it.
 * `vi.mock` is hoisted in the test itself and delegates here:
 *
 *   const harness = await import('./door-edit-harness');
 *   vi.mock('../src/api/client', async () => (await import('./door-edit-harness')).apiClientMock());
 */

import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export interface TooltypeRow { key: string; value: string; commented: boolean; originalLine: string }

export const DOORS = [
  {
    id: 7, door_name: 'GWall', door_command: 'GWALL', door_type: 'BBSCMD',
    door_path: 'Doors/GWall/GWall', door_args: '', working_directory: '', priority: 'SAME',
    door_options: [], runtime_env: 'AMIGA_68K', min_security_level: 30,
    max_security_level: 255, required_flags: '', time_limit: 0, memory_limit: 0,
    title: 'GWall', description: 'Global wall', category: 'Comms',
    enabled: true, has_settings: false, created_at: new Date(), updated_at: new Date(),
  },
];

/** The tooltypes the mocked `.info` returns; a test sets them before rendering. */
export const state: { tooltypes: TooltypeRow[] } = { tooltypes: [] };

export const getInfoFile = vi.fn(async (_path: string) => ({ success: true, data: { tooltypes: state.tooltypes } }));
export const updateInfoFile = vi.fn(async (_path: string, _tooltypes: unknown) => ({ success: true, data: {} }));

export function apiClientMock() {
  return {
    apiClient: {
      getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
      getInfoFile: (path: string) => getInfoFile(path),
      updateInfoFile: (path: string, tooltypes: unknown) => updateInfoFile(path, tooltypes),
      getDoorSettings: vi.fn(async (_command: string) => ({
        success: true,
        data: { manifest: { command: 'GWALL', settings: [] }, values: {}, secretsSet: [] as string[] },
      })),
      saveDoorSettings: vi.fn(async (_command: string, _values: Record<string, unknown>) => ({ success: true, data: {} })),
      updateDoor: vi.fn(async (_id: number, _updates: unknown) => ({ success: true, data: {} })),
    },
  };
}

export function notificationMock() {
  return {
    useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
    NotificationProvider: ({ children }: { children: ReactNode }) => children,
  };
}

export async function renderPage() {
  const { DoorsPage } = await import('../src/pages/DoorsPage');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DoorsPage />
    </QueryClientProvider>
  );
}
