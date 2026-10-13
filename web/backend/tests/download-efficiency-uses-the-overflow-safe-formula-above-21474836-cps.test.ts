/**
 * calcEfficiency (express.e:413-421): cps*100/(baud/10), but above 21474836 cps the order flips to
 * (cps/(baud/10))*100 so the multiply cannot overflow a 32-bit LONG. Reached through the real
 * runPostDownload stats line (express.e:20262), which prints the efficiency.
 * The in-range case (106%) is pinned in post-download-pipeline.test.ts.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/UserFileManager', () => ({ userFileManager: { updateUserDataFile: jest.fn() } }));
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: async () => undefined,
  writeToCallersLog: async () => undefined,
  writeToUDLog: async () => undefined,
}));
jest.mock('../src/utils/display-ul-stats.util', () => ({ emitULStats: jest.fn() }));
jest.mock('../src/handlers/command.handler', () => ({ advanceDisplayFlow: async () => undefined }));

import { runPostDownload } from '../src/services/post-download.service';

const NOW = 1_800_000_000_000;

async function efficiencyFor(cps: number): Promise<string> {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const out: string[] = [];
  const emitter = { emit: (_e: string, p: unknown) => { out.push(String(p)); return true; } };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 'u1', username: 'sysop', securityFlags: 'T'.repeat(64) } };
  // 2 seconds of transfer at the requested cps; onlineBaud defaults to 38400 -> baud/10 = 3840.
  await runPostDownload(emitter as never, session, { downloadStartTime: NOW - 2000, downloadedFiles: 1, downloadedBytes: cps * 2, success: true });
  const m = out.join('').match(/(\d+)% efficiency/);
  return m ? m[1] : 'none';
}

afterEach(() => jest.restoreAllMocks());

test('at 21474836 cps the multiply-first branch is still used (559240%)', async () => {
  expect(await efficiencyFor(21474836)).toBe('559240'); // Div(Mul(cps,100),3840)
});

test('above 21474836 cps the divide-first branch is used (781200%, not 781250%)', async () => {
  expect(await efficiencyFor(30000000)).toBe('781200'); // Mul(Div(30000000,3840)=7812,100)
});
