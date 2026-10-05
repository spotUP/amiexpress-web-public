/**
 * express.e findUserAnswers (21177-21196): the account editor's `?` shows
 * Answers/<slot> on a CENTRAL_ANSWERS node, else Node<n>/Answers/<slot>,
 * walking Node0, Node1, ... while the node directories exist.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { clearNodeTooltypeCache } from '../../src/utils/node-tooltypes.util';
import { findUserAnswersFile } from '../../src/utils/user-answers.util';

let root = '';
let spy: jest.SpyInstance;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'answers-'));
  for (const n of [0, 1]) fs.mkdirSync(path.join(root, `Node${n}`));
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  clearNodeTooltypeCache();
});
afterEach(() => {
  spy.mockRestore();
  clearNodeTooltypeCache();
  fs.rmSync(root, { recursive: true, force: true });
});

test('a CENTRAL_ANSWERS node finds Answers/<slot>', () => {
  applyTooltypes(path.join(root, 'Node0.info'), [['CENTRAL_ANSWERS', '']]);
  fs.mkdirSync(path.join(root, 'Answers'));
  fs.writeFileSync(path.join(root, 'Answers', '7'), 'answers of 7');
  expect(findUserAnswersFile(root, 7)).toBe(path.join(root, 'Answers', '7'));
  expect(findUserAnswersFile(root, 8)).toBeNull();
});

test('without it, Node<n>/Answers/<slot>; the node-wide Answers file is never read', () => {
  fs.writeFileSync(path.join(root, 'Node0', 'Answers'), 'every caller');
  expect(findUserAnswersFile(root, 7)).toBeNull();
  fs.mkdirSync(path.join(root, 'Node1', 'Answers'));
  fs.writeFileSync(path.join(root, 'Node1', 'Answers', '7'), 'answers of 7');
  expect(findUserAnswersFile(root, 7)).toBe(path.join(root, 'Node1', 'Answers', '7'));
});
