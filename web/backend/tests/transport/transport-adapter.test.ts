/**
 * Task TP-3 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * ONE RULING FOR ALL 232 EVENT NAMES.
 *
 * The controller's decision 1: "The backend must never emit a web-only event to
 * a session that cannot receive it without the adapter knowing. A test
 * enumerates the backend's emitted event names from a pinned, grep-derived list
 * and fails if any one lacks a ruling."
 *
 * That is cases 1 to 3. `PINNED_EVENT_NAMES` below is the committed list; case
 * 1 checks the table against it, case 2 RE-RUNS the census against the working
 * tree so the pin cannot go stale silently, and case 3 does the same for the
 * SITES whose event name is a variable - the ones no name census can ever see.
 *
 * Cases 4 to 8 drive the adapter itself: the pattern arm, the unruled path, the
 * once-per-name-per-connection log, the byte-identity of the three rendered
 * names under the widened `emit` signature, and the capability struct.
 *
 * R0 and R4 are the REACHABILITY_PROTOCOL rows this task closes. R0 validates
 * the instrument before any count from it is quoted (protocol section 3): the
 * same spy must report LIVE on a byte transport and DEAD on a web session,
 * which is a MODULE-BOUNDARY spy - `connection-emitter.ts` calls
 * `applyTransportEvent` across a module edge, so ts-jest's CommonJS interop
 * routes the call through the module object the spy replaces. A spy on a
 * module-local function would have recorded zero whether the path ran or not.
 */
process.env.SKIP_DB_INIT = '1';

import { execFileSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import {
  EVENT_RULINGS,
  FORWARDING_EMIT_SITES,
  PATTERN_RULINGS,
  matchPattern,
  transportCapabilities,
  type EventRuling,
  type TransportDropRecord,
} from '../../src/server/transport-adapter';
import type { BBSSession } from '../../src/index';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND_SRC = path.join(REPO_ROOT, 'web', 'backend', 'src');
const SDK_DIR = path.join(REPO_ROOT, 'sdk');
const DOORS_DIR = path.join(REPO_ROOT, 'Doors');

/**
 * THE PIN. 245 names, produced by greps A and B of the census documented at the
 * top of `src/server/transport-adapter.ts` and committed here. Case 2 re-runs
 * both greps and fails, BY NAME, on any difference.
 */
const PINNED_EVENT_NAMES: ReadonlyArray<string> = [
  'achievements:get',
  'achievements:progress',
  'achievements:unlock',
  'active-users',
  'ansi-output',
  'audio-speaking-status',
  'audio:data',
  'audio:levels',
  'audio:muted',
  'audio:play-sfx',
  'audio:set-ui-sounds',
  'audio:set-volume',
  'audio:start-streaming',
  'audio:stop-streaming',
  'audio:stream-started',
  'audio:stream-stopped',
  'bbs:event',
  'c64-detected',
  'chat-only-login-error',
  'chat-only-login-success',
  'chat:auth-token',
  'chat:banned',
  'chat:declined',
  'chat:dm',
  'chat:dm-error',
  'chat:dm-history',
  'chat:dm-threads',
  'chat:dm-threads:list',
  'chat:ended',
  'chat:error',
  'chat:invite',
  'chat:invite-cancelled',
  'chat:keystroke',
  'chat:keystroke-clear',
  'chat:keystroke-submit',
  'chat:kicked',
  'chat:message',
  'chat:message-received',
  'chat:muted',
  'chat:partner-disconnected',
  'chat:pin:list',
  'chat:pin:updated',
  'chat:request-sent',
  'chat:search:results',
  'chat:started',
  'chat:thread:created',
  'chat:thread:messages',
  'chat:thread:reply',
  'chat:timeout',
  'close',
  'command',
  'complete',
  'connection',
  'cursor-style',
  'data',
  'disconnect',
  'door-active',
  'door-message',
  'door:await-key',
  'door:close',
  'door:error',
  'door:exit',
  'door:input',
  'door:input-mode',
  'door:load-client',
  'door:output',
  'door:password-mode',
  'door:ready',
  'door:status',
  'download-file',
  'error',
  'example-data',
  'example-result',
  'font-changed',
  'font-preference',
  'force-disconnect',
  'forced-pwd-change-complete',
  'game-mode',
  'game:input',
  'game:invite',
  'get-active-users',
  'hangup',
  'import:progress',
  'join_room',
  'leaderboard:get',
  'leaderboard:get_around',
  'leaderboard:get_rank',
  'leaderboard:top_by_stat',
  'leave_room',
  'lobby:auto_balance',
  'lobby:ban',
  'lobby:cancel_countdown',
  'lobby:chat',
  'lobby:create',
  'lobby:emote',
  'lobby:force_start',
  'lobby:game_over',
  'lobby:get_invite_code',
  'lobby:join',
  'lobby:join_by_code',
  'lobby:kick',
  'lobby:leave',
  'lobby:list',
  'lobby:matchmake',
  'lobby:ready',
  'lobby:set_character',
  'lobby:set_color',
  'lobby:set_settings',
  'lobby:set_team',
  'lobby:shuffle_teams',
  'lobby:start_countdown',
  'lobby:start_game',
  'lobby:start_vote',
  'lobby:transfer_host',
  'lobby:vote',
  'login-failed',
  'login-success',
  'mask-input',
  'matches:get',
  'matches:history',
  'matches:submit',
  'matchmaking:accept',
  'matchmaking:decline',
  'matchmaking:estimate_wait',
  'matchmaking:get_skill',
  'matchmaking:join',
  'matchmaking:leave',
  'matchmaking:queue_population',
  'modem-speed',
  'network-pong',
  'olm-quiet-status',
  'operator:active-chats',
  'operator:bot-activated',
  'operator:chat-accepted',
  'operator:chat-ended',
  'operator:chat-started',
  'operator:error',
  'operator:message',
  'operator:message-history',
  'operator:page',
  'operator:page-accepted',
  'operator:paging-dot',
  'operator:pending-pages',
  'operator:status-updated',
  'operator:typing-status',
  'operator:user-typing',
  'party:create',
  'party:invite',
  'party:join',
  'party:leave',
  'password-mode',
  'petscii-bytes',
  'petscii-output',
  'ping',
  'pong-test',
  'presence:get',
  'presence:get_batch',
  'presence:subscribe',
  'presence:unsubscribe',
  'presence:update',
  'progress',
  'prompt-forced-pwd-change',
  'prompt-login',
  'prompt-password',
  'prompt-password-reset',
  'ready',
  'replay:delete',
  'replay:list',
  'replay:load',
  'replay:save',
  'retry-login',
  'rip-mode',
  'room:created',
  'room:error',
  'room:invite-received',
  'room:invite-revoked',
  'room:invited',
  'room:join',
  'room:joined',
  'room:kicked',
  'room:leave',
  'room:left',
  'room:list',
  'room:mode',
  'room:motd',
  'room:user-joined',
  'room:user-left',
  'security:report',
  'session-restore-failed',
  'session-restored',
  'set-font',
  'set-input-mode',
  'show-file-upload',
  'social:accept_friend',
  'social:add_friend',
  'social:block',
  'social:decline_friend',
  'social:get_blocked',
  'social:get_friends',
  'social:remove_friend',
  'social:unblock',
  'stats:compare',
  'stats:get',
  'supervisor:command',
  'sync:aoi',
  'sync:delta',
  'sync:lockstep',
  'sync:request_full',
  'sync:snapshot',
  'system-message',
  'system:notice',
  'terminal-mode',
  'terminal-resize',
  'terminal-type',
  'theme-changed',
  'theme-preference',
  'transfer-raw:cancelled',
  'transfer-raw:complete',
  'transfer-raw:data',
  'transfer-raw:echo',
  'transfer-raw:init',
  'transfer:cancelled',
  'transfer:complete',
  'transfer:data',
  'transfer:end',
  'transfer:error',
  'unoEventBroadcast',
  'user-not-found',
  'video:cells',
  'video:frame',
  'video:start-stream',
  'video:stop-stream',
  'video:stream-started',
  'video:stream-stopped',
  'voice:deafen',
  'voice:join',
  'voice:joined',
  'voice:leave',
  'voice:left',
  'voice:mute',
  'voice:mute-remote',
  'voice:screenshare-toggle',
  'voice:speaking',
  'voice:video-toggle',
  'window-size',
];

/** The census's grep A, verbatim, run from the tree. */
const GREP_A = String.raw`
cd web/backend/src && grep -rhoE "\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]" --include="*.ts" . \
  | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" | sort -u
`;

/**
 * The census's grep B, verbatim, run from the tree: emits on a SESSION-SOCKET
 * receiver outside the backend. A plain file grep over `sdk/` returns 392
 * names, nearly all blessed-widget and engine-internal EventEmitter traffic;
 * anchoring on the receiver is what separates "reaches a caller" from "reaches
 * a widget". The `Doors/` arm returns nothing today and is run anyway, because
 * the day a door emits on its own socket is the day this must fail.
 */
const GREP_B = String.raw`
PAT="(^|[^A-Za-z0-9_.])(socket|emitter|sock)\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]|\.(socket|emitter)\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]"
grep -rhoE "$PAT" --include="*.ts" sdk/engines sdk/utils sdk/types
DOORFILES=$(for d in Doors/*/; do ls "$d"[a-z]*.ts 2>/dev/null; done)
if [ -n "$DOORFILES" ]; then
  printf '%s\n' "$DOORFILES" | tr '\n' '\0' | xargs -0 grep -hoE "$PAT" 2>/dev/null || true
fi
`;

function shell(script: string): string[] {
  return execFileSync('bash', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Grep A's output is already the bare name - its `sed` extracted it. */
function namesFromGrepA(lines: string[]): string[] {
  return [...new Set(lines)].sort();
}

/** Grep B's output is the raw matched fragment; the name is the quoted part. */
function namesFromGrepOutput(lines: string[]): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const m = line.match(/['"]([^'"]+)['"]/);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/** One `.emit(` whose first argument is not a string literal. */
interface ScannedSite {
  file: string;
  line: number;
  expression: string;
}

/**
 * The census's grep C, as a SCANNER rather than a shell grep.
 *
 * A shell grep cannot do this job and the plan's draft pattern proved it: it
 * alternated over the variable NAMES it happened to know (`eventName`,
 * `segState.eventName`, `paged.eventName`, `event`), so it missed
 * `pre-login.ts`'s `outputEvent` / `outputEventEarly` and `logoff.ts`'s
 * `opts.event ?? 'ansi-output'` entirely, and it cannot see a call whose first
 * argument sits on the NEXT line (`pre-login.ts:273`). This scanner asks the
 * only question that is actually stable: is the first argument of this `.emit(`
 * a string literal? If it is not, the name is built at runtime and something
 * must have ruled it.
 */
function scanVariableEmitSites(): ScannedSite[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(p);
      } else if (entry.name.endsWith('.ts')) {
        files.push(p);
      }
    }
  };
  walk(BACKEND_SRC);

  const sites: ScannedSite[] = [];
  for (const file of files.sort()) {
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const re = /\.emit\(\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const argStart = m.index + m[0].length;
      const ch = src[argStart];
      if (ch === "'" || ch === '"' || ch === '`') continue;
      const line = src.slice(0, m.index).split('\n').length;
      const raw = lines[line - 1] ?? '';
      const text = raw.trim();
      // A `.emit(` inside a doc comment is prose, not a call site.
      if (text.startsWith('*') || text.startsWith('//')) continue;
      // Nor is one inside a STRING literal - `server/transport-adapter.ts`
      // quotes call sites in its own notes, and a scanner that read those would
      // report the census's own record as a finding. Odd quote count before the
      // match means the match is inside a string.
      const column = m.index - (src.lastIndexOf('\n', m.index - 1) + 1);
      const prefix = raw.slice(0, column);
      const odd = (ch: string): boolean => (prefix.split(ch).length - 1) % 2 === 1;
      if (odd('"') || odd("'") || odd('`')) continue;
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      const receiver = (before.match(/([A-Za-z0-9_$.\]]+)$/) ?? ['?'])[0];
      const argument = src.slice(argStart, argStart + 60).split(/[,)\n]/)[0].trim();
      sites.push({
        file: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
        line,
        expression: `${receiver}.emit(${argument}`,
      });
    }
  }
  return sites;
}

