/**
 * User stats screen (`S` command, handleUserStatsCommand,
 * express.e:25540-25568 internalCommandS()) — Area Name line.
 *
 * P3-1 (SYS_RELATIVE_CONFS): the Area Name line (express.e:25554-25556) is
 * gated on `sopt.toggles[TOGGLES_CONFRELATIVE]=FALSE` — real AmiExpress
 * hides the caller's absolute area name once SYS_RELATIVE_CONFS is on,
 * because a relative conference number would no longer match it. This
 * port showed Area Name unconditionally, and separately read the toggle
 * from a tooltype name ('CONFRELATIVE') nothing ever wrote — the real key,
 * written by axSetupTool/frmSettingsEdit.e:696 and consumed by
 * ACP.e:2698-2703, is RELATIVE_CONFERENCES.
 *
 * (P2-20, the Protocol line on this same screen, landed upstream as
 * 2a56bf709 and is not covered here.)
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';

import { handleUserStatsCommand } from '../../src/handlers/commands/user-commands.handler';
import { ACSPermission } from '../../src/constants/acs-permissions';

function fakeSocket() {
  const lines: string[] = [];
  return {
    emit: (event: string, data?: string) => {
      if (event === 'ansi-output' && typeof data === 'string') lines.push(data);
    },
    connected: true,
    output: () => lines.join(''),
  };
}

/**
 * securityFlags is a per-character T/F/? override string
 * (utils/acs.util.ts checkSecurity, express.e:8462-8465). Setting
 * DISPLAY_USER_STATS='T' and SHOW_PAYMENTS='F' explicitly avoids the
 * disk-backed ACS-level fallback entirely, so the test never depends on
 * Access/*.info files existing.
 */
function securityFlagsAllowing(...trueIndexes: number[]): string {
  const max = Math.max(ACSPermission.DISPLAY_USER_STATS, ACSPermission.SHOW_PAYMENTS) + 1;
  const flags = new Array(max).fill('?');
  flags[ACSPermission.SHOW_PAYMENTS] = 'F';
  for (const i of trueIndexes) flags[i] = 'T';
  return flags.join('');
}

function baseSession(bbsPath?: string) {
  return {
    bbsPath,
    currentConf: 1,
    user: {
      username: 'tester',
      secLevel: 50,
      securityFlags: securityFlagsAllowing(ACSPermission.DISPLAY_USER_STATS),
      conferenceAccess: 'Main Board',
    },
  } as any;
}

describe('handleUserStatsCommand — Area Name line (P3-1 SYS_RELATIVE_CONFS)', () => {
  let bbsRoot: string;

  beforeEach(() => {
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relative-confs-'));
  });

  afterEach(() => {
    fs.rmSync(bbsRoot, { recursive: true, force: true });
  });

  it('shows Area Name when SYS_RELATIVE_CONFS is off (absolute numbering, the default)', () => {
    const socket = fakeSocket();
    const session = baseSession(bbsRoot);

    handleUserStatsCommand(socket as any, session);

    expect(socket.output()).toContain('Area Name');
    expect(socket.output()).toContain('Main Board');
  });

  it('hides Area Name once SYS_RELATIVE_CONFS is on (express.e:25554)', () => {
    fs.writeFileSync(path.join(bbsRoot, 'bbsConfig.info.txt'), 'RELATIVE_CONFERENCES\n');
    const socket = fakeSocket();
    const session = baseSession(bbsRoot);

    handleUserStatsCommand(socket as any, session);

    expect(socket.output()).not.toContain('Area Name');
  });
});
