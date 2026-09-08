import { useMemo } from 'react';
import { PetsciiCanvas, PetsciiMachine } from '@amiexpress/terminal';

interface PetsciiScreenPreviewProps {
  /** The `.seq` file's own bytes, base64 as the preview route sends them. */
  content: string;
  /**
   * The wrapper's classes, because the canvas sizes itself to its PARENT.
   *
   * `PetsciiCanvas` measures the element it is mounted in and fits the 40x25
   * surface to it, so a gallery card that hands it a box with no height gets a
   * canvas with no height. The thumbnail passes `h-full w-full`.
   */
  className?: string;
}

/**
 * A `.seq` on a real 40x25 C64 surface.
 *
 * `packages/terminal` has carried `PetsciiCanvas` - the Colodore palette, the
 * two charset banks, the border - since the C64 work, and the config-app has
 * declared it as a dependency and imported it from nowhere. A PETSCII screen
 * shown on an xterm is not a preview of anything: the bytes are screen codes,
 * not characters, and the board's own terminal would draw them here.
 *
 * The machine is fed once, from bytes, and never from a string: a `.seq` is
 * BYTES, and a UTF-8 round trip turns every high-bit screen code into a
 * replacement character.
 */
export function PetsciiScreenPreview({ content, className }: PetsciiScreenPreviewProps) {
  const machine = useMemo(() => {
    const next = new PetsciiMachine();
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    next.feed(bytes);
    return next;
  }, [content]);

  return (
    <div data-testid="petscii-screen-preview" className={className}>
      <PetsciiCanvas machine={machine} cursorVisible={false} />
    </div>
  );
}
