/**
 * "Upload a drawing" - the one control, for every editor that shows art.
 *
 * Sysop, 2026-09-15: "all screen and door art editors needs upload buttons",
 * "for all supported formats". Most ANSI artists draw in PabloDraw or
 * Moebius and bring the file in; an editor that can only edit what the
 * browser can draw is an editor they cannot use.
 *
 * It existed in two dialogs as two inline copies (and `readAsBase64` in
 * THREE), while the door-art dialog and the bulletin editor had none at all.
 * This is that control, once, so a host adds an upload by rendering it rather
 * than by writing a file input and a FileReader again.
 *
 * The host keeps its own write path - a screen, a door's config section and a
 * bulletin are written by three different endpoints with three different
 * refusals - so this hands over bytes and stays out of the way.
 */
import { useRef } from 'react';
import { Upload } from 'lucide-react';

import { readAsBase64 } from '../pages/screen-bytes';

/**
 * Every format the board can serve a caller.
 *
 * `.ans`/`.txt`/`.asc` is ANSI or plain text, `.rip` a vector program for a
 * RIP terminal, `.seq` PETSCII for a C64, `.ttx`/`.tti` teletext. `.svg` is
 * not a screen format - it is what an artist exports from Illustrator, and
 * the board converts it rather than refusing bytes it could have used.
 *
 * ONE list, because an upload that accepts fewer formats than the board
 * serves is how a theme ends up with no `.seq` and every C64 caller seeing
 * the board's art instead of the artist's.
 */
export const ART_UPLOAD_ACCEPT = '.ans,.txt,.asc,.rip,.seq,.ttx,.tti,.svg,image/svg+xml';

/** ANSI-only slots: a door's art block is ANSI inside its own config file. */
export const ANSI_UPLOAD_ACCEPT = '.ans,.txt,.asc';

export interface ArtUploadButtonProps {
  /** The picked file, as base64 bytes, plus the file itself for its name. */
  onPick: (base64: string, file: File) => void | Promise<void>;
  /** Defaults to every format the board serves. */
  accept?: string;
  label?: string;
  disabled?: boolean;
  /** Marks the input for tests that drive a specific host's upload. */
  testId?: string;
}

export function ArtUploadButton({
  onPick,
  accept = ART_UPLOAD_ACCEPT,
  label = 'Upload a drawing',
  disabled = false,
  testId,
}: ArtUploadButtonProps) {
  const input = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 underline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Upload size={14} /> {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={label}
        data-testid={testId}
        className="hidden"
        onChange={async event => {
          const chosen = event.target.files?.[0];
          // Cleared BEFORE the await: picking the same file twice in a row is
          // a real thing an artist does after a failed save, and a value left
          // in place means the second pick fires no change event at all.
          event.target.value = '';
          if (!chosen) return;
          await onPick(await readAsBase64(chosen), chosen);
        }}
      />
    </>
  );
}
