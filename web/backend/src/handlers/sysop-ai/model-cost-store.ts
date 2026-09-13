/**
 * WHAT EACH FREE MODEL COSTS, REMEMBERED ACROSS RESTARTS.
 *
 * The picker learns which free model answers fastest by measuring it - an
 * exponential moving average of the round trip, in `grumpy-sysop-bot.handler`.
 * That memory lived in a `Map` and nowhere else, and this board deployed
 * TWENTY-EIGHT times on the day it was written. Every deploy recreates the
 * container, so every deploy threw the measurements away and the picker went
 * back to treating an untried model as optimistically fast.
 *
 * Measured on the live board, 2026-09-08, over the models OpenRouter actually
 * offers it for free:
 *
 *     inclusionai/ling-3.0-flash-sante:free      0.99 s
 *     liquid/lfm-2.5-2.6b:free                   1.34 s
 *     nvidia/nemotron-3.5-lightning:free        21.42 s
 *
 * So the difference between remembering and forgetting is the difference
 * between a one-second reply and a twenty-one-second one, and forgetting was
 * guaranteed several times a day. The sysop, twice: "there is a long delay
 * when the cosysop ai replies".
 *
 * A JSON file beside the database, written after a change and read once at
 * startup. Not a table: this is a cache of measurements, it is rewritten
 * constantly, and losing it costs a slow reply rather than data.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * `mute` is a model that answers with no words - it will take a tool call and
 * then write nothing, so it is useless for a chat reply however fast it is.
 * Speed was the only thing measured until a caller asked about Fairlight's C64
 * era and got 60 lines of raw Demozoo back (2026-09-13).
 */
export interface StoredCost { ewmaMs: number; failedAt?: number; mute?: boolean }

/**
 * Where the measurements live, beside the database on the board's volume.
 *
 * `config` is required HERE rather than imported at the top: this module is
 * pulled in by the bot handler, and importing the config graph for a cache
 * file drags the board's whole startup into anything that touches the bot -
 * which changed what the operator-chat tests saw and stopped the bot replying
 * in two of them.
 */
export function costFilePath(): string {
  const { config } = require('../../config');
  return path.join(config.get('dataDir'), 'db', 'ai-model-costs.json');
}

/**
 * Read what the last run measured.
 *
 * Any failure - no file, unreadable, half-written - answers with an empty map.
 * A cache that cannot be read is a cache miss, never an error a caller has to
 * handle, and never a reason not to answer the caller.
 */
export function loadModelCosts(): Map<string, StoredCost> {
  try {
    const raw = JSON.parse(fs.readFileSync(costFilePath(), 'utf8')) as Record<string, StoredCost>;
    const costs = new Map<string, StoredCost>();
    for (const [model, cost] of Object.entries(raw ?? {})) {
      // Only what this file is for: a number of milliseconds, and optionally
      // when it last failed. Anything else is somebody else's file.
      if (typeof cost?.ewmaMs !== 'number' || !Number.isFinite(cost.ewmaMs)) continue;
      costs.set(model, {
        ewmaMs: cost.ewmaMs,
        ...(typeof cost.failedAt === 'number' ? { failedAt: cost.failedAt } : {}),
        ...(cost.mute === true ? { mute: true } : {}),
      });
    }
    return costs;
  } catch {
    return new Map();
  }
}

/**
 * Write the measurements, atomically enough for a cache.
 *
 * Through a temporary file and a rename, so a container killed mid-write
 * leaves the previous measurements rather than a truncated file the next boot
 * would silently discard.
 */
export function saveModelCosts(costs: Map<string, StoredCost>): void {
  const file = costFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(costs), null, 2));
    fs.renameSync(tmp, file);
  } catch {
    // A board that cannot write its cache still answers callers; it just
    // relearns the timings after the next restart.
  }
}
