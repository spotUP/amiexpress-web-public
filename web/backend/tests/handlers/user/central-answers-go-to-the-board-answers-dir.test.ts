/**
 * A node with CENTRAL_ANSWERS keeps each new caller's answers in the board's
 * Answers/<slot> (express.e:30332-30340); without it, in the node's own
 * Answers. The port always wrote the node's file.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../../src/config';
import { applyTooltypes } from '../../../src/utils/info-file.util';
import { clearNodeTooltypeCache } from '../../../src/utils/node-tooltypes.util';
import { answersFileFor } from '../../../src/handlers/user/new-user.handler';

let dataDir = '';
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-answers-'));
  const original = config.get.bind(config);
  jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  const originalAll = config.getConfig.bind(config);
  jest.spyOn(config, 'getConfig').mockImplementation(() => ({ ...originalAll(), dataDir }));
  clearNodeTooltypeCache();
});
afterEach(() => {
  jest.restoreAllMocks();
  clearNodeTooltypeCache();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a CENTRAL_ANSWERS node files the answers under Answers/<slot>', () => {
  applyTooltypes(path.join(dataDir, 'Node2.info'), [['CENTRAL_ANSWERS', '']]);
  const file = answersFileFor(2, 17, path.join(dataDir, 'Node2'));
  expect(file).toBe(path.join(dataDir, 'Answers', '17'));
  expect(fs.statSync(path.join(dataDir, 'Answers')).isDirectory()).toBe(true);
});

test('any other node keeps them in its own Answers', () => {
  expect(answersFileFor(1, 17, path.join(dataDir, 'Node1'))).toBe(path.join(dataDir, 'Node1', 'Answers'));
});
