/**
 * A FILE_ID drawn as the board shows it (sysop, 2026-09-29: "there are no
 * linebreaks in the file_id's, reference this project to see how they need
 * to be displayed" - amiexpress-doorserver's DizView): every line kept, in
 * the board's face, colour codes played rather than printed.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BoardText } from '../src/components/BoardText';
import { paletteColor } from '../src/utils/ansi-palette';

describe('BoardText', () => {
  it('keeps every line and every space of plain art', () => {
    const lines = ['   |\\_  _/\\__', '|  --   l a x i t y   p r e s e n t s   -- |'];
    const { container } = render(<BoardText lines={lines} />);
    const pre = container.querySelector('pre')!;
    expect(pre.textContent).toBe(lines.join('\n'));
    expect(pre.className).toContain('font-topaz');
    expect(pre.className).toContain('whitespace-pre');
  });

  it('plays colour codes instead of printing them', () => {
    const { container } = render(<BoardText lines={['\x1b[31mRED\x1b[0m plain', 'second']} />);
    const pre = container.querySelector('pre')!;
    expect(pre.textContent).not.toContain('\x1b');
    expect(pre.textContent).toContain('RED plain');
    expect(pre.textContent?.split('\n')).toHaveLength(2);
    const red = [...container.querySelectorAll('span')].find((s) => s.textContent === 'RED')!;
    expect(red.style.color).toBe(hexToRgb(paletteColor(1)));
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
