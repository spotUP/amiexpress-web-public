/**
 * C64 first-keypress classification.
 *
 * Real C64s dialing in through a WiFi modem (WiModem232, 1541 Ultimate, etc.)
 * negotiate no telnet options, so TELOPT_TTYPE (telnet-server.ts) never
 * fires for them and session.terminalType stays 'unknown'. The connect
 * screen's "press any key" prompt doubles as a passive probe: PETSCII DEL
 * is $14 and shifted C64 letters arrive as $C1-$DA, while ASCII terminals
 * send BS $08 / DEL $7F / lowercase $61-$7A for the same physical keys.
 * This is the classic Image BBS/PCBoard-era detection trick - no question
 * asked, no round trip, just read the byte that was already coming.
 *
 * Reference: thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * §5 "How Existing Software Does It" - Image BBS 1.2a's "Press DELETE for
 * C/G mode" prompt.
 */

export type FirstKeyClass = 'petscii' | 'ascii' | 'ambiguous';

/**
 * Classify a caller's first keypress bytes. PETSCII DEL is $14 while ASCII
 * terminals send BS $08 or DEL $7F; C64 shifted letters arrive as $C1-$DA
 * while ASCII lowercase is $61-$7A. See file header for reference doc.
 */
export function classifyFirstKeypress(raw: Buffer): FirstKeyClass {
  for (const byte of raw) {
    if (byte === 0x14 || (byte >= 0xC1 && byte <= 0xDA)) return 'petscii';
    if (byte === 0x08 || byte === 0x7F || (byte >= 0x61 && byte <= 0x7A)) return 'ascii';
  }
  return 'ambiguous';
}
