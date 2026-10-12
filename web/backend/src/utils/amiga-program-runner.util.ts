/**
 * The one launcher for a 68K program the board runs HEADLESS: a batch line's
 * door (quicknew, mtop), an upload's FCheck CHECKER (mULTI-cHECK), anything
 * that is started by the board rather than by a caller at a prompt.
 *
 * It spawns scripts/run-amiga-door.ts, whose dos.library resolves the node's
 * assigns (dos/standard-assigns.ts) and runs the program and whatever it
 * Execute()s or SystemTagList()s. What the program wrote to Output() comes
 * back as `output`; a caller that wants it in a file (a batch line's `>file`,
 * express.e's OutPut_Of_Test) writes it. Drop files are NOT made here: a
 * program that reads DOOR.SYS is a door, and its caller makes the file.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from './amigafs';
import { boardRoot } from './board-root.util';
import { InfoFileParser } from '../services/info-file-parser';

/**
 * Get door type from .info file (TYPE tooltype)
 * Returns 'XIM' for XIM doors, 'SIM' as default for plain AmigaDOS executables
 */
export function getDoorTypeFromInfo(doorPath: string): string {
  const infoPath = doorPath + '.info';
  // `QuickNew.info`, `QUICKNEW.INFO` - a door brought over from a real Amiga
  // can be spelled either way, and getting this wrong silently downgrades the
  // door to the SIM default.
  if (!amigafs.existsSync(infoPath)) {
    return 'SIM'; // Default for doors without .info files
  }

  try {
    const buffer = amigafs.readFileSync(infoPath) as Buffer;
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    // Look for TYPE tooltype (e.g., TYPE=XIM)
    const typeValue = parsed.toolTypes.get('TYPE');
    if (typeValue) {
      const upperType = typeValue.toUpperCase();
      // Valid door types: XIM, AIM, SIM, TIM
      if (['XIM', 'AIM', 'SIM', 'TIM'].includes(upperType)) {
        return upperType;
      }
    }
    return 'SIM'; // Default
  } catch (err) {
    console.warn(`[AmigaProgramRunner] Failed to read ${infoPath}: ${err}`);
    return 'SIM'; // Default on error
  }
}

/*
 * EVERY BATCH DOOR RUNS FAST, not a list of four somebody remembered.
 *
 * "raise it as much as we can without breaking it it goes for all batch doors"
 * - the sysop, 2026-09-15, after a logoff took minutes.
 *
 * A batch door is not interactive by definition: no caller waits at a prompt,
 * it does file I/O and exits. That is the shape the bench found safe to run
 * very fast, and it is why this is a RULE rather than a list - a new batch door
 * gets it without anyone remembering to add a line.
 *
 * WHY 25000 AND NOT MORE. `dev/scripts/bench-overclock.ts`
 * (report-overclock.json, 324 doors): 294 safe at 100000x, 4 whose ceiling is
 * 25000x, and NONE capped at or below 5000x - so the old 5000x floor was five
 * times more cautious than the evidence asked, and 25000x is the highest figure
 * no benched door fails at. 100000x is faster and breaks those four.
 *
 * WHAT IT ACTUALLY BUYS, measured on this board's own doors rather than taken
 * from the bench: ByteKillHandler 10s -> 6s with byte-identical output.
 * QuickNew does not move (16s either way) because its time is emulator STARTUP,
 * not CPU - which is worth knowing before anyone reaches for this dial again to
 * make QuickNew faster.
 *
 * The interactive default stays at 100x deliberately - see DoorLifecycleManager:
 * a live binary variant the bench never saw (AquaScan.000) failed to START at
 * 25000x, and a caller watching a door refuse to open is a worse trade than a
 * batch job taking longer.
 */
export const BATCH_OVERCLOCK_FLOOR = 25000;

/**
 * A batch door that must run SLOWER than the floor, by name. Empty on purpose:
 * nothing in the bench caps below 25000x, and an entry here should cite the run
 * that justifies it rather than a hunch.
 */
