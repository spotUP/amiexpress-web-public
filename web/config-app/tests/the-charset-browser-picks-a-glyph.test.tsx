/**
 * The character set is the surface an artist points at.
 *
 * Petmate's arrangement, and the sysop asked for Petmate's: all 128 codes of
 * the current bank at once, not a dropdown. What these tests pin is what the
 * browser REPORTS - the brush is owned by the editor, and a browser that
 * quietly changed a colour while the artist picked a shape would be a second
 * place brush state lives.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PetsciiCharsetBrowser } from '../src/components/PetsciiCharsetBrowser';
import type { PetsciiBrush } from '@amiexpress/bbs-door-sdk/petscii';

const PALETTE = Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}`);
const BRUSH: PetsciiBrush = { screenCode: 0x20, color: 1, reverse: false };

function renderBrowser(overrides: Partial<Parameters<typeof PetsciiCharsetBrowser>[0]> = {}) {
  const onBrush = vi.fn();
  render(
    <PetsciiCharsetBrowser
      brush={BRUSH}
      bank={1}
      background="#000000"
      palette={PALETTE}
      onBrush={onBrush}
      {...overrides}
    />,
  );
  return { onBrush };
}

describe('the charset browser picks a glyph', () => {
  it('reports the screen code and keeps the colour', async () => {
    const { onBrush } = renderBrowser();
    await userEvent.click(screen.getByRole('button', { name: 'Character 65' }));
    expect(onBrush).toHaveBeenCalledWith({ screenCode: 65, color: 1, reverse: false });
  });

  it('reports a colour and keeps the glyph', async () => {
    const { onBrush } = renderBrowser({ brush: { screenCode: 0x41, color: 1, reverse: false } });
    await userEvent.click(screen.getByRole('button', { name: 'Colour 7' }));
    expect(onBrush).toHaveBeenCalledWith({ screenCode: 0x41, color: 7, reverse: false });
  });

  it('offers all 128 codes of a bank, not a chosen few', () => {
    renderBrowser();
    expect(screen.getByRole('button', { name: 'Character 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Character 127' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Character 128' })).toBeNull();
  });

  it('offers no way to reach the characters a C64 BBS cannot draw', () => {
    // "remove the characters not allowed" (sysop, 2026-09-14). The board runs
    // the lowercase set; the uppercase/graphics bank is not a choice any more,
    // so the switch that reached it is gone rather than merely disabled.
    renderBrowser();
    expect(screen.queryByRole('button', { name: 'Uppercase and graphics' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lowercase and uppercase' })).toBeNull();
  });

  it('says Reverse in full, not RVS', () => {
    // The C64's own abbreviation is not an exemption from the label rule.
    renderBrowser();
    expect(screen.getByLabelText('Reverse')).toBeInTheDocument();
    expect(screen.queryByText('RVS')).toBeNull();
  });

  it('reports reverse as part of the brush', async () => {
    const { onBrush } = renderBrowser();
    await userEvent.click(screen.getByLabelText('Reverse'));
    expect(onBrush).toHaveBeenCalledWith({ screenCode: 0x20, color: 1, reverse: true });
  });

  it('takes no input at all when the art is not the artist\'s', async () => {
    const { onBrush } = renderBrowser({ disabled: true });
    await userEvent.click(screen.getByRole('button', { name: 'Character 65' }));
    expect(onBrush).not.toHaveBeenCalled();
  });
});
