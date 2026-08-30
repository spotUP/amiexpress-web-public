/**
 * Smoke tests for QWKManager constructor and basic structure.
 * Full integration tests are out of scope here (require real QWK files).
 */

jest.mock('../../src/database', () => ({
  db: {
    createQWKPacket: jest.fn().mockResolvedValue(1),
    updateQWKPacket: jest.fn().mockResolvedValue(undefined),
    createQWKMessage: jest.fn().mockResolvedValue(undefined),
  },
}));

import * as os from 'os';
import * as path from 'path';
import { QWKManager } from '../../src/services/qwk.service';

describe('QWKManager', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = os.tmpdir();
  });

  test('constructs without throwing', () => {
    expect(() => new QWKManager(tmpDir, 'TESTBBS')).not.toThrow();
  });

  test('uses provided bbsId', () => {
    const mgr = new QWKManager(tmpDir, 'MYBBS');
    expect((mgr as any).bbsId).toBe('MYBBS');
  });

  test('uses provided qwkPath', () => {
    const mgr = new QWKManager(tmpDir, 'TESTBBS');
    expect((mgr as any).qwkPath).toBe(tmpDir);
  });
});
