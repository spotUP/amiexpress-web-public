/**
 * Regression test: .lzh archives must route through the same pure-JS
 * extractor as .lha, not the legacy LzhExtractor/lzh-parser path.
 *
 * DOORMAN install of 187-KB1.LZH failed at the extract step with:
 *   Could not read archive: The value of "offset" is out of range.
 *   It must be >= 0 and <= 8. Received 10
 *
 * Root cause: archive-extractor.ts's getExtractorForFile() factory mapped
 * '.lzh' to a separate LzhExtractor that listed entries via lzh-parser,
 * whose Buffer read threw the offset error above on this real archive.
 * LZH and LHA are the same container format; '.lzh' must map to the same
 * LhaExtractor that '.lha' already uses.
 *
 * This test goes through getExtractorForFile() (the exact factory the door
 * installer calls in src/doors/door-installer.ts), not by instantiating an
 * extractor class directly, because the bug was in dispatch, not in either
 * extractor implementation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getExtractorForFile } from '../../src/utils/archive-extractor';

describe('LZH archive dispatch', () => {
  it('routes a .lzh file through the same extractor as .lha and reads real entries', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/archives/187-KB1.lzh');

    // Sanity: the fixture is a genuine archive, not a stub.
    const stat = await fs.stat(fixturePath);
    expect(stat.size).toBe(23596);

    const extractor = await getExtractorForFile(fixturePath);
    expect(extractor).not.toBeNull();

    const entries = await extractor!.getEntries(fixturePath);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBe(65);
    expect(entries.some((e) => e.name === 'commands\\bbscmd\\Kick.info')).toBe(true);

    const kickEntry = entries.find((e) => e.name === 'commands\\bbscmd\\Kick.info');
    expect(kickEntry!.size).toBe(1051);
  });
});
