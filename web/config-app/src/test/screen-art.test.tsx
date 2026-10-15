/**
 * The read-only view is the editor's renderer, not a second one.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ScreenArt } from '../components/ScreenArt';
import { bytesToBase64 } from '../pages/screen-bytes';

describe('a screen rendered read-only', () => {
  it('draws the art on the same canvas the editor uses', async () => {
    const content = bytesToBase64(new TextEncoder().encode('\x1b[31mHI'));

    render(<ScreenArt content={content} />);

    await waitFor(() => expect(screen.getByTestId('ansi-canvas')).toBeTruthy());
  });

  it('says so when the file is empty, rather than showing a blank box', async () => {
    render(<ScreenArt content={bytesToBase64(new Uint8Array())} />);

    await waitFor(() => expect(screen.getByText(/draws nothing/i)).toBeTruthy());
  });
});