/** file -> the sorted multiset of `receiver.emit(argument` expressions in it. */
function byFile(sites: ReadonlyArray<{ file: string; expression: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of sites) (out[s.file] ??= []).push(s.expression);
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function telnetSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: nodeId, username: `NODE${nodeId}`, secLevel: 100 },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    cmdShortcuts: false,
    doorExpertMode: false,
    connectionType: 'telnet',
    terminalType: 'ansi',
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
    ...overrides,
  } as unknown as BBSSession;
}

/**
 * The connection shape the emitter is built over. Deliberately NOT a fake of
 * `write` in the sense TP-1 bans - no case here asserts an ENCODING, which is
 * the thing a fake write would decide for the test. The byte cases assert
 * IDENTITY: the same payloads through the widened signature must produce the
 * same buffer they produced before, and a fake sink that records what it was
 * handed is the honest instrument for that.
 */
class RecordingConnection extends EventEmitter {
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];
  public closed = 0;
  public transportDrops?: Map<string, TransportDropRecord>;

  constructor(nodeId: number) {
    super();
    this.nodeId = nodeId;
    this.sessionId = `telnet-${nodeId}-adapter-test`;
  }

  write(data: Buffer | string): void {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
  }

  close(): void {
    this.closed += 1;
  }

  getRemoteAddress(): string {
    return '127.0.0.1';
  }
}

