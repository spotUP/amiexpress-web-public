/**
 * A line from the board that is not part of the screen: "restarting in 30
 * seconds", "the sysop is disconnecting you".
 *
 * The board sends these as their own events - `system:notice` (the deploy's
 * restart countdown, services/restart-notice.service.ts) and `system-message`
 * (node-control-routes' kick line) - rather than as screen bytes, because a
 * door owns the screen and a line written into it lands wherever the door's
 * cursor is. A telnet or SSH caller has no browser, so the server's transport
 * adapter prints the line for them (transport-adapter.ts renderNotice). A web
 * caller had nothing: no listener existed, and a sysop in a door was dropped by
 * a deploy that had counted down for a full minute to nobody (2026-09-28, "i
 * was in a door now and the bbs restarted without warning").
 *
 * So the browser shows it here, over the terminal and outside it: the door's
 * screen underneath is untouched, and the caller reads the notice whatever the
 * door is drawing.
 */
import React, { useEffect } from 'react';

/** How long a notice stays up when nothing replaces it. */
export const NOTICE_SHOW_MS = 12_000;

/**
 * The text a notice event carries, or null when it carries none.
 *
 * Two shapes, as the server sends them: `system:notice` is
 * `{ kind, seconds, message }` and `system-message` is `{ text }` with its
 * own CRLFs around it. Anything else shows nothing rather than an empty bar.
 */
export function systemNoticeText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const { message, text } = payload as { message?: unknown; text?: unknown };
  const raw = typeof message === 'string' ? message : typeof text === 'string' ? text : '';
  // Strip colour and cursor sequences - this is a line of text, not a screen.
  const plain = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s+/g, ' ').trim();
  return plain || null;
}

export interface SystemNoticeProps {
  text: string;
  /** Called when the notice has been up for NOTICE_SHOW_MS. */
  onExpire: () => void;
}

const NOTICE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 200,
  padding: '6px 12px',
  // The board's warning colour, yellow on black - AnsiUtil.warning paints
  // the same notice yellow for a caller who is not in a door.
  backgroundColor: '#000000',
  color: '#ffff55',
  borderBottom: '1px solid #ffff55',
  textAlign: 'center',
  fontFamily: 'inherit',
  pointerEvents: 'none',
};

export function SystemNotice({ text, onExpire }: SystemNoticeProps) {
  // Restarted by every new text: each countdown step keeps the bar up.
  useEffect(() => {
    const timer = setTimeout(onExpire, NOTICE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [text, onExpire]);

  return (
    <div role="alert" style={NOTICE_STYLE}>
      {text}
    </div>
  );
}
