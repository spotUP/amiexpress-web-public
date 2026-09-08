/**
 * Finding a user's questionnaire-answer blocks across Node<n>/Answers.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findUserAnswerBlocks, blockNamesUser } from '../../src/utils/user-answers.util';

const BANNER = '**************************************************************';
function block(header: string, ...answers: string[]): string {
  return `${BANNER}\n${header}\n${answers.join('\n')}\n`;
}

function makeBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answers-'));
  fs.mkdirSync(path.join(root, 'Node1'));
  fs.mkdirSync(path.join(root, 'Node2'));
  fs.writeFileSync(
    path.join(root, 'Node1', 'Answers'),
    block('09-08-26 (10:00:00) [12] alice (CONNECT 56000) London', 'Q: age', 'A: 30') +
    block('09-08-26 (11:00:00) [13] bob (CONNECT 56000) Paris', 'Q: age', 'A: alice is my friend'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'Node2', 'Answers'),
    block('09-07-26 (09:00:00) [12] alice (CONNECT 56000) London', 'Q: colour', 'A: blue'),
    'utf8',
  );
  return root;
}

describe('findUserAnswerBlocks', () => {
  it('returns every block whose HEADER names the user, across nodes', () => {
    const root = makeBoard();
    const blocks = findUserAnswerBlocks(root, 'alice');
    expect(blocks.map(b => b.node).sort()).toEqual(['Node1', 'Node2']);
    expect(blocks.some(b => b.text.includes('A: 30'))).toBe(true);
    expect(blocks.some(b => b.text.includes('A: blue'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not steal a block that only mentions the user in its answer text', () => {
    const root = makeBoard();
    // bob's block says "alice is my friend" in the body - that is bob's block,
    // not alice's. alice must get exactly her two header-matched blocks.
    expect(findUserAnswerBlocks(root, 'alice')).toHaveLength(2);
    expect(findUserAnswerBlocks(root, 'bob')).toHaveLength(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns nothing for an unknown user or an empty username', () => {
    const root = makeBoard();
    expect(findUserAnswerBlocks(root, 'nobody')).toEqual([]);
    expect(findUserAnswerBlocks(root, '')).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('blockNamesUser matches the header line only, word-bounded', () => {
    const b = block('09-08-26 (10:00:00) [12] al (CONNECT) X', 'A: alistair');
    expect(blockNamesUser(b, 'al')).toBe(true);
    expect(blockNamesUser(b, 'alistair')).toBe(false); // only in the body
  });
});
