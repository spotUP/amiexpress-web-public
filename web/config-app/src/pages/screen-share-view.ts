/**
 * Which nodes can be pointed at a shared screen directory, and why the rest
 * cannot.
 *
 * The backend answers per node with what that node would lose and gain; this
 * folds those into sentences, because "blocked" with no explanation is worse
 * than no answer at all. Sharing redirects a node's WHOLE screen set, so the
 * sysop has to see what changes hands before agreeing to it.
 */

export interface ShareCheckShape {
  ok: boolean;
  reasons: string[];
  losing: string[];
  gaining: string[];
  nodeHasNoScreens: boolean;
}

export interface ShareSummary {
  canShare: number[];
  blocked: { id: number; reasons: string[] }[];
}

export function summariseShare(checks: Record<number, ShareCheckShape>): ShareSummary {
  const canShare: number[] = [];
  const blocked: { id: number; reasons: string[] }[] = [];

  for (const [key, check] of Object.entries(checks)) {
    const id = Number(key);
    if (check.ok) {
      canShare.push(id);
      continue;
    }

    const reasons = [
      ...check.reasons,
      ...check.losing.map(name => `would lose ${name}`),
      ...check.gaining.map(name => `would gain ${name}`),
    ];

    blocked.push({
      id,
      // Never an empty explanation: a node the backend refused for a reason it
      // did not spell out still has to say something true.
      reasons: reasons.length ? reasons : ['its screen set does not match the shared directory'],
    });
  }

  return { canShare: canShare.sort((a, b) => a - b), blocked: blocked.sort((a, b) => a.id - b.id) };
}
