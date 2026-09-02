/**
 * Door announcements - the SDK's front door to the board's webhooks.
 *
 * The board already carries the whole webhook machinery: a `webhooks` table,
 * per-trigger and per-door subscriptions, a PII policy, Discord and Slack
 * formatting (web/backend/src/services/webhook.service.ts), and a bridge from
 * doors to it - `bbs.emitCustomEvent(type, message, data)`, which reaches
 * LiveChat and, for the right event types, the webhooks
 * (web/backend/src/services/bbs-event-emitter.ts).
 *
 * What was missing is anything that TELLS a door author this exists. Four
 * doors out of forty used the bridge, each with its own guard, its own event
 * names and its own message wording, and one door (dopewars) skipped the board
 * entirely and POSTed to a Discord URL of its own - which means no sysop
 * control, no PII policy, and no per-door filter.
 *
 * So this is deliberately small: a typed announcer every door gets on its
 * context, with the four things a door actually has to say.
 *
 *   ctx.announce.opened('UNO table #1 is open', { table: 1, seats: '1/4' });
 *   ctx.announce.started('UNO at table #1 has begun', { players: 2 });
 *   ctx.announce.finished('spot won UNO at table #1', { winner: 'spot' });
 *   ctx.announce.score(12345, { level: 300, grade: 'S9' });
 *
 * Nothing here throws: a door that announces into a host without the bridge
 * (an older backend, a test harness, a door run from a script) carries on
 * playing. An announcement is never worth a crash.
 */

/** The shape this needs from the host - `session.bbs`, or anything like it. */
export interface AnnounceHost {
  emitCustomEvent?: (eventType: string, message: string, data?: Record<string, unknown>) => void;
}

/**
 * Event types the board routes to webhooks. These strings are a CONTRACT with
 * web/backend/src/services/bbs-event-emitter.ts, which decides from them
 * whether an event is a score or an announcement; changing one here without
 * changing it there leaves the event in LiveChat and out of Discord.
 */
export const ANNOUNCE_EVENT_TYPES = {
  /** Something is open to join, and saying so is the point. */
  opened: 'door_opened',
  /** It has begun - useful for "too late to join". */
  started: 'door_started',
  /** It is over, with a winner or a result. */
  finished: 'match_result',
  /** A score worth publishing. */
  score: 'score',
} as const;

export interface DoorAnnouncer {
  opened(message: string, data?: Record<string, unknown>): void;
  started(message: string, data?: Record<string, unknown>): void;
  finished(message: string, data?: Record<string, unknown>): void;
  score(score: number, data?: Record<string, unknown>): void;
  /** Anything else. Reaches LiveChat; reaches webhooks only if the board maps it. */
  custom(eventType: string, message: string, data?: Record<string, unknown>): void;
  /** False when the host cannot carry announcements, for a door that wants to know. */
  readonly available: boolean;
}

/**
 * Build an announcer over a host that may or may not be able to carry one.
 *
 * `host` is normally `ctx.bbs`. A door does not have to call this: the SDK
 * puts an announcer on every context (see core/Door.ts createContext).
 */
export function createAnnouncer(host: AnnounceHost | undefined | null): DoorAnnouncer {
  const emit = (eventType: string, message: string, data?: Record<string, unknown>): void => {
    if (typeof host?.emitCustomEvent !== 'function') return;
    try {
      host.emitCustomEvent(eventType, message, data);
    } catch {
      // An announcement is never worth a crash: the game carries on.
    }
  };

  return {
    available: typeof host?.emitCustomEvent === 'function',
    opened: (message, data) => emit(ANNOUNCE_EVENT_TYPES.opened, message, data),
    started: (message, data) => emit(ANNOUNCE_EVENT_TYPES.started, message, data),
    finished: (message, data) => emit(ANNOUNCE_EVENT_TYPES.finished, message, data),
    score: (score, data) => emit(
      ANNOUNCE_EVENT_TYPES.score,
      `scored ${score.toLocaleString('en-GB')}`,
      { ...data, score },
    ),
    custom: (eventType, message, data) => emit(eventType, message, data),
  };
}
