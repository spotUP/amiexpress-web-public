/**
 * REXX host-port command parser + dispatch registry.
 *
 * #78 Phase 4 (skeleton).
 *
 * When a REXX script does `ADDRESS BBS` then `BBSWRITE "Hello"`,
 * RexxMast packages the command as an argstring (rm_Args[0]) and
 * sends a RexxMsg to our host port. The host-port servicer reads
 * that argstring, parses out the command name + tokenised args, and
 * dispatches to a TS function that does the actual BBS work.
 *
 * Phase 4-skeleton: this file implements parsing + registry shape
 * + a handful of representative handlers. Phase 4-real will:
 *   - Register the host port in MOIRA's public-port list
 *   - Run RexxMast for setup cycles, watching exec.library AddPort
 *     calls until 'REXX' appears
 *   - Service inbound RexxMsgs by calling dispatchHostCommand and
 *     writing rm_Result1 / rm_Result2 / rm_Args[1] back into the msg
 *
 * Command-line shape (from RKRM "Using ARexx" host-port section):
 *   <commandName> <arg1> <arg2> ...
 * Args are whitespace-separated; quoted args (single or double)
 * preserve embedded whitespace.
 */

export interface ParsedHostCommand {
  /** Command name, upper-cased (REXX is case-insensitive on host commands). */
  name: string;
  /** Tokenised arguments — quoted strings collapsed to single tokens. */
  args: string[];
  /** Original command line, useful for echoing in error messages. */
  raw: string;
}

/**
 * Parse a host command line into name + args. Mirrors RexxMast's own
 * parser (whitespace tokeniser + quote-balanced strings). Doesn't
 * try to handle REXX expressions in args — those are evaluated by
 * the script before we see them; what arrives at the host port is
 * always literal strings.
 */
export function parseHostCommand(line: string): ParsedHostCommand {
  const raw = line || '';
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { name: '', args: [], raw };
  }

  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    // Skip whitespace.
    while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
    if (i >= trimmed.length) break;

    const ch = trimmed[i];
    if (ch === '"' || ch === "'") {
      // Quoted token — preserve embedded spaces, allow escaped quote
      // via doubled-quote (REXX convention: '' inside '...' = literal ').
      const quote = ch;
      i++;
      let buf = '';
      while (i < trimmed.length) {
        if (trimmed[i] === quote) {
          if (trimmed[i + 1] === quote) {
            buf += quote;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        buf += trimmed[i++];
      }
      tokens.push(buf);
    } else {
      // Unquoted token — read up to next whitespace.
      let buf = '';
      while (i < trimmed.length && !/\s/.test(trimmed[i])) {
        buf += trimmed[i++];
      }
      tokens.push(buf);
    }
  }

  return {
    name: (tokens[0] || '').toUpperCase(),
    args: tokens.slice(1),
    raw,
  };
}

/**
 * Result envelope a host-command handler returns. Values map onto
 * RexxMsg fields when the message is replied:
 *   result1     → rm_Result1 (LONG, primary status — 0 = success)
 *   result2     → rm_Result2 (LONG, secondary — error code or count)
 *   resultString → an argstring written to rm_Args[1] when set, used
 *                   for commands that produce a string output (e.g.
 *                   BBSREAD returns the typed line).
 */
export interface HostCommandResult {
  result1?: number;
  result2?: number;
  resultString?: string;
}

/**
 * Context passed to host-command handlers — same shape the existing
 * TS interpreter (arexx.service.ts AREXXInterpreter) uses, so handlers
 * can delegate to that implementation rather than re-implementing
 * each BBS API.
 */
export interface HostCommandContext {
  user?: any;
  session?: any;
  socket?: any;
  output: string[];
  environment?: any;
  [key: string]: any;
}

export type HostCommandHandler = (
  args: string[],
  ctx: HostCommandContext,
) => Promise<HostCommandResult>;

/**
 * Default registry — a representative subset of the BBS host
 * commands the TS interpreter exposes. Each handler delegates to
 * the existing AREXXInterpreter implementation so we have one
 * source of truth for BBS semantics regardless of which engine ran
 * the script.
 *
 * Phase 4-real expands this to the full ~40-command set.
 */
