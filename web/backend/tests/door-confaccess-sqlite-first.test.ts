/**
 * Regression: 68K door launch handlers must prefer the SQLite-loaded
 * `session.user.confAccess` string over the binary user.data probe
 * `UserDatabaseManager.readConfAccessFromDisk(slotIndex)`.
 *
 * Why: the binary probe reads 10 bytes at `slotIndex * USER_SIZE + 136`
 * and unconditionally pads positions 11-25 with 'X'. The padding is
 * a workaround for the binary's 10-conf ceiling — but it silently
 * misaligns when SQLite `slotNumber` doesn't match the binary record
 * position (which can happen after a regen, an import, or duplicate-
 * name appends).
 *
 * Live symptom (2026-05-20): sysop SQLite confaccess = 25 X's (full
 * access), binary slot 1 (= dbSlot 2 - 1) happened to be a different
 * user's record with zero confaccess bytes. The 11-25 padding then
 * granted only confs 11-N → JoinCnf with CURRENT_CNF=YES + NCONFS=14
 * displayed exactly 4 confs (#11-14), renumbered as [01..04].
 *
 * Same risk applies to user STATS — also pinned here.
 *
 * Grep-style — door.handler.ts can't be loaded under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Door launch prefers SQLite confAccess + stats over binary slot probe', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'door.handler.ts'),
    'utf8'
  );

  test('launchAmigaDoor declares sqlConfAccess from session.user.confAccess', () => {
    // Capture the launchAmigaDoor body up to the closing brace.
    const m = src.match(/async function launchAmigaDoor[\s\S]*?Loaded from bbsConfig\.info/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/sqlConfAccess[\s\S]{0,200}?session\.user\?\.confAccess/);
  });

  test('launchAmigaDoor prefers sqlConfAccess over readConfAccessFromDisk', () => {
    const m = src.match(/async function launchAmigaDoor[\s\S]*?Loaded from bbsConfig\.info/);
    expect(m).not.toBeNull();
    // Pattern: `sqlConfAccess && sqlConfAccess.length > 0 ? sqlConfAccess : readConfAccessFromDisk(slotIndex)`
    expect(m![0]).toMatch(
      /sqlConfAccess\s*&&\s*sqlConfAccess\.length\s*>\s*0[\s\S]{0,200}?sqlConfAccess[\s\S]{0,200}?readConfAccessFromDisk/
    );
  });

  test('launchAmigaDoor synthesizes sqlUserStats from session.user (initial-state fix)', () => {
    const m = src.match(/async function launchAmigaDoor[\s\S]*?Loaded from bbsConfig\.info/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/sqlUserStats[\s\S]{0,400}?messagesPosted/);
    expect(m![0]).toMatch(/sqlUserStats[\s\S]{0,1000}?bytesUpload/);
  });

  test('launchAmigaDoor prefers sqlUserStats over readUserStatsFromDisk', () => {
    const m = src.match(/async function launchAmigaDoor[\s\S]*?Loaded from bbsConfig\.info/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/diskUserStats\s*=\s*sqlUserStats\s*\|\|\s*userDatabaseManager\.readUserStatsFromDisk/);
  });

  test('executeAmigaDoor — second call site — same SQLite-first preference for confAccess', () => {
    // executeAmigaDoor is the other entry point (called for hybrid /
    // BBSCmd doors). Same fix required so the user doesn't hit the
    // bug via a different command.
    const m = src.match(/Ensure disk-based user data is available for 68K doors[\s\S]*?\(session as any\)\.diskUserStats\s*=\s*diskUserStats/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/sqlConfAccess[\s\S]{0,500}?session\.user\?\.confAccess/);
    expect(m![0]).toMatch(/sqlConfAccess\s*&&\s*sqlConfAccess\.length\s*>\s*0/);
  });

  test('executeAmigaDoor — same SQLite-first preference for stats', () => {
    const m = src.match(/Ensure disk-based user data is available for 68K doors[\s\S]*?\(session as any\)\.diskUserStats\s*=\s*diskUserStats/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/sqlUserStats\s*\|\|\s*userDatabaseManager\.readUserStatsFromDisk/);
  });
});
