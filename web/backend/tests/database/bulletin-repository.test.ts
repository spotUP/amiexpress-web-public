/**
 * Bulletin Repository Tests
 */

import { BulletinRepository } from '../../src/database/bulletin-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('BulletinRepository', () => {
  let repo: BulletinRepository;
  let rawDb: any;
  const TEST_CONF_ID = 1; // seeded conference

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new BulletinRepository(rawDb);
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM bulletins WHERE conferenceid = ${TEST_CONF_ID}`);
  });

  describe('createBulletin', () => {
    it('returns a numeric id', async () => {
      const id = await repo.createBulletin({
        conferenceId: TEST_CONF_ID,
        filename: 'BULL1.TXT',
        title: 'Test Bulletin',
      });
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getBulletins', () => {
    it('returns all bulletins when no filter', async () => {
      await repo.createBulletin({ conferenceId: TEST_CONF_ID, filename: 'B1.TXT', title: 'One' });
      await repo.createBulletin({ conferenceId: TEST_CONF_ID, filename: 'B2.TXT', title: 'Two' });

      const all = await repo.getBulletins();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by conferenceId', async () => {
      await repo.createBulletin({ conferenceId: TEST_CONF_ID, filename: 'BX.TXT', title: 'X' });
      const filtered = await repo.getBulletins(TEST_CONF_ID);
      expect(filtered.every(b => b.conferenceId === TEST_CONF_ID)).toBe(true);
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('getBulletinById', () => {
    it('retrieves by id', async () => {
      const id = await repo.createBulletin({ conferenceId: TEST_CONF_ID, filename: 'ID.TXT', title: 'ById' });
      const b = await repo.getBulletinById(id);
      expect(b).not.toBeNull();
      expect(b!.title).toBe('ById');
    });

    it('returns null for unknown id', async () => {
      const b = await repo.getBulletinById(999999);
      expect(b).toBeNull();
    });
  });

  describe('deleteBulletin', () => {
    it('removes the row', async () => {
      const id = await repo.createBulletin({ conferenceId: TEST_CONF_ID, filename: 'DEL.TXT', title: 'Del' });
      await repo.deleteBulletin(id);
      const b = await repo.getBulletinById(id);
      expect(b).toBeNull();
    });
  });
});
