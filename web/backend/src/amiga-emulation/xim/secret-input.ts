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

/** What a keystroke trace may say about `data`: its content, or only its size while a secret is typed. */
export function inputForTrace(session: object | null | undefined, data: string, render: (s: string) => string): string {
  return isSecretInput(session) ? `<${data.length} bytes withheld>` : render(data);
}