const defaultRegistry: Record<string, HostCommandHandler> = {
  // BBSWRITE <text>  — write to user's terminal.
  BBSWRITE: async (args, ctx) => {
    const { AREXXInterpreter } = require('../arexx.service');
    const interp = new AREXXInterpreter(ctx);
    await interp.bbs.BBSWRITE(args.join(' '));
    return { result1: 0 };
  },

  // BBSREAD  — read one line of input from the user.
  BBSREAD: async (_args, ctx) => {
    const { AREXXInterpreter } = require('../arexx.service');
    const interp = new AREXXInterpreter(ctx);
    const line = await interp.bbs.BBSREAD();
    return { result1: 0, resultString: String(line || '') };
  },

  // OUTSTR <text>  — terse alias for BBSWRITE used by classic
  // AmiExpress AREXX scripts.
  OUTSTR: async (args, ctx) => {
    const { AREXXInterpreter } = require('../arexx.service');
    const interp = new AREXXInterpreter(ctx);
    await interp.bbs.BBSWRITE(args.join(' '));
    return { result1: 0 };
  },

  // GETCHAR  — read one character (blocking). Real AmiExpress AREXX
  // uses GC as the shortcut; we register both names.
  GETCHAR: async (_args, ctx) => {
    const { AREXXInterpreter } = require('../arexx.service');
    const interp = new AREXXInterpreter(ctx);
    const ch = await interp.bbs.GETCHAR();
    return { result1: 0, resultString: String(ch || '') };
  },
  GC: async (_args, ctx) => defaultRegistry.GETCHAR(_args, ctx),

  // BBSLOG <level> <message>  — sysop log.
  BBSLOG: async (args, ctx) => {
    const level = args[0] || 'INFO';
    const message = args.slice(1).join(' ');
    const { AREXXInterpreter } = require('../arexx.service');
    const interp = new AREXXInterpreter(ctx);
    await interp.bbs.BBSLOG(level, message);
    return { result1: 0 };
  },
};

/**
 * Mutable registry — Phase 4-real adds more commands; tests can swap
 * in stubs without touching the default set.
 */
let registry: Record<string, HostCommandHandler> = { ...defaultRegistry };

export function registerHostCommand(name: string, handler: HostCommandHandler): void {
  registry[name.toUpperCase()] = handler;
}

export function unregisterHostCommand(name: string): void {
  delete registry[name.toUpperCase()];
}

export function hasHostCommand(name: string): boolean {
  return registry[name.toUpperCase()] !== undefined;
}

export function _resetHostCommandRegistry(): void {
  registry = { ...defaultRegistry };
}

/**
 * Dispatch a parsed command. Unknown commands produce a non-zero
 * rm_Result1 — REXX scripts can read this via the SIGL/RC special
 * variables and react. Command-handler exceptions become a result1=20
 * (SEVERE per RKRM convention) with rm_Args[1] holding the message.
 */
export async function dispatchHostCommand(
  parsed: ParsedHostCommand,
  ctx: HostCommandContext,
): Promise<HostCommandResult> {
  if (!parsed.name) {
    return { result1: 5, result2: 0, resultString: 'empty command line' };
  }
  const handler = registry[parsed.name];
  if (!handler) {
    return {
      result1: 10, // ERROR per RKRM 'Using ARexx' (return-code conventions)
      result2: 0,
      resultString: `unknown command: ${parsed.name}`,
    };
  }
  try {
    return await handler(parsed.args, ctx);
  } catch (err: any) {
    return {
      result1: 20, // SEVERE
      result2: 0,
      resultString: `${parsed.name} failed: ${err?.message || err}`,
    };
  }
}

/** Convenience wrapper for callers that only have the raw line. */
export async function dispatchHostCommandLine(
  line: string,
  ctx: HostCommandContext,
): Promise<HostCommandResult> {
  return dispatchHostCommand(parseHostCommand(line), ctx);
}
