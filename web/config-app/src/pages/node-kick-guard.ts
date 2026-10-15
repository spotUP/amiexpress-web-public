/**
 * Kick guard for the Nodes page: every kick confirms, service accounts shout.
 *
 * The sysop kicked discord-bridge (the WHIP feed bridge - the board's ear
 * in Discord) with one stray click: the Kick button fired POST
 * /api/nodes/:id/kick with no confirm at all. A kick is destructive and
 * one click away, so it always asks. When the target looks like a service
 * account the dialog says so - kicking a bridge silences a feed, not a
 * caller, and reconnecting it is a server-side job.
 */

export interface KickTarget {
  nodeId: number;
  username?: string;
}

/** Well-known service accounts plus the naming shape bridges/bots use. */
const SERVICE_NAMES = new Set(['discord-bridge']);

export function isServiceAccount(username: string | undefined | null): boolean {
  const name = (username ?? '').trim().toLowerCase();
  if (!name) return false;
  if (SERVICE_NAMES.has(name)) return true;
  return name.endsWith('-bridge') || name.endsWith('-bot') || name.startsWith('bot-');
}

export interface KickConfirm {
  title: string;
  message: string;
  confirmText: string;
  type: 'danger' | 'warning';
}

export function kickConfirmFor(node: KickTarget): KickConfirm {
  const who = node.username?.trim() ? `Node ${node.nodeId} (${node.username.trim()})` : `Node ${node.nodeId}`;
  if (isServiceAccount(node.username)) {
    return {
      title: 'Kick a service account?',
      message:
        `${who} looks like a service account, not a caller - kicking it drops ` +
        `a bridge or feed the board depends on (the Discord feed goes silent, ` +
        `WHIP events stop arriving). Reconnecting it is a server-side job, not a re-login.`,
      confirmText: 'Kick anyway',
      type: 'danger',
    };
  }
  return {
    title: 'Kick caller?',
    message: `Force-disconnect ${who}? They will have to log back in.`,
    confirmText: 'Kick',
    type: 'warning',
  };
}
