/**
 * `?` could not find the board's own help screen.
 *
 * express.e:25083 builds the path from the BOARD: StringF(tempstr,
 * '\sBBSHelp', cmds.bbsLoc). This passed a bare 'BBSHelp', which resolves
 * against whatever directory the process was started in - not where
 * BBSHelp.txt lives - so the command answered "Sorry Help is unavailable at
 * this time" however well the board was set up.
 *
 * The sibling in utility-commands.handler.ts already resolves its HELP
 * directory properly; this was the second copy of one idea, and only one of
 * them had been fixed.
 */
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../src/handlers/commands/system-commands.handler.ts'), 'utf8');

describe('the BBSHelp screen', () => {
  it('is looked for on the board, not beside the process', () => {
    expect(src).toContain("path.join(boardRoot(), 'BBSHelp')");
    // The shape that could never work.
    expect(src).not.toMatch(/const helpBasePath = 'BBSHelp';/);
  });

  it('is asked for with the teletext flag, like its sibling', () => {
    const call = src.slice(src.indexOf('const helpScreenPath'));
    expect(call.slice(0, 220)).toContain('session.texttvMode === true');
  });

  it('has a signature that admits the argument it is given', () => {
    // The injected declaration was a parameter short, so passing texttvMode
    // was a type error rather than the fix it is.
    expect(src).toMatch(/petsciiMode\?: boolean, texttvMode\?: boolean\) => string \| null/);
  });
});

describe('boardRoot, which it now shares', () => {
  it('is the same resolver the bot and the Bulls route use', () => {
    const root = fs.readFileSync(
      path.join(__dirname, '../../src/utils/board-root.util.ts'), 'utf8');
    expect(root).toContain('BBS_DATA_DIR');
    expect(root).toContain('BBS_ROOT');
  });
});
