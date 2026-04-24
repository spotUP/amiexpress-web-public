/**
 * Conference Repository Tests
 */

import { ConferenceRepository } from '../../src/database/conference-repository';

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

function makeConfData(overrides: any = {}) {
  return {
    name: `TestConf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    number: Math.floor(Math.random() * 90000) + 10000,
    description: 'Test conference',
    sysopName: 'Sysop',
    accessLevel: 10,
    uploadLevel: 10,
    downloadLevel: 10,
    messageLevel: 10,
    moderatorLevel: 200,
    allowAnonymous: false,
    messageBaseCount: 1,
    fileAreaCount: 0,
    ...overrides,
  };
}

describe('ConferenceRepository', () => {
  let repo: ConferenceRepository;

  beforeAll(async () => {
    const db = await waitForTestDb();
    repo = new ConferenceRepository((db as any).db);
  }, 30000);

  describe('createConference', () => {
    it('returns a numeric id', async () => {
      const id = await repo.createConference(makeConfData());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getConferenceById', () => {
    it('retrieves created conference', async () => {
      const data = makeConfData({ name: 'UniqueConf', description: 'Desc' });
      const id = await repo.createConference(data);

      const conf = await repo.getConferenceById(id);
      expect(conf).not.toBeNull();
      expect(conf!.name).toBe(data.name);
      expect(conf!.description).toBe('Desc');
    });

    it('returns null for unknown id', async () => {
      const conf = await repo.getConferenceById(999999);
      expect(conf).toBeNull();
    });
  });

  describe('getConferences', () => {
    it('returns array including seeded conferences', async () => {
      const all = await repo.getConferences();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('updateConference', () => {
    it('updates specified fields', async () => {
      const id = await repo.createConference(makeConfData({ description: 'Before' }));
      await repo.updateConference(id, { description: 'After' });

      const conf = await repo.getConferenceById(id);
      expect(conf!.description).toBe('After');
    });
  });

  describe('MessageBase CRUD', () => {
    it('createMessageBase returns id, getMessageBases lists it', async () => {
      const confId = await repo.createConference(makeConfData());
      const mbId = await repo.createMessageBase({
        conferenceId: confId,
        name: 'General',
      });

      expect(typeof mbId).toBe('number');
      const bases = await repo.getMessageBases(confId);
      expect(bases.some((b: any) => b.id === mbId)).toBe(true);
    });

    it('getMessageBaseById retrieves by id', async () => {
      const confId = await repo.createConference(makeConfData());
      const mbId = await repo.createMessageBase({
        conferenceId: confId,
        name: 'MBTest',
      });

      const mb = await repo.getMessageBaseById(mbId);
      expect(mb).not.toBeNull();
      expect(mb!.name).toBe('MBTest');
    });

    it('getMessageBaseById returns null for unknown id', async () => {
      const mb = await repo.getMessageBaseById(999999);
      expect(mb).toBeNull();
    });
  });
});
