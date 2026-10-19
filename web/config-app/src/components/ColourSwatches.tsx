/**
 * A row of colour swatches: the palette picker the ANSI screen editor and
 * the .tti editor share. One component, so a swatch looks and is named the
 * same in both ("Red foreground"), and is chosen the same way.
 */
import type { ReactNode } from 'react';
import { ANSI_COLOR_NAMES, ANSI_PALETTE } from '../utils/ansi-palette';

export interface ColourSwatchesProps {
  /** How many of the palette's colours to offer, from colour 0. */
  count: number;
  /** Which pen these swatches set: part of every swatch's name. */
  role: 'foreground' | 'background';
  selected: number;
  onPick: (index: number) => void;
  /** Colour names by index; the ANSI names unless the editor has its own. */
  names?: readonly string[];
  /** A tooltip per swatch, such as its shortcut or why it is off. */
  titleFor?: (index: number) => string | undefined;
  /** A swatch that cannot be picked here. */
  disabledFor?: (index: number) => boolean;
  /** Said after the swatches, such as how many pens the board has. */
  children?: ReactNode;
}

/*
 * A SWATCH CANNOT BE FILLED - the fill is the colour being chosen - so it
 * takes an outline instead, in the neutral ink rather than the accent, so
 * the mark reads against all sixteen.
 */
const selectedSwatch = (on: boolean) =>
  on
    ? 'border-content-primary ring-1 ring-content-primary'
    : 'border-border';

export function ColourSwatches({
  count, role, selected, onPick, names = ANSI_COLOR_NAMES, titleFor, disabledFor, children,
}: ColourSwatchesProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {ANSI_PALETTE.slice(0, count).map((color, index) => (
        <button
          key={`${role}-${index}`}
          type="button"
          aria-label={`${names[index]} ${role}`}
          title={titleFor?.(index)}
          aria-pressed={selected === index}
          disabled={disabledFor?.(index)}
          className={`w-5 h-5 border ${selectedSwatch(selected === index)} disabled:opacity-40`}
          style={{ backgroundColor: color }}
          onClick={() => onPick(index)}
        />
      ))}
      {children}
    </div>
  );
}
