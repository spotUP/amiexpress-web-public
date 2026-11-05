/**
 * The board's screen, shown to an artist who has not redrawn it yet.
 *
 * An artist owns a theme and may write inside it and nowhere else - the server
 * has enforced that since the sandbox landed. The editor did not know: it gave
 * every caller the full set of tools on the board's own art, took the drawing,
 * and answered "Outside your theme: Screens/BULL.TXT" when they pressed Save.
 * The work was already done by then.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ScreenEditor } from '../src/components/ScreenEditor';
import { createSurface, type EditorSurface } from '../src/pages/screen-editor-state';

// The MCI picker asks the board which codes exist; the editor itself needs
// nothing from the network.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// The page's own factory, so the editor under test is holding what it holds
// in the admin - an SDK editor state, not a hand-built object.
const surface = (): EditorSurface => ({
  ...createSurface([[{ char: 'H', fg: 7, bg: 0 }, { char: 'I', fg: 7, bg: 0 }]]),
  tool: 'text',
});

describe('a screen that is not the artist\'s to change', () => {
  it('offers no way to change it', () => {
    render(<ScreenEditor surface={surface()} readOnly />, { wrapper });

    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.queryByText('Redo')).toBeNull();
    expect(screen.queryByText('Insert a code')).toBeNull();
    // The tools and the palette go with them.
    expect(screen.queryByLabelText(/^Draw with/)).toBeNull();
    expect(screen.queryByLabelText(/foreground$/)).toBeNull();
  });

  it('cannot be typed into', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ScreenEditor surface={surface()} readOnly onChange={onChange} />, { wrapper });

    await user.keyboard('A');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still shows the art, and still hands it over', () => {
    const onDownload = vi.fn();
    render(<ScreenEditor surface={surface()} readOnly filePath="Screens/BULL.TXT" onDownload={onDownload} />, { wrapper });

    expect(screen.getByTestId('canvas-viewport')).toBeTruthy();
    expect(screen.getByText('Download')).toBeTruthy();
  });

  it('says Close, because there is nothing to cancel', () => {
    render(<ScreenEditor surface={surface()} readOnly onCancel={vi.fn()} />, { wrapper });

    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel editing')).toBeNull();
  });
});

describe('a screen the artist owns', () => {
  it('is the editor the sysop has always had', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ScreenEditor surface={surface()} onChange={onChange} onSave={vi.fn()} onCancel={vi.fn()} />, { wrapper });

    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Insert a code')).toBeTruthy();
    expect(screen.getByLabelText('Cancel editing')).toBeTruthy();

    await user.keyboard('A');
    expect(onChange).toHaveBeenCalled();
  });
});
