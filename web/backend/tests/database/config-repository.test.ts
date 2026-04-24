// @ts-nocheck
/**
 * Config Repository Tests — SystemConfig, NodeConfig, ConferenceConfig, Door CRUD
 * config-repository.ts is 1613 lines; these tests cover the most critical paths.
 */

import { ConfigRepository } from '../../src/database/config-repository';

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

describe('ConfigRepository', () => {
  let repo: ConfigRepository;

  beforeAll(async () => {
    const db = await waitForTestDb();
    repo = new ConfigRepository((db as any).db);
  }, 30000);

  describe('SystemConfig', () => {
    it('createSystemConfig and getSystemConfig round-trip', () => {
      // Clear any existing config first
      const rawDb = ((global as any).testDb as any).db;
      rawDb.exec('DELETE FROM system_config');

      const created = repo.createSystemConfig({
        bbs_name: 'TestBBS',
        sysop_name: 'TestSysop',
        max_nodes: 4,
      });
      expect(created.bbs_name).toBe('TestBBS');

      const retrieved = repo.getSystemConfig();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.bbs_name).toBe('TestBBS');
      expect(retrieved!.sysop_name).toBe('TestSysop');
    });

    it('updateSystemConfig applies changes', () => {
      const rawDb = ((global as any).testDb as any).db;
      rawDb.exec('DELETE FROM system_config');
      repo.createSystemConfig({ bbs_name: 'OldName' });

      repo.updateSystemConfig({ bbs_name: 'NewName' });
      const config = repo.getSystemConfig();
      expect(config!.bbs_name).toBe('NewName');
    });
  });

  describe('NodeConfig', () => {
    const testNodeNum = 98; // Must be 1-255 per CHECK constraint

    afterEach(() => {
      try { repo.deleteNodeConfig(testNodeNum); } catch (_) {}
    });

    it('createNodeConfig and getNodeConfig round-trip', () => {
      repo.createNodeConfig({ node_number: testNodeNum });
      const nc = repo.getNodeConfig(testNodeNum);
      expect(nc).not.toBeNull();
      expect(nc.node_number).toBe(testNodeNum);
    });

    it('getNodeConfigs returns array', () => {
      const configs = repo.getNodeConfigs();
      expect(Array.isArray(configs)).toBe(true);
    });

    it('updateNodeConfig changes field', () => {
      repo.createNodeConfig({ node_number: testNodeNum });
      repo.updateNodeConfig(testNodeNum, { priority: 5 });
      const nc = repo.getNodeConfig(testNodeNum);
      expect(nc.priority).toBe(5);
    });

    it('deleteNodeConfig removes row', () => {
      repo.createNodeConfig({ node_number: testNodeNum });
      repo.deleteNodeConfig(testNodeNum);
      expect(repo.getNodeConfig(testNodeNum)).toBeNull();
    });
  });

  describe('ConferenceConfig', () => {
    // Use seeded conference ID 3 (conferences 1-4 are seeded)
    const testConfId = 3;

    afterEach(() => {
      try { repo.deleteConferenceConfig(testConfId); } catch (_) {}
    });

    it('createConferenceConfig and getConferenceConfig round-trip', () => {
      repo.createConferenceConfig({ conference_id: testConfId });
      const cc = repo.getConferenceConfig(testConfId);
      expect(cc).not.toBeNull();
      expect(cc.conference_id).toBe(testConfId);
    });

    it('updateConferenceConfig changes field', () => {
      repo.createConferenceConfig({ conference_id: testConfId });
      repo.updateConferenceConfig(testConfId, { min_access_level: 20 });
      const cc = repo.getConferenceConfig(testConfId);
      expect(cc.min_access_level).toBe(20);
    });
  });

  describe('Door', () => {
    let doorId: number;

    afterEach(() => {
      try { if (doorId) repo.deleteDoor(doorId); } catch (_) {}
    });

    it('createDoor and getDoor round-trip', () => {
      const created = repo.createDoor({
        door_name: `TestDoor_${Date.now()}`,
        door_command: `TD${Date.now()}`,
        door_type: 'BBSCMD',
        door_path: '/Doors/test',
        description: 'A test door',
      });
      doorId = created.id;
      expect(typeof doorId).toBe('number');

      const door = repo.getDoor(doorId);
      expect(door).not.toBeNull();
      expect(door.description).toBe('A test door');
    });

    it('getDoors returns array', () => {
      const doors = repo.getDoors();
      expect(Array.isArray(doors)).toBe(true);
    });

    it('getDoorByCommand finds by command', () => {
      const cmd = `CMD${Date.now()}`;
      const created = repo.createDoor({
        door_name: 'CmdDoor',
        door_command: cmd,
        door_type: 'BBSCMD',
        door_path: '/Doors/cmd',
      });
      doorId = created.id;
      const door = repo.getDoorByCommand(cmd);
      expect(door).not.toBeNull();
      expect(door.door_command).toBe(cmd);
    });

    it('updateDoor changes field', () => {
      const created = repo.createDoor({
        door_name: 'BeforeDoor',
        door_command: `BD${Date.now()}`,
        door_type: 'BBSCMD',
        door_path: '/Doors/bd',
        description: 'Before',
      });
      doorId = created.id;
      repo.updateDoor(doorId, { description: 'After' });
      expect(repo.getDoor(doorId).description).toBe('After');
    });

    it('deleteDoor removes row', () => {
      const created = repo.createDoor({
        door_name: 'DelDoor',
        door_command: `DD${Date.now()}`,
        door_type: 'BBSCMD',
        door_path: '/Doors/del',
      });
      const delId = created.id;
      repo.deleteDoor(delId);
      expect(repo.getDoor(delId)).toBeNull();
    });
  });

  describe('audit log', () => {
    it('logConfigChange and getAuditLog round-trip', () => {
      repo.logConfigChange('system_config', 1, 'UPDATE', undefined, 'sysop', null, { bbs_name: 'New' });
      const log = repo.getAuditLog('system_config');
      expect(Array.isArray(log)).toBe(true);
      expect(log.length).toBeGreaterThan(0);
    });
  });
});
