/**
 * BBS Paths Utility Unit Tests
 *
 * Tests centralized path management for AmiExpress directory structure
 */

// Mock fs/promises BEFORE imports
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

import * as path from 'path';
import {
  BBSPaths,
  NodePaths,
  getNodeWorkDir,
  getPlaypenDir,
  createBBSPaths,
  getAmigaAssignPaths,
} from '../../src/utils/bbs-paths.util';
import * as fs from 'fs/promises';

describe('BBS Paths Utility', () => {
  const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
  const testRoot = '/test/bbs';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BBSPaths Class', () => {
    let paths: BBSPaths;

    beforeEach(() => {
      paths = new BBSPaths(testRoot);
    });

    describe('root/bbs methods', () => {
      it('should return BBS root directory', () => {
        expect(paths.root()).toBe(testRoot);
      });

      it('should return BBS root via bbs() alias', () => {
        expect(paths.bbs()).toBe(testRoot);
      });

      it('should have bbs() and root() return same value', () => {
        expect(paths.bbs()).toBe(paths.root());
      });
    });

    describe('screen method', () => {
      it('should return Screens directory without filename', () => {
        const expected = path.join(testRoot, 'Screens');
        expect(paths.screen()).toBe(expected);
      });

      it('should return specific screen file with filename', () => {
        const expected = path.join(testRoot, 'Screens', 'MENU.TXT');
        expect(paths.screen('MENU.TXT')).toBe(expected);
      });

      it('should handle various screen filenames', () => {
        expect(paths.screen('LOGON.TXT')).toContain('LOGON.TXT');
        expect(paths.screen('MENU.TXT')).toContain('MENU.TXT');
        expect(paths.screen('GOODBYE.TXT')).toContain('GOODBYE.TXT');
      });
    });

    describe('commands method', () => {
      it('should return Commands directory without subdir', () => {
        const expected = path.join(testRoot, 'Commands');
        expect(paths.commands()).toBe(expected);
      });

      it('should return BBSCmd subdirectory', () => {
        const expected = path.join(testRoot, 'Commands', 'BBSCmd');
        expect(paths.commands('BBSCmd')).toBe(expected);
      });

      it('should return SysCmd subdirectory', () => {
        const expected = path.join(testRoot, 'Commands', 'SysCmd');
        expect(paths.commands('SysCmd')).toBe(expected);
      });
    });

    describe('bbsCommands method', () => {
      it('should return BBSCmd directory', () => {
        const expected = path.join(testRoot, 'Commands', 'BBSCmd');
        expect(paths.bbsCommands()).toBe(expected);
      });

      it('should match commands("BBSCmd")', () => {
        expect(paths.bbsCommands()).toBe(paths.commands('BBSCmd'));
      });
    });

    describe('sysCommands method', () => {
      it('should return SysCmd directory', () => {
        const expected = path.join(testRoot, 'Commands', 'SysCmd');
        expect(paths.sysCommands()).toBe(expected);
      });

      it('should match commands("SysCmd")', () => {
        expect(paths.sysCommands()).toBe(paths.commands('SysCmd'));
      });
    });

    describe('conference method', () => {
      it('should return conference 1 directory', () => {
        const expected = path.join(testRoot, 'Conf1');
        expect(paths.conference(1)).toBe(expected);
      });

      it('should handle conference numbers 1-99', () => {
        expect(paths.conference(1)).toContain('Conf1');
        expect(paths.conference(10)).toContain('Conf10');
        expect(paths.conference(99)).toContain('Conf99');
      });

      it('should handle single and double digit conferences', () => {
        expect(paths.conference(5)).toContain('Conf5');
        expect(paths.conference(15)).toContain('Conf15');
      });
    });

    describe('conferenceBulletins method', () => {
      it('should return conference bulletins directory', () => {
        const expected = path.join(testRoot, 'Conf1', 'Bulletins');
        expect(paths.conferenceBulletins(1)).toBe(expected);
      });

      it('should handle various conference numbers', () => {
        expect(paths.conferenceBulletins(5)).toContain('Conf5');
        expect(paths.conferenceBulletins(5)).toContain('Bulletins');
      });
    });

    describe('conferenceFiles method', () => {
      it('should return conference files directory', () => {
        const expected = path.join(testRoot, 'Conf1', 'Files');
        expect(paths.conferenceFiles(1)).toBe(expected);
      });

      it('should handle various conference numbers', () => {
        expect(paths.conferenceFiles(10)).toContain('Conf10');
        expect(paths.conferenceFiles(10)).toContain('Files');
      });
    });

    describe('conferenceMessages method', () => {
      it('should return conference messages directory', () => {
        const expected = path.join(testRoot, 'Conf1', 'Messages');
        expect(paths.conferenceMessages(1)).toBe(expected);
      });

      it('should handle various conference numbers', () => {
        expect(paths.conferenceMessages(20)).toContain('Conf20');
        expect(paths.conferenceMessages(20)).toContain('Messages');
      });
    });

    describe('doors method', () => {
      it('should return Doors directory without door name', () => {
        const expected = path.join(testRoot, 'Doors');
        expect(paths.doors()).toBe(expected);
      });

      it('should return specific door directory with door name', () => {
        const expected = path.join(testRoot, 'Doors', 'AquaDoor');
        expect(paths.doors('AquaDoor')).toBe(expected);
      });

      it('should handle various door names', () => {
        expect(paths.doors('WhatIs')).toContain('WhatIs');
        expect(paths.doors('RTW')).toContain('RTW');
      });
    });

    describe('node method', () => {
      it('should return NodePaths instance', () => {
        const node = paths.node(0);
        expect(node).toBeInstanceOf(NodePaths);
      });

      it('should create different instances for different nodes', () => {
        const node0 = paths.node(0);
        const node1 = paths.node(1);
        expect(node0.root()).not.toBe(node1.root());
      });
    });

    describe('system method', () => {
      it('should return S directory without filename', () => {
        const expected = path.join(testRoot, 'S');
        expect(paths.system()).toBe(expected);
      });

      it('should return specific system file with filename', () => {
        const expected = path.join(testRoot, 'S', 'Count.dat');
        expect(paths.system('Count.dat')).toBe(expected);
      });

      it('should handle various system filenames', () => {
        expect(paths.system('startup-sequence')).toContain('startup-sequence');
        expect(paths.system('Shell-Startup')).toContain('Shell-Startup');
      });
    });

    describe('resolveAmigaPath method', () => {
      it('should resolve NODE0: assign', () => {
        const result = paths.resolveAmigaPath('NODE0:Playpen/file.zip');
        expect(result).toContain('Node0');
        expect(result).toContain('Playpen');
        expect(result).toContain('file.zip');
      });

      it('should resolve NODE1: assign', () => {
        const result = paths.resolveAmigaPath('NODE1:WorkDir/temp.txt');
        expect(result).toContain('Node1');
        expect(result).toContain('WorkDir');
      });

      it('should resolve case-insensitive NODE assign', () => {
        const result = paths.resolveAmigaPath('node0:test');
        expect(result).toContain('Node0');
      });

      it('should resolve DOORS: assign', () => {
        const result = paths.resolveAmigaPath('DOORS:AquaDoor/aquadoor.exe');
        expect(result).toContain('Doors');
        expect(result).toContain('AquaDoor');
      });

      it('should resolve BBS: assign', () => {
        const result = paths.resolveAmigaPath('BBS:Screens/MENU.TXT');
        expect(result).toContain('Screens');
        expect(result).toContain('MENU.TXT');
      });

      it('should resolve PROGDIR: assign with door name', () => {
        const result = paths.resolveAmigaPath('PROGDIR:data.txt', 0, 'MyDoor');
        expect(result).toContain('Doors');
        expect(result).toContain('MyDoor');
        expect(result).toContain('data.txt');
      });

      it('should not resolve PROGDIR: without door name', () => {
        const result = paths.resolveAmigaPath('PROGDIR:data.txt', 0);
        expect(result).toBe('PROGDIR:data.txt');
      });

      it('should resolve S: assign', () => {
        const result = paths.resolveAmigaPath('S:startup-sequence');
        expect(result).toContain(path.join('S', 'startup-sequence'));
      });

      it('should handle case-insensitive assigns', () => {
        expect(paths.resolveAmigaPath('doors:test')).toContain('Doors');
        expect(paths.resolveAmigaPath('bbs:test')).toContain(testRoot);
        expect(paths.resolveAmigaPath('s:test')).toContain('S');
      });

      it('should convert forward slashes to path separators', () => {
        const result = paths.resolveAmigaPath('BBS:Screens/SubDir/file.txt');
        expect(result).toContain(path.join('Screens', 'SubDir', 'file.txt'));
      });

      it('should return unchanged path without assign', () => {
        expect(paths.resolveAmigaPath('/absolute/path')).toBe('/absolute/path');
        expect(paths.resolveAmigaPath('relative/path')).toBe('relative/path');
      });

      it('should handle NODE assign with double-digit numbers', () => {
        const result = paths.resolveAmigaPath('NODE10:test');
        expect(result).toContain('Node10');
      });

      it('should handle empty subpath after assign', () => {
        const result = paths.resolveAmigaPath('BBS:');
        expect(result).toBe(testRoot);
      });
    });

    describe('ensureDirectories method', () => {
      it('should create all standard BBS directories', async () => {
        await paths.ensureDirectories();

        expect(mockMkdir).toHaveBeenCalled();

        // Verify key directories
        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(testRoot);
        expect(calls).toContainEqual(expect.stringContaining('Screens'));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Commands', 'BBSCmd')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Commands', 'SysCmd')));
      });

      it('should create directories recursively', async () => {
        await paths.ensureDirectories();

        mockMkdir.mock.calls.forEach((call) => {
          expect(call[1]).toEqual({ recursive: true });
        });
      });

      it('should create conference 1 directories', async () => {
        await paths.ensureDirectories();

        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(expect.stringContaining('Conf1'));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Conf1', 'Bulletins')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Conf1', 'Files')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Conf1', 'Messages')));
      });

      it('should create Node0 directories', async () => {
        await paths.ensureDirectories();

        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(expect.stringContaining('Node0'));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'Screens')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'Playpen')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'WorkDir')));
      });

      it('should create system directory', async () => {
        await paths.ensureDirectories();

        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(expect.stringContaining(path.join(testRoot, 'S')));
      });
    });
  });

  describe('NodePaths Class', () => {
    let nodePaths: NodePaths;

    beforeEach(() => {
      nodePaths = new NodePaths(testRoot, 0);
    });

    describe('root method', () => {
      it('should return Node0 directory', () => {
        const expected = path.join(testRoot, 'Node0');
        expect(nodePaths.root()).toBe(expected);
      });

      it('should handle different node numbers', () => {
        const node1 = new NodePaths(testRoot, 1);
        expect(node1.root()).toContain('Node1');

        const node10 = new NodePaths(testRoot, 10);
        expect(node10.root()).toContain('Node10');
      });
    });

    describe('screens method', () => {
      it('should return Node0/Screens directory without filename', () => {
        const expected = path.join(testRoot, 'Node0', 'Screens');
        expect(nodePaths.screens()).toBe(expected);
      });

      it('should return specific screen file with filename', () => {
        const expected = path.join(testRoot, 'Node0', 'Screens', 'BULL.TXT');
        expect(nodePaths.screens('BULL.TXT')).toBe(expected);
      });

      it('should handle various filenames', () => {
        expect(nodePaths.screens('CUSTOM.TXT')).toContain('CUSTOM.TXT');
        expect(nodePaths.screens('NODE_MENU.TXT')).toContain('NODE_MENU.TXT');
      });
    });

    describe('playpen method', () => {
      it('should return Node0/Playpen directory without ramPen', () => {
        const expected = path.join(testRoot, 'Node0', 'Playpen');
        expect(nodePaths.playpen()).toBe(expected);
      });

      it('should use ramPen if provided', () => {
        const ramPen = '/ram/uploads';
        expect(nodePaths.playpen(ramPen)).toBe(ramPen);
      });

      it('should ignore empty ramPen', () => {
        const expected = path.join(testRoot, 'Node0', 'Playpen');
        expect(nodePaths.playpen('')).toBe(expected);
      });

      it('should use ramPen with value', () => {
        expect(nodePaths.playpen('RAM:Temp')).toBe('RAM:Temp');
      });
    });

    describe('workDir method', () => {
      it('should return Node0/WorkDir directory', () => {
        const expected = path.join(testRoot, 'Node0', 'WorkDir');
        expect(nodePaths.workDir()).toBe(expected);
      });

      it('should handle different node numbers', () => {
        const node5 = new NodePaths(testRoot, 5);
        expect(node5.workDir()).toContain('Node5');
        expect(node5.workDir()).toContain('WorkDir');
      });
    });

    describe('ensureDirectories method', () => {
      it('should create all node directories', async () => {
        await nodePaths.ensureDirectories();

        expect(mockMkdir).toHaveBeenCalled();

        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(expect.stringContaining('Node0'));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'Screens')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'Playpen')));
        expect(calls).toContainEqual(expect.stringContaining(path.join('Node0', 'WorkDir')));
      });

      it('should create directories recursively', async () => {
        await nodePaths.ensureDirectories();

        mockMkdir.mock.calls.forEach((call) => {
          expect(call[1]).toEqual({ recursive: true });
        });
      });

      it('should work for different node numbers', async () => {
        const node3 = new NodePaths(testRoot, 3);
        await node3.ensureDirectories();

        const calls = mockMkdir.mock.calls.map((call) => call[0]);
        expect(calls).toContainEqual(expect.stringContaining('Node3'));
      });
    });
  });

  describe('Legacy Compatibility Functions', () => {
    describe('getNodeWorkDir', () => {
      it('should return Node0 WorkDir', () => {
        const result = getNodeWorkDir(0, testRoot);
        const expected = path.join(testRoot, 'Node0', 'WorkDir');
        expect(result).toBe(expected);
      });

      it('should handle different node numbers', () => {
        const result = getNodeWorkDir(5, testRoot);
        expect(result).toContain('Node5');
        expect(result).toContain('WorkDir');
      });
    });

    describe('getPlaypenDir', () => {
      it('should return Node0 Playpen without ramPen', () => {
        const result = getPlaypenDir(0, testRoot);
        const expected = path.join(testRoot, 'Node0', 'Playpen');
        expect(result).toBe(expected);
      });

      it('should use ramPen if provided', () => {
        const ramPen = '/ram/uploads';
        const result = getPlaypenDir(0, testRoot, ramPen);
        expect(result).toBe(ramPen);
      });

      it('should handle different node numbers', () => {
        const result = getPlaypenDir(3, testRoot);
        expect(result).toContain('Node3');
        expect(result).toContain('Playpen');
      });
    });

    describe('createBBSPaths', () => {
      it('should create BBSPaths from config with get method', () => {
        const config = {
          get: jest.fn().mockReturnValue(testRoot),
        };

        const paths = createBBSPaths(config);
        expect(paths).toBeInstanceOf(BBSPaths);
        expect(paths.root()).toBe(testRoot);
        expect(config.get).toHaveBeenCalledWith('dataDir');
      });

      it('should create BBSPaths from config with dataDir property', () => {
        const config = {
          dataDir: testRoot,
        };

        const paths = createBBSPaths(config);
        expect(paths).toBeInstanceOf(BBSPaths);
        expect(paths.root()).toBe(testRoot);
      });

      it('should prefer get method over property', () => {
        const config = {
          get: jest.fn().mockReturnValue('/from-get'),
          dataDir: '/from-property',
        };

        const paths = createBBSPaths(config);
        expect(paths.root()).toBe('/from-get');
      });
    });

    describe('getAmigaAssignPaths', () => {
      it('should return standard Amiga assigns', () => {
        const assigns = getAmigaAssignPaths(testRoot, 0);

        expect(assigns['NODE0:']).toContain('Node0');
        expect(assigns['DOORS:']).toContain('Doors');
        expect(assigns['BBS:']).toBe(testRoot);
        expect(assigns['S:']).toContain(path.join(testRoot, 'S'));
      });

      it('should include all node assigns 0-9', () => {
        const assigns = getAmigaAssignPaths(testRoot, 0);

        for (let i = 0; i <= 9; i++) {
          expect(assigns[`NODE${i}:`]).toContain(`Node${i}`);
        }
      });

      it('should include PROGDIR when door name provided', () => {
        const assigns = getAmigaAssignPaths(testRoot, 0, 'MyDoor');

        expect(assigns['PROGDIR:']).toContain('Doors');
        expect(assigns['PROGDIR:']).toContain('MyDoor');
      });

      it('should not include PROGDIR without door name', () => {
        const assigns = getAmigaAssignPaths(testRoot, 0);

        expect(assigns['PROGDIR:']).toBeUndefined();
      });

      it('should work with different node numbers', () => {
        const assigns = getAmigaAssignPaths(testRoot, 5);

        expect(assigns['NODE5:']).toContain('Node5');
        expect(assigns['NODE0:']).toContain('Node0'); // Still includes all nodes
      });

      it('should return Record with string keys and values', () => {
        const assigns = getAmigaAssignPaths(testRoot, 0);

        Object.entries(assigns).forEach(([key, value]) => {
          expect(typeof key).toBe('string');
          expect(typeof value).toBe('string');
          expect(key).toMatch(/:/); // All assigns end with :
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty BBS root', () => {
      const paths = new BBSPaths('');
      expect(paths.root()).toBe('');
    });

    it('should handle BBS root with trailing slash', () => {
      const pathsWithSlash = new BBSPaths(testRoot + '/');
      expect(pathsWithSlash.screen('MENU.TXT')).toContain('MENU.TXT');
    });

    it('should handle conference number 0', () => {
      const paths = new BBSPaths(testRoot);
      expect(paths.conference(0)).toContain('Conf0');
    });

    it('should handle large conference numbers', () => {
      const paths = new BBSPaths(testRoot);
      expect(paths.conference(999)).toContain('Conf999');
    });

    it('should handle node number 0', () => {
      const node = new NodePaths(testRoot, 0);
      expect(node.root()).toContain('Node0');
    });

    it('should handle large node numbers', () => {
      const node = new NodePaths(testRoot, 999);
      expect(node.root()).toContain('Node999');
    });

    it('should handle special characters in filenames', () => {
      const paths = new BBSPaths(testRoot);
      expect(paths.screen('file-name.txt')).toContain('file-name.txt');
      expect(paths.system('under_score.dat')).toContain('under_score.dat');
    });

    it('should handle Amiga path with no subpath', () => {
      const paths = new BBSPaths(testRoot);
      expect(paths.resolveAmigaPath('DOORS:')).toContain('Doors');
    });

    it('should handle mixed case Amiga assigns', () => {
      const paths = new BBSPaths(testRoot);
      expect(paths.resolveAmigaPath('DoOrS:test')).toContain('Doors');
      expect(paths.resolveAmigaPath('NoDE0:test')).toContain('Node0');
    });
  });
});
