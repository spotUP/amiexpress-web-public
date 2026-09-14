/**
 * The login sequence page renders the board's answer, not `undefined`.
 *
 * Sysop, 2026-09-14, on a white page:
 *   "login sequence fails ... TypeError: Cannot read properties of undefined
 *    (reading 'map')"
 *
 * `apiClient.request()` returns the WHOLE envelope, so `apiClient.get<T>`
 * answers `{ data: ApiResponse<T> }` and the payload is one level further in.
 * This page typed the generic as the PAYLOAD, so `data.steps` was undefined,
 * `setSteps(undefined)` put it into state, and the next render died on
 * `steps.map`. The generic ASSERTS the shape, so nothing type-checked it -
 * which is why this has to be a test and cannot be a type.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const step = {
  screen: 'BULL.TXT', resolvesTo: 'Node1/BULL.TXT', exists: true,
  items: [{ code: 'SS', target: 'Screens/bull1', pause: true }],
};

/** The real shape: success/data/timestamp, with the payload inside `data`. */
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn(() => envelope({ steps: [step], available: [{ target: 'Screens/bull2', bytes: 100 }] }));
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { LoginSequencePage } from '../pages/LoginSequencePage';

beforeEach(() => fetchMock.mockClear());

describe('the login sequence page', () => {
  it('reads the payload out of the envelope and renders the steps', async () => {
    render(<LoginSequencePage />);
    // The screen's own name proves the payload was unwrapped: before the fix
    // this render threw on steps.map and nothing reached the page at all.
    // The step's own include reaching the page is the proof: it can only be
    // rendered from `steps`, which was `undefined` before the fix.
    await waitFor(() => expect(screen.getByText('Screens/bull1')).toBeInTheDocument());
  });

  it('says so instead of white-screening when the answer carries no steps', async () => {
    fetchMock.mockImplementationOnce(() => envelope({ available: [] }) as never);
    render(<LoginSequencePage />);
    await waitFor(() =>
      expect(screen.getByText(/did not return a login sequence/i)).toBeInTheDocument());
  });
});
