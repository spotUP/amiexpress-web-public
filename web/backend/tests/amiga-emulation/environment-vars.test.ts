/**
 * Environment Variables Unit Tests
 * Tests SetVar/GetVar/DeleteVar/FindVar functionality
 *
 * Tests the EnvironmentManager class which implements AmigaOS environment variables
 */

import { EnvironmentManager } from '../../src/amiga-emulation/session/EnvironmentManager';

// Mock MoiraEmulator with minimal memory operations
class MockEmulator {
  private memory: Map<number, number> = new Map();
  private strings: Map<number, string> = new Map();

  readMemory32(addr: number): number {
    return (
      ((this.memory.get(addr) || 0) << 24) |
      ((this.memory.get(addr + 1) || 0) << 16) |
      ((this.memory.get(addr + 2) || 0) << 8) |
      (this.memory.get(addr + 3) || 0)
    );
  }

  writeMemory32(addr: number, value: number): void {
    this.memory.set(addr, (value >> 24) & 0xff);
    this.memory.set(addr + 1, (value >> 16) & 0xff);
    this.memory.set(addr + 2, (value >> 8) & 0xff);
    this.memory.set(addr + 3, value & 0xff);
  }

  writeMemory16(addr: number, value: number): void {
    this.memory.set(addr, (value >> 8) & 0xff);
    this.memory.set(addr + 1, value & 0xff);
  }

  writeMemory(addr: number, value: number): void {
    this.memory.set(addr, value & 0xff);
  }

  writeString(addr: number, str: string): void {
    this.strings.set(addr, str);
    for (let i = 0; i < str.length; i++) {
      this.memory.set(addr + i, str.charCodeAt(i));
    }
    this.memory.set(addr + str.length, 0); // null terminator
  }

  readString(addr: number): string {
    return this.strings.get(addr) || '';
  }
}

