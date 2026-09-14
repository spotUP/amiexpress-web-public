import { PetsciiGlyph } from '@amiexpress/terminal';
import type { PetsciiBrush } from '@amiexpress/bbs-door-sdk/petscii';

/**
 * The character set, as Petmate puts it: the primary surface, on the left.
 *
 * A PETSCII artist does not choose a character from a dropdown - they look at
 * the ROM and point at the shape they want. All 128 codes of the current bank
 * are here at once, drawn through `PetsciiGlyph` so a swatch and the art
 * agree about every glyph, reverse included.
 *
 * The 16 colours are the VIC palette and arrive as CSS colours from the
 * caller, which is why they are inline styles rather than token classes: a
 * C64's red is the machine's, not the admin theme's, and a theme change must
 * never move it.
 */
export interface PetsciiCharsetBrowserProps {
  brush: PetsciiBrush;
  bank: 0 | 1;
  /** The screen's background, so a swatch sits on the ground it will land on. */
  background: string;
  /** The 16 VIC colours, as CSS colours, indexed by colour number. */
  palette: readonly string[];
  onBrush: (brush: PetsciiBrush) => void;
  onBank: (bank: 0 | 1) => void;
  disabled?: boolean;
}

/** 128 codes per bank; the upper 128 are the reverse variants of the same shapes. */
const CODES = Array.from({ length: 128 }, (_, code) => code);

export function PetsciiCharsetBrowser({
  brush, bank, background, palette, onBrush, onBank, disabled = false,
}: PetsciiCharsetBrowserProps) {
  const ink = palette[brush.color & 0x0f] ?? '#ffffff';

  return (
    <div data-testid="petscii-charset-browser" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-content-secondary">
        <div className="flex items-center gap-1">
          <span>Character set</span>
          {/* Full English, because "RVS" and "UC/GFX" are the C64's own
              abbreviations and the label rule has no exemption for them. */}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={bank === 0}
            className={`px-2 py-1 border ${bank === 0 ? 'border-border-strong text-content-primary' : 'border-border'}`}
            onClick={() => onBank(0)}
          >
            Uppercase and graphics
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={bank === 1}
            className={`px-2 py-1 border ${bank === 1 ? 'border-border-strong text-content-primary' : 'border-border'}`}
            onClick={() => onBank(1)}
          >
            Lowercase and uppercase
          </button>
        </div>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={brush.reverse}
            disabled={disabled}
            onChange={event => onBrush({ ...brush, reverse: event.target.checked })}
          />
          Reverse
        </label>
      </div>

      <div
        className="grid gap-px border border-border p-1"
        style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', background }}
        role="group"
        aria-label="Character set"
      >
        {CODES.map(code => {
          const selected = (brush.screenCode & 0x7f) === code;
          return (
            <button
              key={code}
              type="button"
              disabled={disabled}
              aria-label={`Character ${code}`}
              aria-pressed={selected}
              className={selected ? 'ring-1 ring-accent' : undefined}
              onClick={() => onBrush({ ...brush, screenCode: code })}
            >
              <PetsciiGlyph
                screenCode={code}
                bank={bank}
                color={ink}
                background={background}
                reverse={brush.reverse}
                size={16}
              />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-content-secondary">Colour</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Colour">
          {palette.map((colour, index) => (
            <button
              key={index}
              type="button"
              disabled={disabled}
              aria-label={`Colour ${index}`}
              aria-pressed={(brush.color & 0x0f) === index}
              className={`h-5 w-5 border ${(brush.color & 0x0f) === index ? 'border-border-strong' : 'border-border'}`}
              style={{ background: colour }}
              onClick={() => onBrush({ ...brush, color: index })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
