/**
 * The two rules a C64 BBS imposes, enforced rather than suggested.
 *
 * "petscii used in c64 bbs:es have limitations that our petscii editor doesnt
 * enforce, only lowercase characters are allowed and only black background",
 * "this should apply bbs wide", and then, deciding it after a round of
 * advisory-only aids: "the lowercase and bg petscii rules should be enforced"
 * / "dont let the user pick bg color and remove the characters not allowed"
 * (sysop, 2026-09-14).
 *
 * These tests pin the ENFORCEMENT, not the wording of a warning: a surface
 * that arrives outside the rules comes back inside them, and the two controls
 * that could take it back out are gone from the editor.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  blankSurface, conformToBoard, setBackground, setCharsetBank,
  BOARD_BACKGROUND, BOARD_CHARSET_BANK,
} from '@amiexpress/bbs-door-sdk/petscii';
import { PetsciiScreenEditor } from '../components/PetsciiScreenEditor';

describe('the editor holds the board rules', () => {
  it('puts an uppercase-set screen back on the lowercase set', () => {
    const wrong = setCharsetBank(blankSurface(), 0);
    expect(conformToBoard(wrong).charsetBank).toBe(BOARD_CHARSET_BANK);
  });

  it('puts a coloured background back to black, and the border with it', () => {
    const wrong = setBackground(blankSurface(), 6);
    const fixed = conformToBoard(wrong);
    expect(fixed.background).toBe(BOARD_BACKGROUND);
    // A C64 ties the border to the background, so a rule for one is a rule for both.
    expect(fixed.border).toBe(BOARD_BACKGROUND);
  });

  it('leaves a conforming screen untouched, art and all', () => {
    // blankSurface() is a C64 at power-on, which is the uppercase set - that is
    // the machine's truth and PetsciiMachine still needs it. The board's
    // starting point is that surface already conformed.
    const fine = conformToBoard(blankSurface());
    expect(conformToBoard(fine)).toBe(fine);
  });

  it('offers the artist no background colour to pick', () => {
    render(<PetsciiScreenEditor content="" />);
    // The strip of 16 VIC swatches that used to set the ground is gone.
    expect(screen.queryByRole('group', { name: 'Background and border' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Background 6' })).toBeNull();
    // ...and the board's actual ground is stated, so it does not read as missing.
    expect(screen.getByTestId('petscii-background-fixed')).toBeInTheDocument();
  });

  it('offers the artist no second character set', () => {
    render(<PetsciiScreenEditor content="" />);
    expect(screen.queryByRole('button', { name: 'Uppercase and graphics' })).toBeNull();
  });

  it('still lets the artist pick an ink colour - only the ground is fixed', () => {
    render(<PetsciiScreenEditor content="" />);
    expect(screen.getByRole('button', { name: 'Colour 6' })).toBeInTheDocument();
  });
});
