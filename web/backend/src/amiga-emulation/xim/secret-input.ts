/**
 * Whether a door is reading a secret right now (the W door's masked password
 * entry), so the input traces can say how many bytes arrived and not which.
 *
 * The host cannot know a door is reading a password: ui_input's mask is
 * door-side only. The W door says so (AEW_USERFIELD `SECRET 1` before the
 * entry, `SECRET 0` after) and the three keystroke traces ask here
 * (door-input-router.ts, AmigaDoorSession.ts onDoorInput, xim/io.ts
 * queueInput). Keyed by the BBS session object all three hold; cleared when
 * the door session ends.
 */
const secret = new WeakSet<object>();

export function setSecretInput(session: object | null | undefined, on: boolean): void {
  if (!session) return;
  if (on) secret.add(session); else secret.delete(session);
}

export function isSecretInput(session: object | null | undefined): boolean {
  return !!session && secret.has(session);
}

/** What a keystroke trace may say about `data`: its content, or only its size while a secret is typed. A mouse report (AEW_SCREEN MOUSE ON) is named, never printed: a hover is dozens a second. */
export function inputForTrace(session: object | null | undefined, data: string, render: (s: string) => string): string {
  return inputTraceText(isSecretInput(session), data, render);
}

/** The redaction itself, for a caller that already holds the secret flag (door-input-router asks the XIM protocol, not the session). */
export function inputTraceText(secret: boolean, data: string, render: (s: string) => string): string {
  return secret ? `<${data.length} bytes withheld>` : render(data.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '<mouse>'));
}

/** The TRACE_DOOR_INPUT line (socket-handlers traceDoorInput): the same redaction as the other two input traces. */
export function doorInputTraceLine(session: { nodeId?: number; petsciiMode?: boolean; currentDoorName?: unknown } | null | undefined, route: string, data: string): string {
  return `[DOOR-INPUT] route=${route} data=${inputForTrace(session, data, (s) => JSON.stringify(s))} node=${session?.nodeId}` +
    ` door=${String(session?.currentDoorName ?? '')} petscii=${session?.petsciiMode ? 'Y' : 'N'}`;
}
