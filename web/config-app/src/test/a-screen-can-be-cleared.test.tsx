/**
 * The ANSI editor had no way to start over short of deleting cells by hand.
 * Clear screen blanks every cell, keeps the screen's size, and one undo
 * brings the art back.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ScreenEditor } from '../components/ScreenEditor';
import {
  blankCanvas,
  clearScreen,
  createSurface,
  undo,
  type EditorSurface,
} from '../pages/screen-editor-state';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function drawn(): EditorSurface {
  const canvas = blankCanvas();
  canvas[0][0] = { ...canvas[0][0], char: 'A' };
  canvas[canvas.length - 1][5] = { ...canvas[canvas.length - 1][5], char: 'Z' };
  return createSurface(canvas);
}

function text(surface: EditorSurface): string {
  return surface.canvas.map((row) => row.map((cell) => cell.char).join('')).join('\n');
}

describe('clearing a screen', () => {
  it('blanks every cell, keeps the size, and one undo puts the art back', () => {
    const before = drawn();
    const rows = before.canvas.length;
    const original = text(before);

    const cleared = clearScreen(before);
    const canvas = cleared.canvas;
    expect(canvas.length).toBe(rows);
    expect(canvas.every((row) => row.every((cell) => cell.char === ' '))).toBe(true);

    expect(text(undo(cleared))).toBe(original);
  });

  it('is a button in the ANSI editor', () => {
    let latest: EditorSurface | null = null;
    render(<ScreenEditor surface={drawn()} onChange={(next) => { latest = next; }} onSave={() => {}} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Clear screen/ }));
    expect(latest).not.toBeNull();
    expect(text(latest!).trim()).toBe('');
  });
});