describe('EnvironmentManager', () => {
  let emulator: MockEmulator;
  let envManager: EnvironmentManager;

  beforeEach(() => {
    emulator = new MockEmulator();
    envManager = new EnvironmentManager(emulator as any, 0x130000);
    // Initialize LocalVars list
    envManager.initializeLocalVarsList(0x120000);
  });

  describe('SetVar/GetVar', () => {
    test('should set and get a simple variable', () => {
      const result = envManager.setVar('TEST', 'value123');
      expect(result).toBe(true);
      expect(envManager.getVar('TEST')).toBe('value123');
    });

    test('should set and get multiple variables', () => {
      envManager.setVar('VAR1', 'value1');
      envManager.setVar('VAR2', 'value2');
      envManager.setVar('VAR3', 'value3');

      expect(envManager.getVar('VAR1')).toBe('value1');
      expect(envManager.getVar('VAR2')).toBe('value2');
      expect(envManager.getVar('VAR3')).toBe('value3');
    });

    test('should overwrite existing variable', () => {
      envManager.setVar('MYVAR', 'original');
      expect(envManager.getVar('MYVAR')).toBe('original');

      envManager.setVar('MYVAR', 'updated');
      expect(envManager.getVar('MYVAR')).toBe('updated');
    });

    test('should return undefined for non-existent variable', () => {
      expect(envManager.getVar('NONEXISTENT')).toBeUndefined();
    });

    test('should handle empty string value', () => {
      envManager.setVar('EMPTY', '');
      expect(envManager.getVar('EMPTY')).toBe('');
    });

    test('should handle variable with special characters', () => {
      envManager.setVar('PATH', 'Work:,S:,C:,Doors:');
      expect(envManager.getVar('PATH')).toBe('Work:,S:,C:,Doors:');
    });
  });

  describe('DeleteVar', () => {
    test('should delete existing variable', () => {
      envManager.setVar('TODELETE', 'value');
      expect(envManager.getVar('TODELETE')).toBe('value');

      const result = envManager.deleteVar('TODELETE');
      expect(result).toBe(true);
      expect(envManager.getVar('TODELETE')).toBeUndefined();
    });

    test('should return false for non-existent variable', () => {
      const result = envManager.deleteVar('NONEXISTENT');
      expect(result).toBe(false);
    });

    test('should not affect other variables when deleting', () => {
      envManager.setVar('KEEP1', 'val1');
      envManager.setVar('DELETE', 'val2');
      envManager.setVar('KEEP2', 'val3');

      envManager.deleteVar('DELETE');

      expect(envManager.getVar('KEEP1')).toBe('val1');
      expect(envManager.getVar('DELETE')).toBeUndefined();
      expect(envManager.getVar('KEEP2')).toBe('val3');
    });
  });

  describe('FindVar', () => {
    test('should return node address for existing variable', () => {
      envManager.setVar('FINDME', 'value');
      const addr = envManager.findVar('FINDME');
      expect(addr).toBeGreaterThan(0);
    });

    test('should return 0 for non-existent variable', () => {
      const addr = envManager.findVar('NONEXISTENT');
      expect(addr).toBe(0);
    });

    test('should return different addresses for different variables', () => {
      envManager.setVar('VAR1', 'value1');
      envManager.setVar('VAR2', 'value2');

      const addr1 = envManager.findVar('VAR1');
      const addr2 = envManager.findVar('VAR2');

      expect(addr1).not.toBe(addr2);
      expect(addr1).toBeGreaterThan(0);
      expect(addr2).toBeGreaterThan(0);
    });
  });

  describe('FindVarPointer with flags', () => {
    test('should find local variable with default flags', () => {
      envManager.setVar('LOCAL', 'value', 0); // GVF_LOCAL_VAR = 0
      const addr = envManager.findVarPointer('LOCAL', 0);
      expect(addr).toBeGreaterThan(0);
    });

    test('should filter global-only when local variable exists', () => {
      envManager.setVar('LOCAL', 'value', 0); // GVF_LOCAL_VAR
      const addr = envManager.findVarPointer('LOCAL', 256); // GVF_GLOBAL_ONLY
      expect(addr).toBe(0);
    });

    test('should find global variable with global flag', () => {
      envManager.setVar('GLOBAL', 'value', 256); // GVF_GLOBAL_VAR
      const addr = envManager.findVarPointer('GLOBAL', 256); // GVF_GLOBAL_ONLY
      expect(addr).toBeGreaterThan(0);
    });
  });

  describe('populateStandardVars', () => {
    test('should populate standard AmigaDOS variables', () => {
      envManager.populateStandardVars('/bbs', 1, 1, 'Sysop', 255);

      expect(envManager.getVar('PATH')).toBe('Work:,S:,C:,Doors:');
      expect(envManager.getVar('PROMPT')).toBe('%N.%S>');
      expect(envManager.getVar('RETURN')).toBe('0');
      expect(envManager.getVar('RC')).toBe('0');
    });

    test('should populate BBS-specific variables', () => {
      envManager.populateStandardVars('/bbs/root', 3, 5, 'TestUser', 100);

      expect(envManager.getVar('BBS_ROOT')).toBe('/bbs/root');
      expect(envManager.getVar('NODE_ID')).toBe('3');
      expect(envManager.getVar('CONF_ID')).toBe('5');
      expect(envManager.getVar('USER_NAME')).toBe('TestUser');
      expect(envManager.getVar('USER_LEVEL')).toBe('100');
    });
  });

  describe('setDoorUseVar', () => {
    test('should set DOORUSE.* variable with uppercase door name', () => {
      envManager.setDoorUseVar('AquaScan', 'FR/REVSCAN');
      expect(envManager.getVar('DOORUSE.AQUASCAN')).toBe('FR/REVSCAN');
    });
  });

  describe('getAllVars', () => {
    test('should return all variables', () => {
      envManager.setVar('A', '1');
      envManager.setVar('B', '2');
      envManager.setVar('C', '3');

      const allVars = envManager.getAllVars();
      expect(allVars.size).toBe(3);
      expect(allVars.get('A')?.value).toBe('1');
      expect(allVars.get('B')?.value).toBe('2');
      expect(allVars.get('C')?.value).toBe('3');
    });
  });

  describe('clear', () => {
    test('should clear all variables', () => {
      envManager.setVar('A', '1');
      envManager.setVar('B', '2');

      envManager.clear();

      expect(envManager.getVar('A')).toBeUndefined();
      expect(envManager.getVar('B')).toBeUndefined();
      expect(envManager.getAllVars().size).toBe(0);
    });
  });
});
