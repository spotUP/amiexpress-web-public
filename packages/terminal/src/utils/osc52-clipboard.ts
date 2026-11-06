/**
 * OSC 52 "set clipboard": ESC ] 52 ; <selection> ; <base64 UTF-8> BEL.
 * xterm hands the handler the part after "52;" - "<selection>;<data>".
 * A door (blessed apps own the mouse, so the browser's own selection never
 * happens) uses it to put text on the user's clipboard.
 */

/** The text to copy, or null for a query ("?"), an empty/clear payload or bad base64. */
export function decodeOsc52(payload: string): string | null {
  const sep = payload.indexOf(';');
  if (sep < 0) return null;
  const data = payload.slice(sep + 1);
  if (data === '' || data === '?') return null;
  try {
    const bin = atob(data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}