export const BATCH_OVERCLOCK_CAPS: Record<string, number> = {};

/**
 * The factor a batch door runs at.
 *
 * A door's own `OVERCLOCK` tooltype may ask for MORE and is honoured; it cannot
 * ask for less, because tooltypes were written for real hardware and being
 * conservative there is exactly why these doors were slow.
 */
export function batchOverclockFor(doorName: string, fromInfo?: number): number {
  const floored = Math.max(fromInfo ?? 0, BATCH_OVERCLOCK_FLOOR);
  const cap = BATCH_OVERCLOCK_CAPS[doorName.toLowerCase()];
  return cap === undefined ? floored : Math.min(floored, cap);
}

export interface RunAmigaProgramOptions {
  /** The node whose NODE<n>: volume the program sees. */
  nodeId: number;
  /** Arguments as the shell passes them (quotes kept where the program parses them). */
  args?: string[];
  /** Working directory of the runner process. Default: the program's directory. */
  cwd?: string;
  envOverrides?: Record<string, string>;
  /** Default: read from the program's .info, SIM without one. */
  doorType?: string;
  /** Kill the program after this long. Default: 30 s for a SIM utility, 300 s otherwise. */
  timeoutMs?: number;
  /**
   * The program's stack in bytes: express.e:18580 NP_STACKSIZE for a file
   * checker (the FCheck icon's STACK, 4096 when absent). DoorLoader's own
   * 256 KB floor still applies to anything smaller. There is no priority
   * option: express.e:18581 NP_PRIORITY orders tasks, and this emulator runs
   * one task, so a priority has nothing to act on.
   */
  stackSize?: number;
}

export interface RunAmigaProgramResult {
  /** What the program wrote to its Output(), last 256 KB. Nothing of the runner's own. */
  output: string;
  /** The runner's exit code; null when it could not start. */
  code: number | null;
  /** The timeout killed it. */
  killed: boolean;
}

/**
 * Run one 68K program and wait for it. Never rejects: a runner that cannot
 * start or is killed is reported in the result, as the batch has always
 * treated it (a missing door must not stop the logoff).
 */
