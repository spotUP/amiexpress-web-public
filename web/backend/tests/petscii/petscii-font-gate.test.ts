/**
 * Bug F (final review wave, true-petscii login/font pass): after a 'P'
 * (PETSCII) login, `ensurePetsciiTerminal` switches xterm to PetMe64, but
 * `login-success` unconditionally requests the user's saved font
 * preference, and the resulting `font-preference` (and sibling `set-font`)
 * handlers used to overwrite `term.options.fontFamily` unconditionally -
 * clobbering PetMe64 right after login even though the session stayed
 * 40x25. `resolveTerminalFontFamily` is the pure gate extracted from those
 * two handlers in BBSTerminal.tsx: it must always return the PetMe64 stack
 * while a PETSCII session is active, no matter what font was requested -
 * including a font the user explicitly just picked, since a simulated C64
 * has no business switching to an Amiga bitmap font mid-session.
 *
 * Imported straight from packages/terminal, same precedent as
 * petscii-overlay-state.test.ts (no React/DOM dependency in font-gate.ts).
 */
import {
  resolveTerminalFontFamily,
  PETSCII_FONT_FAMILY,
} from '../../../../packages/terminal/src/petscii/font-gate';

describe('resolveTerminalFontFamily', () => {
  it('returns the requested font when no PETSCII session is active (normal login/font-preference path)', () => {
    const result = resolveTerminalFontFamily('TopazPlus_a1200, "Courier New", monospace', false);
    expect(result).toBe('TopazPlus_a1200, "Courier New", monospace');
  });

  it('keeps PetMe64 when a PETSCII session is active, even though a saved font-preference asked for something else', () => {
    const result = resolveTerminalFontFamily('TopazPlus_a1200, "Courier New", monospace', true);
    expect(result).toBe(PETSCII_FONT_FAMILY);
  });

  it('keeps PetMe64 during a PETSCII session even for a font the user just explicitly picked via set-font', () => {
    const result = resolveTerminalFontFamily('MicroKnightPlus, "Courier New", monospace', true);
    expect(result).toBe(PETSCII_FONT_FAMILY);
  });

  it('PETSCII_FONT_FAMILY matches the exact stack ensurePetsciiTerminal applies', () => {
    expect(PETSCII_FONT_FAMILY).toBe('PetMe64, "Courier New", monospace');
  });
});
