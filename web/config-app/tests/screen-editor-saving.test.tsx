/**
 * A save in flight is visible.
 *
 * The editor's Save button used to answer a click with silence while the PUT
 * plus refetch plus decode ran, and "super slow to update" was the only
 * possible reading. While `saving` the button disables and says so.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ScreenEditor } from '../src/components/ScreenEditor';
import { blankCanvas, createSurface } from '../src/pages/screen-editor-state';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the editor while a save is in flight', () => {
  it('disables Save and says Saving…', () => {
    render(<ScreenEditor surface={createSurface(blankCanvas())} onSave={() => {}} saving />, { wrapper });

    const button = screen.getByRole('button', { name: /saving/i });
    expect(button).toBeDisabled();
  });

  it('offers an enabled Save when idle', () => {
    render(<ScreenEditor surface={createSurface(blankCanvas())} onSave={() => {}} />, { wrapper });

    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
  });
});
