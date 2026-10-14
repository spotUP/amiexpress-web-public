/**
 * A door the width gate refuses must not take the COMMAND down with it.
 *
 * The sysop's report, three days open: "I cannot list files on my C64."
 * `Commands/BBSCmd/f.info`, `fr.info` and `scan.info` register the 68K door
 * AquaScan over F/FR/N, `Z.info` registers one over Z, and dispatch asks
 * BBSCMD before the internal switch (express.e:28228). So on a 40-column
 * PETSCII session the door won the command, `executeDoor`'s MIN_COLUMNS gate
 * printed THIS DOOR NEEDS AN 80 COLUMN SCREEN, and the caller went back to the
 * menu - while this board's own file listing, which it renders perfectly well
 * at 40 columns, sat one tier below and was never reached.
 *
 * The ruling (open backlog 11.1, sysop 2026-09-06): a refused door falls
 * through to the internal command of the same name. A command with NO internal
 * equivalent is refused exactly as before - a refusal never becomes silence.
 *
 * Everything here drives the REAL chain, the same one door-min-columns-dispatch
 * pins: initializeDoors() -> getDoors() -> setDoorsForCommandHandler() ->
 * setCommandExecutionDependencies() (server/initialization.ts:757, the wiring
 * that makes BBSCMD outrank the internal switch) -> handleCommand() ->
 * processCommand() -> executeDoor(). The assertions are on what the CALLER
 * receives, because the whole bug was that the right code existed and was
 * unreachable. `createAllDropFiles` is the launch sentinel: executeDoor calls
 * it immediately before the door-type switch, so "not called" means the door
 * really was refused.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  installDispatchHarness, doorOver, register, makeSocket, allOutput, c64Session, ansiSession,
  doorDropFileManager, executeDoor, getDoors,
} from './dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

/** One DIR entry in the on-disk format express.e writes: 12-char name, space, status. */
const dirLine = (filename: string, desc: string) =>
  `${filename.padEnd(12)} P   12K  23-Oct-25  ${desc}`;

// The conference the caller is in, with two files in directory 1. No
// ConfConfig.info, so conferenceDir() falls back to Conf<n> (its documented
// default for a board that has never been renumbered).
installDispatchHarness((root) => {
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  // The icon declares the one file area (express.e 5006/15264 read NDIRS).
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
  fs.writeFileSync(
    path.join(root, 'Conf1', 'DIR1'),
    [dirLine('CHASE.LHA', 'A demo'), dirLine('SCOOPEX.LHA', 'Another one'), ''].join('\r\n'),
    'latin1'
  );
});

/**
 * The OTHER forty-column caller: teletext. Same grid as the C64 and none of
 * the transduction - and the sysop's report on 2026-09-14 was that an
 * 80-column door (Joincnf, over J) ran for one of these, which is the very
 * thing this file exists to prevent for the C64.
 */
function teletextSession(commandText: string): any {
  return {
    ...c64Session(commandText),
    terminalType: 'ansi',
    petsciiMode: false,
    texttvMode: true,
    screenWidth: 40,
  };
}

/*
 * F and FR are sent with `A`: a bare F asks "Directories: ..." first, as
 * express.e's getDirSpan('') does (27647, eed158efe); this file is about which
 * handler a forty-column caller reaches, not that prompt.
 */
describe('a 40-column caller who types FR gets the file list', () => {
  beforeEach(async () => {
    await register(doorOver('FR'));
  });

  it('receives the listing, not THIS DOOR NEEDS AN 80 COLUMN SCREEN', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR A'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    // FR is the reverse listing (express.e:24883) - F below is the forward one.
    expect(out).toContain('Reverse scanning directory 1');
    expect(out).toContain('CHASE.LHA');
    expect(out).toContain('SCOOPEX.LHA');
  });

  it('still refuses the DOOR - the fall-through is a refusal, not an opening', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR'), '');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('refuses the door for a TELETEXT caller too, and falls through', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, teletextSession('FR A'), '');

    const out = allOutput(socket);
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('Reverse scanning directory 1');
  });

  it('gives a TELETEXT caller the board\'s own screen, not the adapted door', async () => {
    /*
     * The adapter makes a wide door legible at forty columns; it cannot make
     * it teletext. A teletext caller who typed J got Joincnf's eighty-column
     * banner squeezed to forty while this board's own conference page - drawn
     * in mosaics - sat one tier below (sysop, 2026-09-14). The door here
     * declares C64_ADAPT, so the width gate WOULD let it through.
     */
    await register(doorOver('FR', { C64_ADAPT: '40', MIN_COLUMNS: '80' }));
    const socket = makeSocket();
    await handleCommand(socket as any, teletextSession('FR A'), '');

    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(allOutput(socket)).toContain('Reverse scanning directory 1');
  });

  it('leaves a C64 caller\'s adapted door alone - it has no PETSCII art to prefer', async () => {
    // Deliberately NOT symmetrical: this board has .seq art for almost
    // nothing, and an adapted door beats no door. The clause takes petscii
    // the day the art exists.
    //
    // The door has to be one the adapter really carries (XIM), or the width
    // gate refuses it for its type and both callers end up in the internal
    // tier for reasons that have nothing to do with the clause under test.
    await register({ ...doorOver('FR', { C64_ADAPT: '40', MIN_COLUMNS: '80' }), type: 'XIM' });
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR'), '');

    // createAllDropFiles is executeDoor's launch sentinel: it runs
    // immediately before the door-type switch, so "called" means the C64
    // caller really did reach the door.
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalled();
  });

  it('and the teletext caller skips that same door', async () => {
    await register({ ...doorOver('FR', { C64_ADAPT: '40', MIN_COLUMNS: '80' }), type: 'XIM' });
    const socket = makeSocket();
    await handleCommand(socket as any, teletextSession('FR A'), '');

    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(allOutput(socket)).toContain('Reverse scanning directory 1');
  });

  it('leaves the door serving 80-column callers exactly as before', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, ansiSession('FR'), '');

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('canning directory 1');
  });

  it('clears the fall-through arm off the session when the command is done', async () => {
    const session = c64Session('FR');
    await handleCommand(makeSocket() as any, session, '');
    expect(session.widthGateFallThrough).toBeUndefined();
  });
});