export function runAmigaProgram(doorPath: string, options: RunAmigaProgramOptions): Promise<RunAmigaProgramResult> {
  const { nodeId, args = [], cwd, envOverrides } = options;
  // The checkout / image tree, as this launcher has always found the runner
  // (not codeRoot(): BBS_ROOT there is a board override, not the code).
  const appRootPath = path.resolve(__dirname, '../../../..');
  const bbsRoot = boardRoot();
  // BBS:, DOORS:, C: and the rest come from the emulator's one assign table
  // (amiga-emulation/api/dos/standard-assigns.ts) on the same board root;
  // the runner adds only this node's own NODE<n>: volume.
  const assigns: Record<string, string> = {
    [`Node${nodeId}:`]: path.join(bbsRoot, `Node${nodeId}`),
  };

  // Read OVERCLOCK tooltype from the door's .info so headless invocations
  // honour the same speed boost interactive doors get. Without this,
  // every door runs at DoorLifecycleManager's 100x default - fine
  // for tiny utilities, far too slow for ones that walk large data
  // (mtop reads the full user.data; SAmiLog scans every CallersLog).
  // The rule lives at module scope so it can be tested; see batchOverclockFor.
  let batchOverclock: number | undefined;
  try {
    const infoPath = doorPath + '.info';
    if (fs.existsSync(infoPath)) {
      const buf = fs.readFileSync(infoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buf);
      const raw = parsed.toolTypes.get('OVERCLOCK');
      if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) batchOverclock = n;
      }
    }
  } catch { /* fall through to default */ }
  // The floor lifts every batch door; a cap, if one is ever justified, lowers
  // that one door again. A door's own OVERCLOCK tooltype can ask for MORE and
  // is honoured; it cannot ask for less, because the reason batch doors were
  // slow in the first place was conservative tooltypes written for real
  // hardware.
  batchOverclock = batchOverclockFor(path.basename(doorPath), batchOverclock);

  return new Promise<RunAmigaProgramResult>((resolve) => {
    const runnerPath = path.join(appRootPath, 'web', 'backend', 'dist', 'scripts', 'run-amiga-door.js');
    const resolvedRunner = fs.existsSync(runnerPath) ? runnerPath : path.join(appRootPath, 'web', 'backend', 'src', 'scripts', 'run-amiga-door.ts');

    const useTsRunner = resolvedRunner.endsWith('.ts');
    const command = useTsRunner ? 'npx' : 'node';
    // Some headless programs (quicklogon, ByteKillHandler) are actually XIM
    // doors that need XIM protocol polling to communicate with the BBS.
    const doorType = options.doorType ?? getDoorTypeFromInfo(doorPath);
    console.log(`[AmigaProgramRunner] Running ${path.basename(doorPath)} as type ${doorType} (overclock=${batchOverclock}x)`);
    const toolTypes = {}; // Use DoorLifecycleManager defaults
    const stackArgs = options.stackSize && options.stackSize > 0 ? ['--stack', String(Math.floor(options.stackSize))] : [];
    const execArgs = useTsRunner
      ? ['tsx', resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType, ...stackArgs]
      : [resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType, ...stackArgs];

    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      // The runner's board root is this process's, not whatever the
      // environment happened to say when it started (config.dataDir can be
      // changed at runtime; boardRoot() follows it).
      BBS_DATA_DIR: bbsRoot,
      ...envOverrides,
      TS_NODE_TRANSPILE_ONLY: 'true',
    };
    if (useTsRunner) {
      // cwd below is deliberately the door's own directory (doors expect to
      // find/write their data files there), but tsx resolves its tsconfig
      // from cwd - so it never found web/backend/tsconfig.json's
      // experimentalDecorators:true, and any door pulling in a decorated
      // class (ChatHandler's @injectable/@inject) crashed on transform.
      // Point tsx at the right tsconfig directly, independent of cwd.
      spawnEnv.TSX_TSCONFIG_PATH = path.join(appRootPath, 'web', 'backend', 'tsconfig.json');
    }
    if (batchOverclock !== undefined && spawnEnv.DOOR_OVERCLOCK === undefined) {
      // DoorLifecycleManager checks DOOR_OVERCLOCK first and falls back to
      // config.overclockFactor - passing as env keeps the existing
      // priority chain intact without touching the runner's CLI.
      spawnEnv.DOOR_OVERCLOCK = String(batchOverclock);
    }
    console.log(`[AmigaProgramRunner] spawn env DOOR_OVERCLOCK=${spawnEnv.DOOR_OVERCLOCK ?? '(unset)'} for ${path.basename(doorPath)}`);
    const child: any = require('child_process').spawn(command, execArgs, {
      // The TS runner MUST run from web/backend: tsx resolves tsconfig by
      // walking up from cwd, and from a door's own directory it finds the
      // repo root's config, which has no experimentalDecorators - the
      // runner then dies on chat.handler.ts before doing anything, on
      // every scheduler tick ("[runner:mtop] ... Parameter decorators only
      // work when experimental decorators are enabled"). Dev-only in
      // practice: the container ships dist/ and takes the node branch.
      // Every path the runner receives is absolute, so cwd carries no
      // meaning for it beyond config resolution.
      cwd: useTsRunner ? path.join(appRootPath, 'web', 'backend') : (cwd || path.dirname(doorPath)),
      env: spawnEnv,
      detached: true, // Create new process group so we can kill the entire tree
    });
    // run-amiga-door.ts waits for stdin EOF when not a TTY (to support
    // scripted-input from the corpus runner). Headless programs have no input
    // script - close stdin immediately so the runner doesn't block forever.
    child.stdin?.end();

    // Timeout to prevent stuck doors from running forever
    // - XIM doors (interactive): 300s to allow for user interaction
    // - SIM doors (utilities): 30s since they should complete quickly
    // - mtop is an exception - it's XIM and needs 300s for large user databases
    const doorName = path.basename(doorPath).toLowerCase();
    const isSimUtility = doorType === 'SIM';
    // mtop walks the entire user.data - on a real BBS with hundreds of users
    // this can take well past 30s under the 68K emulator. Give it the same
    // 300s budget XIM doors get even though its .info classifies it as SIM.
    const needsLongTimeout =
      doorName === 'mtop' ||
      doorName === 'multitop' ||
      doorName === 'bytekillhandler' ||
      doorName === 'quicknew';
    const DOOR_TIMEOUT = options.timeoutMs ?? ((isSimUtility && !needsLongTimeout) ? 30000 : 300000);
    let killed = false;
    const timeoutHandle = setTimeout(() => {
      if (!child.killed && child.pid) {
        console.warn(`[AmigaProgramRunner] ${path.basename(doorPath)} timed out after ${DOOR_TIMEOUT / 1000}s, killing process tree (pid ${child.pid})`);
        killed = true;
        try {
          // AGGRESSIVE KILL: Use pkill to kill ALL processes matching the door name
          // This is necessary because npm/npx don't create proper process groups
          const doorBase = path.basename(doorPath);
          const { execSync } = require('child_process');

          // First try process group kill
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (e1: any) {
            console.warn(`[AmigaProgramRunner] Process group kill failed: ${e1.message}`);
          }

          // Then kill by name (catches npm/npx children)
          try {
            execSync(`pkill -9 -f "${doorBase}"`, { stdio: 'ignore' });
            console.warn(`[AmigaProgramRunner] Killed all processes matching: ${doorBase}`);
          } catch {
            // pkill returns non-zero if no processes found, ignore
          }

          // Finally, direct kill of child
          child.kill('SIGKILL');
        } catch (e: any) {
          console.error(`[AmigaProgramRunner] Failed to kill door: ${e.message}`);
        }
      }
    }, DOOR_TIMEOUT);

    const MAX_OUTPUT_LENGTH = 256 * 1024; // keep last 256 KB
    let output = '';
    const appendOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(output.length - MAX_OUTPUT_LENGTH);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      appendOutput(chunk);
    });
    // stderr = debug/log output from the runner. Don't include in the
    // output (which captures what the program wrote), but DO surface
    // it to the parent backend log so we can see runner-side errors and
    // verify env propagation (e.g. [DoorLifecycleManager] Overclocking).
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.trim().length > 0) {
        process.stderr.write(`[runner:${path.basename(doorPath)}] ${line}`);
      }
    });
    child.on('error', (err: any) => {
      clearTimeout(timeoutHandle);
      console.warn(`[AmigaProgramRunner] runner failed to start: ${err.message}`);
      resolve({ output: '', code: null, killed: false });
    });
    child.on('close', (code: number) => {
      clearTimeout(timeoutHandle);
      const trimmed = output.trim();
      if (killed) {
        console.warn(`[AmigaProgramRunner] ${path.basename(doorPath)} was killed due to timeout`);
      } else if (code !== 0) {
        console.warn(`[AmigaProgramRunner] runner exited with code ${code}`);
        if (trimmed) {
          console.warn(`[AmigaProgramRunner] Runner output:\n${trimmed}`);
        }
      }
      if (trimmed) {
        try {
          const logFile = path.join(appRootPath, 'logs', 'door-68k.log');
          fs.appendFileSync(logFile, `[BatchRunner] door=${doorPath} node=${nodeId} code=${code}\n${trimmed}\n`, { encoding: 'utf8' });
        } catch {
          /* ignore */
        }
      }
      resolve({ output, code, killed });
    });
  });
}
