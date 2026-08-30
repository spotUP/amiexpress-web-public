/**
 * A health check may only report what something actually reads.
 *
 * Health and Deployment showed 25 errors across the conferences and offered
 * an auto-fix for several. Three of the directories it demanded do not exist
 * anywhere in AmiExpress:
 *
 *   Upload      the upload path is whatever ULPATH.n names (express.e:18438),
 *               not a fixed directory beside the conference
 *   Hold        express.e appends 'HOLD' to a FILENAME - the statistics file
 *               SysopStats/NumULs_5HOLD at express.e:18772 - never a directory
 *   SysopStats  real, but at the BBS ROOT: express.e:18718 builds it from
 *               cmds.bbsLoc, not from the conference
 *
 * Fourteen conferences times three is why the count was 25. Pressing the
 * button would have created them all on a live board, and a sysop who did
 * would then be looking at a "healthy" board full of directories nothing
 * opens.
 *
 * The remaining four are each read by something, and one of them - Bulletins -
 * found a real fault the noise was hiding: it exists as an empty FILE in
 * eight conferences, so express.e:24648 cannot build Bulletins/Bull<n> and
 * those conferences answer "No bulletins are available".
 */

import { CONFERENCE_DIRECTORIES } from '../../src/services/conference-setup.service';

describe('the directories a conference is checked for', () => {
  it('asks only for what something reads', () => {
    expect([...CONFERENCE_DIRECTORIES].sort()).toEqual(
      ['Bulletins', 'Files', 'Messages', 'MsgBase'].sort()
    );
  });

  it('does not demand the three that are not real', () => {
    const dirs = CONFERENCE_DIRECTORIES as readonly string[];

    // The upload path is configurable per file area, not a fixed directory.
    expect(dirs).not.toContain('Upload');
    // 'HOLD' is a filename suffix on a statistics file.
    expect(dirs).not.toContain('Hold');
    expect(dirs).not.toContain('HOLD');
    // Real, but at the BBS root - express.e:18718 builds it from cmds.bbsLoc.
    expect(dirs).not.toContain('SysopStats');
  });

  it('keeps the two the message system needs', () => {
    const dirs = CONFERENCE_DIRECTORIES as readonly string[];

    // express.e:2068 - <ConfLocation>MsgBase/
    expect(dirs).toContain('MsgBase');
    // This backend's own store - bbs-paths.util.ts:122
    expect(dirs).toContain('Messages');
  });

  it('keeps Bulletins, which is where the real fault was', () => {
    // express.e:24648 builds <ConfLocation>Bulletins/Bull<n>, so it has to be
    // a directory. Eight conferences have an empty file of that name.
    expect(CONFERENCE_DIRECTORIES as readonly string[]).toContain('Bulletins');
  });
});