describe('a 40-column caller who types F gets the file list', () => {
  it('reaches the internal F handler the same way FR does', async () => {
    await register(doorOver('F'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('F A'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('Scanning directory 1');
    expect(out).toContain('CHASE.LHA');
  });
});

describe('a 40-column caller who types Z reaches the zippy search', () => {
  it('is asked for a search string instead of being sent back to the menu', async () => {
    await register(doorOver('Z'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('Z'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('Enter string to search for:');
  });

  /**
   * A command that prompts keeps its prompt after a door is refused for width.
   *
   * The sysop's follow-up the same day: "z takes a hotkey instead of a string."
   * The fall-through above is what first brought him to this prompt, and the
   * prompt then consumed a single keypress - his C was the whole search string.
   * The fall-through hands the internal handler the command and nothing else:
   * the sub-state it sets is the caller's to answer, one LINE at a time
   * (utils/line-input.util LINE_PROMPT_SUBSTATES, express.e:26151).
   */
  it('lets me type a whole search string at that prompt, not one key', async () => {
    await register(doorOver('Z'));
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');

    for (const ch of 'CHASE') {
      await handleCommand(socket as any, session, ch);
      // Every letter of it is still the search string being typed.
      expect(session.subState).toBe(LoggedOnSubState.ZIPPY_SEARCH_INPUT);
    }
    await handleCommand(socket as any, session, '\r');
    for (const ch of '1\r') {
      await handleCommand(socket as any, session, ch);
    }

    const out = allOutput(socket);
    expect(out).toContain('Enter string to search for: CHASE');
    expect(out).toContain('CHASE.LHA');
  });
});

describe('a command with no internal equivalent still refuses', () => {
  it('prints THIS DOOR NEEDS AN 80 COLUMN SCREEN and returns to the menu', async () => {
    // DOORMAN is a door and nothing else - it is not one of the commands the
    // BBS answers itself, so there is no tier below to fall to.
    await register(doorOver('DOORMAN'));
    const socket = makeSocket();
    const session = c64Session('DOORMAN');
    await handleCommand(socket as any, session, '');

    const out = allOutput(socket);
    expect(out).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).not.toContain('No such command!!');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('says it once, not once per dispatch tier', async () => {
    await register(doorOver('DOORMAN'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('DOORMAN'), '');

    const hits = allOutput(socket).split('THIS DOOR NEEDS AN 80 COLUMN SCREEN').length - 1;
    expect(hits).toBe(1);
  });
});

describe('the arm belongs to one launch and is never inherited', () => {
  it('is cleared by a door that PASSES the gate, so a door it launches cannot use it', async () => {
    await register(doorOver('WIDE40', { MIN_COLUMNS: '40' }));
    const door = getDoors().find((d) => d.command === 'WIDE40');
    const session = c64Session('WIDE40');
    session.widthGateFallThrough = 'ARMED';

    await executeDoor(makeSocket() as any, session, door as any);

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(session.widthGateFallThrough).toBeUndefined();
  });

  it('reports REFUSED only to a caller that armed it, and prints nothing then', async () => {
    await register(doorOver('FR'));
    const door = getDoors().find((d) => d.command === 'FR');
    const socket = makeSocket();
    const session = c64Session('FR');
    session.widthGateFallThrough = 'ARMED';

    await executeDoor(socket as any, session, door as any);

    expect(session.widthGateFallThrough).toBe('REFUSED');
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('prints the notice when nobody armed it - executeDoor reached any other way', async () => {
    await register(doorOver('FR'));
    const door = getDoors().find((d) => d.command === 'FR');
    const socket = makeSocket();
    const session = c64Session('FR');

    await executeDoor(socket as any, session, door as any);

    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
