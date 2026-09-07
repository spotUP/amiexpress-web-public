/**
 * The new-user questionnaire, edited from the admin.
 *
 * It ran on this board until 2026-04-24, when the scripts were parked to
 * switch it off; the sysop found it gone and asked for it back, editable. One
 * text here reaches every node and every baud, and only a sysop may change it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const state = {
  enabled: true, text: 'What is FLT an abbrevation of: ~\nWelcome aboard.\n',
  nodes: 41, liveFiles: 287, parkedFiles: 0, source: 'Node0/script115200',
};

const calls: { method: string; url: string; body?: string }[] = [];
const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ method: init?.method ?? 'GET', url, body: init?.body as string | undefined });
  if (init?.method === 'PUT') return envelope({ ...state, files: 287 }, 'Questionnaire written to 287 files');
  return envelope(state);
}));

let secLevel = 255;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel }),
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { QuestionnairePage } from '../pages/QuestionnairePage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the questionnaire page', () => {
  beforeEach(() => { calls.length = 0; secLevel = 255; });

  it('shows the board state and the text, and counts the questions', async () => {
    render(<QuestionnairePage />, { wrapper });

    expect(await screen.findByTestId('questionnaire-state')).toHaveTextContent('On - 287 files across 41 nodes');
    expect(await screen.findByDisplayValue(/What is FLT/)).toBeTruthy();
    expect(screen.getByText(/1 question$/)).toBeTruthy();
  });

  it('a sysop edits it and the save sends the whole text to every node', async () => {
    const user = userEvent.setup();
    render(<QuestionnairePage />, { wrapper });
    const box = await screen.findByLabelText(/Questionnaire/);
    // Disabled until the board's text has arrived; typing before that is
    // typing into nothing.
    await waitFor(() => expect(box).not.toBeDisabled());

    await user.clear(box);
    await user.type(box, 'What is your handle: ~');
    await user.click(screen.getByRole('button', { name: /Save to every node/ }));

    await waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true));
    const put = calls.find(c => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/questionnaire$/);
    expect(JSON.parse(put.body!)).toEqual({ text: 'What is your handle: ~' });
  });

  it('a co-sysop can read it and cannot change it', async () => {
    secLevel = 100;
    render(<QuestionnairePage />, { wrapper });

    const box = await screen.findByLabelText(/Questionnaire/);
    expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save to every node/ })).toBeDisabled();
    expect(screen.getByText(/Only a sysop can change/)).toBeTruthy();
  });
});
