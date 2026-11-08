/**
 * A door's text arrives as one JS char per byte (XIM readString decodes
 * latin1). A door that wrote AEW_CHARSET 'utf-8' sends UTF-8 in those bytes,
 * so before anything else reads the text (processRawText, the transport
 * encoder) the byte string has to become the characters the door meant.
 *
 * Lenient on purpose: a well-formed UTF-8 sequence becomes its code point,
 * and every other byte is kept as the latin1 character it already is. That
 * keeps 0x9B (CSI) and a door's latin1 art working even after the door has
 * opted in, and makes a malformed tail visible instead of dropping it.
 */
export function decodeDoorUtf8(bytes: string): string {
  let out = '';
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes.charCodeAt(i);
    let need = 0;
    let cp = 0;
    let min = 0;
    if (b0 >= 0xc2 && b0 <= 0xdf) { need = 1; cp = b0 & 0x1f; min = 0x80; }
    else if (b0 >= 0xe0 && b0 <= 0xef) { need = 2; cp = b0 & 0x0f; min = 0x800; }
    else if (b0 >= 0xf0 && b0 <= 0xf4) { need = 3; cp = b0 & 0x07; min = 0x10000; }
    if (need > 0 && i + need < n) {
      let ok = true;
      for (let k = 1; k <= need; k++) {
        const b = bytes.charCodeAt(i + k);
        if ((b & 0xc0) !== 0x80) { ok = false; break; }
        cp = (cp << 6) | (b & 0x3f);
      }
      if (ok && cp >= min && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
        out += String.fromCodePoint(cp);
        i += need + 1;
        continue;
      }
    }
    out += bytes[i];
    i++;
  }
  return out;
}
