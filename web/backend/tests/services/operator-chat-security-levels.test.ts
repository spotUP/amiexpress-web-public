/**
 * No non-sysop could page the sysop.
 *
 * The Operator Chat form's "Allowed Security Levels" is a checkbox group, and
 * a checkbox group posts its values as STRINGS. The column filled with
 * ["10","20"] while operator-chat.handler.ts:255 tests
 * `config.allowedSecLevels.includes(userSecLevel)` against a NUMBER - and
 * ["10"].includes(10) is false, so the list matched nobody and every page
 * from a non-sysop was refused.
 *
 * Numbers on the way in, and numbers on the way back out, so a board whose
 * column already holds strings starts working without a re-save.
 *
 * Asserted through the REAL OperatorChatRepository on an in-memory SQLite
 * database (the technique of tests/handlers/co-sysop-persona-holds-the-chat
 * .test.ts). This file used to test a local COPY of the coercion and tie it
 * to the repository with a source pin; now the repository's own updateConfig
 * and getConfig are what is measured, and the raw column is read to prove the
 * write side on its own.
 */
process.env.SKIP_DB_INIT = '1';

import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../src/database/operator-chat.repository';

describe('the security levels allowed to page the sysop', () => {
  let db: Database.Database;
  let repo: OperatorChatRepository;
  beforeEach(() => {
    db = new Database(':memory:');
    repo = new OperatorChatRepository(db);
  });
  afterEach(() => db.close());

  const column = (): string =>
    (db.prepare('SELECT allowed_sec_levels FROM operator_chat_config WHERE id = 1').get() as { allowed_sec_levels: string })
      .allowed_sec_levels;

  it('stores what a checkbox group sends as numbers', () => {
    repo.updateConfig({ allowedSecLevels: ['10', '20', '255'] as unknown as number[] });
    expect(JSON.parse(column())).toEqual([10, 20, 255]);
    expect(repo.getConfig().allowedSecLevels).toEqual([10, 20, 255]);
  });

  it('reads a row already written as strings back as numbers', () => {
    db.prepare(`UPDATE operator_chat_config SET allowed_sec_levels = '["10","20"]' WHERE id = 1`).run();
    expect(repo.getConfig().allowedSecLevels).toEqual([10, 20]);
  });

  it('makes the permission check match, which is the whole bug', () => {
    db.prepare(`UPDATE operator_chat_config SET allowed_sec_levels = '["10","20"]' WHERE id = 1`).run();
    const userSecLevel = 10;
    expect((JSON.parse(column()) as unknown[]).includes(userSecLevel)).toBe(false); // the bug
    expect(repo.getConfig().allowedSecLevels.includes(userSecLevel)).toBe(true);
  });

  it('drops what is not a level rather than turning it into 0', () => {
    // Level 0 is real, so '' and null must not become it.
    repo.updateConfig({ allowedSecLevels: ['10', '', 'nonsense', null] as unknown as number[] });
    expect(repo.getConfig().allowedSecLevels).toEqual([10]);
    repo.updateConfig({ allowedSecLevels: ['0', '10'] as unknown as number[] });
    expect(repo.getConfig().allowedSecLevels).toEqual([0, 10]);
  });
});