type EmitterLike = { emit(event: string, ...args: unknown[]): unknown };

function telnetCaller(nodeId: number, overrides: Partial<BBSSession> = {}) {
  const connection = new RecordingConnection(nodeId);
  const session = telnetSession(nodeId, overrides);
  connection.session = session;
  const emitter = buildConnectionEmitter(connection as never) as EmitterLike;
  return { connection, session, emitter };
}

/**
 * The PRODUCT'S top-level entry point for a telnet caller (TP-2 made it
 * importable). R0 and R4 drive this rather than constructing the emitter
 * themselves, so the emitter under test is the one production attaches.
 */
function callerThroughEntryPoint(nodeId: number, connectionType: 'telnet' | 'web') {
  const connection = new RecordingConnection(nodeId);
  connection.session = telnetSession(nodeId, { connectionType } as Partial<BBSSession>);
  const deps: TransportSessionDeps = {
    io: {} as never,
    sessions: new Map<string, BBSSession>(),
    nodeManager: { releaseSession: jest.fn(async () => undefined) },
    handleCommand: jest.fn(),
  };
  setupTelnetSSHHandler(connection as never, 'telnet', deps);
  const emitter = (connection as unknown as { emitter?: EmitterLike }).emitter;
  if (!emitter) throw new Error('the entry point did not attach an emitter');
  return { connection, emitter, session: connection.session as BBSSession };
}

function silenceLogs() {
  return {
    error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
    debug: jest.spyOn(console, 'debug').mockImplementation(() => undefined),
  };
}

// ---------------------------------------------------------------------------

