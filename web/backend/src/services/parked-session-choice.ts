/**
 * S9 (session-persistence plan): a login from another device while the
 * account's web session is parked asks what to do with it.
 *
 * Web: [R]esume it here (the parked session moves onto this socket) or
 * [E]nd it and log in fresh. Telnet/SSH cannot carry a web session, so they
 * offer [E]nd it and log in here, or [Q]uit.
 *
 * WEB_: express.e has no parked session; its already-on check
 * (express.e:29715-29727) refuses the second login. A parked session is the
 * board's own (session-parking.ts), so this question is too.
 *
 * The answer is read the way the forced password change reads its lines
 * (login-prompt.service.ts): `session.loginInputHandler` owns the caller's
 * input until the promise settles, and `runPostAuthLogin` awaits it.
 */
import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { emitPrompt } from "../utils/output.util";
import { whoEntry } from "../utils/who-table.util";
import { EnvStat } from "../constants/env-codes";
import { isParked, moveParkedTo, endParkedSessionsFor, type AttachUser } from "../server/session-parking";

export type ParkedChoice = "resume" | "end" | "quit";

/** The question, ASCII and in full words. */
export function parkedChoicePrompt(parked: BBSSession, web: boolean): string {
  const activity = whoEntry(parked.currentStat ?? EnvStat.IDLE, "", "", { isSelf: false, hideFiles: false }).action;
  const head = `\r\nYou have a session waiting on node ${parked.nodeId} (${activity}). `;
  return web
    ? `${head}[R]esume it here or [E]nd it and log in fresh? `
    : `${head}[E]nd it and log in here, or [Q]uit? `;
}

/** The answer a key gives, or null for a key the prompt does not offer. */
export function parkedChoiceForKey(key: string, web: boolean): ParkedChoice | null {
  const k = key.toUpperCase();
  if (k === "E") return "end";
  if (web && k === "R") return "resume";
  if (!web && k === "Q") return "quit";
  return null;
}

/** Ask, and settle with the first key the prompt offers; any other key asks again. */
export function askParkedChoice(
  emitter: LoginEmitter,
  session: BBSSession,
  parked: BBSSession,
  web: boolean,
): Promise<ParkedChoice> {
  emitPrompt(emitter as any, parkedChoicePrompt(parked, web));
  return new Promise<ParkedChoice>((resolve) => {
    session.loginInputHandler = (chunk: string) => {
      for (const ch of String(chunk)) {
        if (ch === "\r" || ch === "\n" || ch === "\0") continue;
        const choice = parkedChoiceForKey(ch, web);
        if (choice === null) {
          emitPrompt(emitter as any, parkedChoicePrompt(parked, web));
          continue;
        }
        session.loginInputHandler = undefined;
        emitPrompt(emitter as any, `${ch.toUpperCase()}\r\n`);
        resolve(choice);
        return;
      }
    };
  });
}

/**
 * [R]esume: the provisional session this socket logged in on is forgotten
 * without paperwork (nothing was logged on it: the already-on gates run
 * before any logon line, login-post.service.ts), its node is released, and
 * its link is detached from the socket without saying `disconnect`. Then the
 * parked session moves onto the socket.
 */
export async function resumeParkedHere(
  session: BBSSession,
  parked: BBSSession,
  user: AttachUser,
): Promise<"moved" | "gone" | "lost"> {
  const provisional = session.webLink;
  if (!provisional) return "gone";
  const raw = provisional.raw;
  // Lazy, as session-parking.ts requires its heavy neighbours: socket-handlers
  // imports the parking module, and tests mock the connection path.
  const { forgetSession, releaseSessionResources } = require("../server/socket-handlers");
  const { stopObserving } = require("../server/session-observers");
  const moved = await moveParkedTo(raw, parked, user, async () => {
    // Detached first, so the teardown below says nothing to its listeners.
    provisional.removeAllListeners();
    provisional.end("server namespace disconnect");
    stopObserving(raw.id);
    await releaseSessionResources(provisional, session);
    forgetSession(session, raw.id, String(user.id));
    const { nodeManager } = require("./node-manager.service");
    await nodeManager.releaseSession(raw.id);
  });
  // Ended during the hand-over (a kick): this socket has no session left.
  if (moved === "lost" && raw.connected) raw.disconnect(true);
  return moved;
}

/** [E]nd: the parked session ends through its usual finalize (one Loss Carrier). */
export async function endParkedHere(parked: BBSSession): Promise<void> {
  if (!isParked(parked)) return;
  await endParkedSessionsFor(String((parked.user as { id?: unknown } | undefined)?.id ?? ""));
}
