/**
 * A 68K door finding out where it is running.
 *
 * "the 68k door can't display petscii unless they run in amiexpress-web so
 * they need to detect where they are running" (sysop, 2026-09-02).
 *
 * The board publishes AE_HOST and friends into the door's environment. The
 * cases that matter are the two ends of it: a C64 caller must be told
 * `petscii` (the transducer is real for them), and a door that finds no
 * AE_HOST at all is on classic AmiExpress and must have been told nothing
 * that would make it emit PETSCII.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AE_HOST_ID,
  AE_HOST_VAR,
  AE_CAPS_VAR,
  AE_HOST_VERSION_VAR,
  AE_CLIENT_VAR,
  AE_CONNECTION_VAR,
  AE_CAPABILITIES,
  BOARD_VERSION,
  capabilitiesFor,
  capsInclude,
  factsFromSession,
  hostVars,
} from '../src/amiga-emulation/utils/host-vars';
import { initializeENVFiles } from '../src/amiga-emulation/utils/env-initializer';

describe('what the board tells a door', () => {
  it('names itself, so a door can tell this host from a classic one', () => {
    const vars = hostVars(factsFromSession({ connectionType: 'web' }, BOARD_VERSION));
    expect(vars[AE_HOST_VAR]).toBe(AE_HOST_ID);
    expect(vars[AE_HOST_VERSION_VAR]).toBe(BOARD_VERSION);
  });

  it('tells a C64 caller that PETSCII is real for them', () => {
    const facts = factsFromSession({ connectionType: 'telnet', terminalType: 'c64' }, '1.0.0');
    expect(facts.client).toBe('petscii');

    const caps = hostVars(facts)[AE_CAPS_VAR];
    expect(capsInclude(caps, AE_CAPABILITIES.petscii)).toBe(true);
    expect(capsInclude(caps, AE_CAPABILITIES.c64adapt)).toBe(true);
  });

  it('does not offer PETSCII to a caller who reads ANSI', () => {
    const caps = hostVars(factsFromSession({ connectionType: 'telnet' }, '1.0.0'))[AE_CAPS_VAR];
    expect(capsInclude(caps, AE_CAPABILITIES.ansi)).toBe(true);
    expect(capsInclude(caps, AE_CAPABILITIES.petscii)).toBe(false);
  });

  it('offers a wide terminal and the mouse only to the browser', () => {
    const web = hostVars(factsFromSession({ connectionType: 'web' }, '1.0.0'))[AE_CAPS_VAR];
    expect(capsInclude(web, AE_CAPABILITIES.wide)).toBe(true);
    expect(capsInclude(web, AE_CAPABILITIES.mouse)).toBe(true);

    for (const connectionType of ['telnet', 'ssh']) {
      const caps = hostVars(factsFromSession({ connectionType }, '1.0.0'))[AE_CAPS_VAR];
      expect(capsInclude(caps, AE_CAPABILITIES.wide)).toBe(false);
      expect(capsInclude(caps, AE_CAPABILITIES.mouse)).toBe(false);
    }
  });

  it('reads an explicit petsciiMode as well as a c64 terminal type', () => {
    // connection-emitter.ts routes on either, so the door must be told either.
    expect(factsFromSession({ petsciiMode: true }, '1').client).toBe('petscii');
    expect(factsFromSession({ terminalType: 'c64' }, '1').client).toBe('petscii');
  });

  it('answers something usable for a session it does not recognise', () => {
    // A door start must not throw because a session shape drifted.
    const facts = factsFromSession(undefined, '1.0.0');
    expect(facts.connection).toBe('web');
    expect(facts.client).toBe('ansi');
    expect(capabilitiesFor(facts)).toContain(AE_CAPABILITIES.ansi);
  });

  it('reads a capability the way a door does - out of the string', () => {
    expect(capsInclude('ansi,petscii,c64adapt', 'petscii')).toBe(true);
    expect(capsInclude('ansi,petscii', 'mouse')).toBe(false);
    expect(capsInclude('', 'ansi')).toBe(false);
    expect(capsInclude(undefined, 'ansi')).toBe(false);
    // A door must not be able to match a capability by prefix.
    expect(capsInclude('ansi,petscii', 'pet')).toBe(false);
  });
});

describe('ENV: files, for a door that reads them as files', () => {
  const envDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'ae-env-'));

  it('writes the host files, with the per-caller ones named by node', () => {
    const dir = envDir();
    initializeENVFiles(dir, {
      nodeId: 3,
      host: factsFromSession({ connectionType: 'telnet', terminalType: 'c64' }, '1.0.0'),
    });

    expect(fs.readFileSync(path.join(dir, AE_HOST_VAR), 'utf8')).toBe(AE_HOST_ID);
    // The directory is shared by every node, so what one CALLER can be sent
    // has to carry the node number or node 3 would answer for node 4.
    expect(fs.readFileSync(path.join(dir, `${AE_CLIENT_VAR}.3`), 'utf8')).toBe('petscii');
    expect(fs.readFileSync(path.join(dir, `${AE_CONNECTION_VAR}.3`), 'utf8')).toBe('telnet');
    expect(capsInclude(fs.readFileSync(path.join(dir, `${AE_CAPS_VAR}.3`), 'utf8'),
      AE_CAPABILITIES.petscii)).toBe(true);
  });

  it('writes no AE_ files at all when nobody said where we are', () => {
    // Which is what classic AmiExpress looks like from inside a door, and is
    // the case a door has to be safe in.
    const dir = envDir();
    initializeENVFiles(dir, { nodeId: 1 });

    const written = fs.readdirSync(dir).filter((name) => name.startsWith('AE_'));
    expect(written).toEqual([]);
  });
});
