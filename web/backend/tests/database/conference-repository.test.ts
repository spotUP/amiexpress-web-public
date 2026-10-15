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

  describe('syncConferencesFromDisk', () => {
    it('inserts missing conferences using the disk id (so SQLite mirrors ConfConfig.info)', async () => {
      // Regression: SQLite carried only the 3 default-seeded conferences
      // (General / Tech Support / Announcements) even on live sites that
      // declared 14+ confs in ConfConfig.info — db.getFileAreas(5) etc.
      // came back empty. Disk is canonical; this sync mirrors it.
      const uniqueSuffix = `_sync_${Date.now()}`;
      const diskConfs = [
        { id: 9001, name: `DiskConf_A${uniqueSuffix}`, location: 'BBS:DiskA/' },
        { id: 9002, name: `DiskConf_B${uniqueSuffix}`, location: 'BBS:DiskB/' },
      ];

      const result = await repo.syncConferencesFromDisk(diskConfs);
      expect(result.inserted).toBe(2);

      const a = await repo.getConferenceById(9001);
      const b = await repo.getConferenceById(9002);
      expect(a?.name).toBe(diskConfs[0].name);
      expect(b?.name).toBe(diskConfs[1].name);
    });

    it('is idempotent — running twice over the same disk list inserts only once', async () => {
      const diskConfs = [
        { id: 9101, name: `Idem_${Date.now()}`, location: 'BBS:Idem/' },
      ];
      const first = await repo.syncConferencesFromDisk(diskConfs);
      const second = await repo.syncConferencesFromDisk(diskConfs);

      expect(first.inserted).toBe(1);
      expect(second.inserted).toBe(0);
      expect(second.renamed).toBe(0);
    });

    it('renames a row when the disk-id slot is occupied by a different name', async () => {
      // Pre-seed conf id 9201 with one name, then sync with a different
      // name at that same id. The slot should be renamed in place.
      const stale = `Stale_${Date.now()}`;
      const fresh = `Fresh_${Date.now()}`;
      await repo.syncConferencesFromDisk([{ id: 9201, name: stale }]);
      const result = await repo.syncConferencesFromDisk([{ id: 9201, name: fresh }]);
      expect(result.renamed).toBe(1);
      const c = await repo.getConferenceById(9201);
      expect(c?.name).toBe(fresh);
    });

    it('handles empty input without erroring', async () => {
      const result = await repo.syncConferencesFromDisk([]);
      expect(result.inserted).toBe(0);
      expect(result.renamed).toBe(0);
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