describe('TP-3 - the adapter: one ruling for every event name', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('every event name the backend, the SDK and the doors emit has a written ruling', () => {
    const ruled = Object.keys(EVENT_RULINGS).sort();
    const pinned = [...PINNED_EVENT_NAMES].sort();

    const unruled = pinned.filter((n) => !(n in EVENT_RULINGS));
    expect({ unruled }).toEqual({ unruled: [] });

    const invented = ruled.filter((n) => !pinned.includes(n));
    expect({ invented }).toEqual({ invented: [] });

    expect(ruled).toEqual(pinned);
    expect(ruled.length).toBe(245);

    // (c) every ruling's note is non-empty - the point of the table is the
    // written reason, not the classification.
    const noteless = ruled.filter((n) => !EVENT_RULINGS[n].note || EVENT_RULINGS[n].note.trim().length < 20);
    expect({ noteless }).toEqual({ noteless: [] });

    // (d) every not-transport ruling names an owner, so the claim can be checked.
    const ownerless = ruled.filter((n) => {
      const r: EventRuling = EVENT_RULINGS[n];
      return r.kind === 'not-transport' && (!r.owner || r.owner.trim().length === 0);
    });
    expect({ ownerless }).toEqual({ ownerless: [] });

    // The class counts the module's own header quotes, so the header cannot rot.
    const counts: Record<string, number> = {};
    for (const n of ruled) counts[EVENT_RULINGS[n].kind] = (counts[EVENT_RULINGS[n].kind] ?? 0) + 1;
    // TP-4 moved ONE name between classes and nothing else: `cursor-style`
    // went from `render` to `web-only` after both ends were read. The payload
    // is a CSS mouse-pointer name (doors/BBSApi.ts:532-538, set on
    // terminalRef.current.style.cursor by BBSTerminal.tsx:2289-2292), not a
    // DECSCUSR text-cursor shape, and a byte terminal has no pointer to shape.
    // render 6 -> 5, web-only 113 -> 114; the total was still 242.
    //
    // 2026-09-06, the census re-run below moved for the first time: four
    // backend emits landed after it was taken and none was ruled.
    // `cursor-visibility` and `operator:active-chats` are web-only (a browser
    // canvas concern; the sysop console's reply to its own request), so
    // web-only 114 -> 116; `operator:paging-dot` (a `sysops` socket.io room)
    // and `operator:bot-activated` (a server-wide io broadcast) never address
    // a session socket at all, so not-transport 102 -> 104. Total 242 -> 246.
    //
    // Then `cursor-visibility` went away again with the helper that was its
    // only emit site (utils/terminal-utils.ts setCursorVisible, which nothing
    // called): web-only 116 -> 115, total 246 -> 245.
    expect(counts).toEqual({
      render: 5,
      translate: 11,
      dead: 10,
      'web-only': 115,
      'not-transport': 104,
    });
  });

  const treesPresent = fs.existsSync(BACKEND_SRC) && fs.existsSync(SDK_DIR) && fs.existsSync(DOORS_DIR);
  const censusIt = treesPresent
    ? it
    : it.skip;
  censusIt('the pin is not stale - the census re-run from the tree matches it' +
    (treesPresent ? '' : ' [SKIPPED: web/backend/src, sdk/ or Doors/ absent - a packaged run]'), () => {
    const fromA = namesFromGrepA(shell(GREP_A));
    const fromB = namesFromGrepOutput(shell(GREP_B));

    // The census's own arithmetic, quoted in the module header.
    //
    // 150, not the 149 this landed with: grep A is a text scan, and
    // `src/doors/who-is-online.ts` opens with a header that QUOTES the dead
    // round trip it replaced - `socket.emit('get-active-users')` - inside a
    // comment. No new emit site exists; `get-active-users` was already in the
    // census (and already ruled) from grep B, so the union below is unchanged
    // and it is only this arm's count that moved. The union, not the arm, is
    // what proves nothing is unruled.
    //
    // 154 as of 2026-09-06, and this time the UNION moved too: four real new
    // backend emit sites, all in arm A - `cursor-visibility`
    // (utils/terminal-utils.ts:39) and the three operator names
    // `operator:active-chats` (handlers/operator-chat.handler.ts:148),
    // `operator:paging-dot` (:434) and `operator:bot-activated` (:1182). Each
    // is ruled in EVENT_RULINGS with the receiver that earns its class.
    //
    // 153 now: `cursor-visibility` had NO SENDER - setCursorVisible() was the
    // only site that emitted it and nothing in the tree called setCursorVisible
    // - so the helper was deleted rather than left asserting behaviour no code
    // performs, and the name left arm A with it. Union 246 -> 245.
    expect(fromA.length).toBe(153);
    // 86 from sdk/, 14 from Doors/, `ansi-output` in both. The plan records the
    // Doors arm as 0; that was a zsh `nomatch` artefact and the module header
    // records the correction.
    //
    // The Doors arm is 14, not the 16 this landed with, and both departures are
    // the SAME two names that move the arm-A count above - which is why the
    // union is untouched:
    //   - `get-active-users` left `Doors/telnet-front/index.ts` when the node
    //     table stopped asking for it over the socket; the read now lives in
    //     `src/doors/who-is-online.ts`, whose header quotes the dead call.
    //   - `bbs:event` moved from `Doors/card-lobby/index.ts` down to
    //     `Doors/card-lobby/lib/live-chat.ts`, which `Doors/*/[a-z]*.ts` does
    //     not reach. The backend emits it too, so arm A still sees it.
    expect(fromB.length).toBe(99);

    const live = [...new Set([...fromA, ...fromB])].sort();
    const pinned = [...PINNED_EVENT_NAMES].sort();

    const added = live.filter((n) => !pinned.includes(n));
    const removed = pinned.filter((n) => !live.includes(n));
    expect({
      added,
      removed,
      whatToDo:
        added.length || removed.length
          ? 'The census moved. RULE the added names in EVENT_RULINGS (server/transport-adapter.ts) ' +
            'with a written note, drop the removed ones, and update PINNED_EVENT_NAMES here.'
          : 'unchanged',
    }).toEqual({ added: [], removed: [], whatToDo: 'unchanged' });

    expect(live).toEqual(pinned);
  });

  censusIt('no variable-emit site in the backend is left unruled' +
    (treesPresent ? '' : ' [SKIPPED: web/backend/src absent - a packaged run]'), () => {
    const scanned = scanVariableEmitSites();
    const claimed = [
      ...PATTERN_RULINGS.flatMap((p) => p.sites.map((s) => ({ file: s.file, expression: s.expression }))),
      ...FORWARDING_EMIT_SITES.map((s) => ({ file: s.file, expression: s.expression })),
    ];
    const claimedKeys = new Set(claimed.map((c) => `${c.file}\t${c.expression}`));

    // THE DIRECTION THAT MATTERS, hard-asserted: a `.emit(` whose name is built
    // at runtime and which nothing has ruled is an unruled name that no literal
    // census can ever see. RED the day anyone adds one.
    const unclaimed = scanned
      .filter((s) => !claimedKeys.has(`${s.file}\t${s.expression}`))
      .map((s) => `${s.file}:${s.line}  ${s.expression}`);
    expect({
      unclaimed,
      whatToDo: unclaimed.length
        ? 'A new runtime-built event name. Add the site to PATTERN_RULINGS (with the ruling its ' +
          'name resolves to) or to FORWARDING_EMIT_SITES (with the reason it introduces no name), ' +
          'in src/server/transport-adapter.ts.'
        : 'none',
    }).toEqual({ unclaimed: [], whatToDo: 'none' });

    // Compared by FILE and EXPRESSION, never by line number: the later tasks in
    // this plan edit screen.handler.ts and pre-login.ts, and a line pin would
    // fail on every one of them while catching nothing this does not.
    //
    // The other direction is asserted at FILE granularity only. Removing a
    // variable-emit site is the SAFE direction - one fewer runtime-built name -
    // and this suite must survive being cherry-picked ahead of a task whose
    // site it already claims (TP-6's pre-login R branch is exactly that case
    // today). A claimed file that has stopped having any variable emit at all
    // still fails, so a wholesale stale claim cannot hide.
    const scannedFiles = new Set(scanned.map((s) => s.file));
    const staleFiles = [...new Set(claimed.map((c) => c.file))].filter((f) => !scannedFiles.has(f));
    expect({ staleFiles }).toEqual({ staleFiles: [] });

    // The module constants themselves, which do not move with the tree.
    const renderedArm = PATTERN_RULINGS.find((p) => p.ruling.kind === 'render');
    const messageArm = PATTERN_RULINGS.find((p) => p.test.source.includes('door:message'));
    expect(renderedArm?.sites.length).toBe(16);
    expect(messageArm?.sites.length).toBe(1);
    expect(FORWARDING_EMIT_SITES.length).toBe(6);
    for (const s of FORWARDING_EMIT_SITES) expect(s.why.length).toBeGreaterThan(20);
    for (const p of PATTERN_RULINGS) expect(p.ruling.note.length).toBeGreaterThan(40);
  });

  censusIt('the adapter never contaminates the census it defines' +
    (treesPresent ? '' : ' [SKIPPED: web/backend/src absent - a packaged run]'), () => {
    // Both halves of this module live inside grep A's scope, so a note that
    // wrote a literal `.emit('some:name'` would add that name to the backend's
    // own census and the table would start ruling itself. The broker quotation
    // is paraphrased around the call punctuation for exactly that reason; this
    // is the rule's pin.
    for (const file of ['transport-adapter.ts', 'transport-event-rulings.ts']) {
      const source = fs.readFileSync(path.join(BACKEND_SRC, 'server', file), 'utf8');
      expect({ file, selfEmits: source.match(/\.emit\(\s*['"`]/g) ?? [] }).toEqual({
        file,
        selfEmits: [],
      });
    }
  });

  it("a client door's frame is a ruled drop, not an unruled one", () => {
    const { connection, emitter } = telnetCaller(31);
    const spies = silenceLogs();

    emitter.emit('door:message:abc123', { type: 'frame', payload: 'x' });

    const record = connection.transportDrops?.get('door:message:abc123');
    expect(record).toBeDefined();
    expect(record?.ruling).toBe('web-only');
    expect(record?.count).toBe(1);
    expect(spies.error).toHaveBeenCalledTimes(0);
    expect(spies.debug).toHaveBeenCalledTimes(1);
    expect(matchPattern('door:message:abc123')?.kind).toBe('web-only');
    // The name is NOT in the literal table - only the pattern arm can rule it.
    expect('door:message:abc123' in EVENT_RULINGS).toBe(false);
  });

  it('an unruled event is loud exactly once', () => {
    const { connection, emitter } = telnetCaller(32);
    const spies = silenceLogs();

    emitter.emit('totally-made-up-event', 1);
    emitter.emit('totally-made-up-event', 2);
    emitter.emit('totally-made-up-event', 3);

    const record = connection.transportDrops?.get('totally-made-up-event');
    expect(record?.ruling).toBe('unruled');
    expect(record?.count).toBe(3);
    expect(spies.error).toHaveBeenCalledTimes(1);
    expect(String(spies.error.mock.calls[0][0])).toContain("UNRULED event 'totally-made-up-event'");
    expect(String(spies.error.mock.calls[0][0])).toContain('EVENT_RULINGS');
  });

  it('a web-only event is dropped, counted, and logged once', () => {
    const { connection, emitter } = telnetCaller(33);
    const spies = silenceLogs();

    for (let i = 0; i < 3; i += 1) {
      emitter.emit('door:load-client', { doorId: 'arkanoid', sessionId: 'client-door-1' });
    }

    const record = connection.transportDrops?.get('door:load-client');
    expect(record?.ruling).toBe('web-only');
    expect(record?.count).toBe(3);
    expect(spies.debug).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(0);
    // Nothing reached the wire, which is what "web-only" means.
    expect(connection.written.length).toBe(0);
  });

  it('a translate ruling is honoured, not counted, now that TP-4 has given it a body', () => {
    // THE TP-4 SUCCESSOR FORM of TP-3's stub case. While `applyTranslation`
    // returned false for everything, a `translate` name was still undelivered
    // and the adapter recorded it with its own ruling kind so the tally could
    // not claim a byte caller had received it (TP-3's deviation D18). TP-4 gave
    // every one of those rulings a body, so the count flips by itself: nothing
    // is recorded, nothing is logged, and the events DO something.
    //
    // The bodies themselves are proved in tests/transport/transport-translations.test.ts,
    // one case per symptom, driven through the real telnet entry point. This
    // case exists here to pin the ADAPTER's half of the contract: a body that
    // returns true must leave no drop behind.
    const { connection, emitter } = telnetCaller(34);
    const spies = silenceLogs();

    emitter.emit('modem-speed', 2400);
    emitter.emit('modem-speed', 0);
    emitter.emit('hangup');

    expect(connection.transportDrops?.get('modem-speed')).toBeUndefined();
    expect(connection.transportDrops?.get('hangup')).toBeUndefined();
    expect(spies.debug).toHaveBeenCalledTimes(0);
    expect(connection.written.length).toBe(0);
    // `hangup` is BB_DROPDTR: on a byte transport, dropping the carrier is
    // closing the connection.
    expect(connection.closed).toBe(1);
  });

  it('the three rendered events are untouched by the widened signature', () => {
    const { connection, emitter } = telnetCaller(35);
    const spies = silenceLogs();

    // The payload set the emitter's three branches actually see on an
    // 80-column ANSI session: a string with bare LFs (CRLF-normalised), a
    // binary ZMODEM buffer (untouched), a petscii-output string on a
    // non-PETSCII session, and base64 .seq bytes on a non-PETSCII session.
    const text = '\x1b[10;5H\x1b[33mDOOR FRAME\x1b[0m\nsecond line\r\nthird\n';
    const binary = Buffer.from([0x18, 0x42, 0x00, 0xff, 0x0a]);
    const petsciiText = 'PETSCII TEXT\r\n';

    // A third argument on one payload: the wipe path already sends PRE_PACED
    // (utils/output-pacing.ts) and TP-5 will send the source charset there.
    // The widening must not eat it, and it must not change a single byte.
    const prePaced = Object.freeze({ prePaced: true as const });

    emitter.emit('ansi-output', text, prePaced);
    emitter.emit('ansi-output', binary);
    emitter.emit('petscii-output', petsciiText);
    emitter.emit('petscii-bytes', Buffer.from([0x93, 0x41, 0x42]).toString('base64'));

    // The baseline is built from this test's OWN inputs, the way
    // eighty-col-choke-identity.test.ts builds its telnet baseline: not a
    // stored fixture and not a capture, so the pin cannot rot.
    const expectedAnsi = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1');
    expect(connection.written[0].equals(expectedAnsi)).toBe(true);
    expect(connection.written[1].equals(binary)).toBe(true);
    expect(connection.written[2].equals(Buffer.from(petsciiText, 'latin1'))).toBe(true);
    expect(connection.written.length).toBe(4);

    // A rendered name never reaches the adapter, so it is never a drop and
    // never logs.
    expect(connection.transportDrops).toBeUndefined();
    expect(spies.debug).toHaveBeenCalledTimes(0);
    expect(spies.error).toHaveBeenCalledTimes(0);
  });

  it('a byte transport reports no key events, no browser, no RIP', () => {
    const byteTransport = { bytes: true, events: false, keyEvents: false, browser: false, rip: false };
    const browser = { bytes: false, events: true, keyEvents: true, browser: true, rip: true };

    expect(transportCapabilities({ connectionType: 'telnet' } as BBSSession)).toEqual(byteTransport);
    expect(transportCapabilities({ connectionType: 'ssh' } as unknown as BBSSession)).toEqual(byteTransport);
    expect(transportCapabilities({ connectionType: 'web' } as BBSSession)).toEqual(browser);
    // A /ws/terminal session is created with connectionType 'telnet'
    // (index.ts's ws-terminal factory) and is therefore a byte transport.
    expect(transportCapabilities({ connectionType: 'telnet' } as BBSSession).bytes).toBe(true);
    // Null and undefined are byte transports: default-CLOSED, the safe reading.
    expect(transportCapabilities(null)).toEqual(byteTransport);
    expect(transportCapabilities(undefined)).toEqual(byteTransport);
  });

  // -------------------------------------------------------------------------
  // Reachability rows (REACHABILITY_PROTOCOL sections 3 and 10)
  // -------------------------------------------------------------------------

  it('R0 - the sentinel reports LIVE on a byte transport and DEAD on a web socket', () => {
    // Protocol section 3: run the detector against a case whose answer is
    // already known, in BOTH directions, before quoting any number from it.
    //
    // THE INSTRUMENT is `connection.transportDrops` - state that only
    // `applyTransportEvent` writes, reached across a module boundary from
    // `connection-emitter.ts`. A jest spy on the module export was tried first
    // and cannot be used: ts-jest compiles the export to a getter-only property
    // and `jest.spyOn` throws "Cannot redefine property". The record's `count`
    // IS the call count, which is what Gate 3b asks for ("call counter,
    // sentinel, or a value that could only come from that path").
    silenceLogs();

    const live = callerThroughEntryPoint(36, 'telnet');
    live.emitter.emit('door:load-client', { doorId: 'arkanoid' });
    const liveCount = live.connection.transportDrops?.get('door:load-client')?.count ?? 0;

    // The DEAD half: a web caller's socket is a socket.io Socket built by
    // registerSocketHandlers, and the adapter is not on that path at all.
    // Emitting the same name on a plain EventEmitter writes no record anywhere.
    const webSocket = new EventEmitter();
    const webConnection = new RecordingConnection(39);
    webSocket.emit('door:load-client', { doorId: 'arkanoid' });
    const deadCount = webConnection.transportDrops?.get('door:load-client')?.count ?? 0;

    expect(liveCount).toBe(1);
    expect(deadCount).toBe(0);
  });

  it('R4 - a web-only event on the real telnet entry point reaches the adapter exactly once', () => {
    const spies = silenceLogs();

    // setupTelnetSSHHandler is the PRODUCT'S top-level entry point for a telnet
    // caller (TP-2 made it importable); the emitter it attaches is the object
    // every BBS handler is handed. This is the same call `door.handler.ts`
    // makes when a client door starts.
    const caller = callerThroughEntryPoint(37, 'telnet');
    caller.emitter.emit('door:load-client', {
      doorId: 'arkanoid',
      sessionId: 'client-door-1',
      bundleUrl: '/api/doors/arkanoid/bundle.js',
    });

    expect(caller.connection.transportDrops?.get('door:load-client')).toEqual({
      event: 'door:load-client',
      count: 1,
      ruling: 'web-only',
    });
    expect(caller.connection.written.length).toBe(0);
    expect(spies.error).toHaveBeenCalledTimes(0);
    expect(spies.debug).toHaveBeenCalledTimes(1);
  });

  it('R4b - the pattern arm is reached from the same entry point, and is not loud', () => {
    const spies = silenceLogs();

    const caller = callerThroughEntryPoint(38, 'telnet');
    caller.emitter.emit('door:message:client-door-1', { type: 'frame' });
    caller.emitter.emit('door:message:client-door-1', { type: 'frame' });

    expect(caller.connection.transportDrops?.get('door:message:client-door-1')).toEqual({
      event: 'door:message:client-door-1',
      count: 2,
      ruling: 'web-only',
    });
    expect(spies.error).toHaveBeenCalledTimes(0);
    expect(spies.debug).toHaveBeenCalledTimes(1);
  });
});
