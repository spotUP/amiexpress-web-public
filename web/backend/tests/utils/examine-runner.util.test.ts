/**
 * Unit tests for examine-runner.util.ts
 * Tests EXAMINE command execution for file testing/extraction
 */

import {
  runExamineCommands,
  runExamineCommandsForDiz,
  runExamineCommandsForTesting,
  fileExists,
  ExaminePlaceholders,
  ExamineValidator
} from '../../src/utils/examine-runner.util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';

// Mock child_process and fs/promises
jest.mock('child_process');
jest.mock('fs/promises');

describe('examine-runner.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await fileExists('/path/to/file.txt');
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/path/to/file.txt');
    });

    it('should return false when file does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await fileExists('/path/to/missing.txt');
      expect(result).toBe(false);
    });

    it('should handle permission errors as non-existent', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('EACCES'));

      const result = await fileExists('/path/to/forbidden.txt');
      expect(result).toBe(false);
    });
  });

  describe('runExamineCommands - placeholder substitution', () => {
    beforeEach(() => {
      // Mock successful exec
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });
    });

    it('should replace %f with filepath', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip'
      };

      await runExamineCommands(['unzip %f'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'unzip /uploads/test.zip',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should replace %p with parent directory', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip',
        parentDir: '/uploads'
      };

      await runExamineCommands(['cd %p && ls'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'cd /uploads && ls',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should replace %w with work directory', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip',
        workDir: '/tmp/work'
      };

      await runExamineCommands(['unzip %f -d %w'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'unzip /uploads/test.zip -d /tmp/work',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should replace %n with basename', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip',
        basename: 'test.zip'
      };

      await runExamineCommands(['echo %n'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'echo test.zip',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should auto-fill parent directory from filepath', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip'
      };

      await runExamineCommands(['cd %p'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'cd /uploads',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should auto-fill basename from filepath', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/subdir/archive.lha'
      };

      await runExamineCommands(['echo %n'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'echo archive.lha',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should replace multiple placeholders in one command', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip',
        workDir: '/tmp/work'
      };

      await runExamineCommands(['unzip %f -d %w && cd %w'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'unzip /uploads/test.zip -d /tmp/work && cd /tmp/work',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle commands without placeholders', async () => {
      const placeholders: ExaminePlaceholders = {
        filepath: '/uploads/test.zip'
      };

      await runExamineCommands(['ls -la'], placeholders);

      expect(exec).toHaveBeenCalledWith(
        'ls -la',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('runExamineCommands - execution behavior', () => {
    it('should return false when no commands provided', async () => {
      const result = await runExamineCommands([], { filepath: '/test' });
      expect(result).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });

    it('should skip empty commands', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await runExamineCommands(
        ['', '  ', 'echo test'],
        { filepath: '/test' }
      );

      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledWith(
        'echo test',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should execute multiple commands in sequence', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        { filepath: '/test' }
      );

      expect(exec).toHaveBeenCalledTimes(3);
    });

    it('should pass timeout to exec', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(
        ['test'],
        { filepath: '/test' },
        undefined,
        false,
        30000
      );

      expect(exec).toHaveBeenCalledWith(
        'test',
        { timeout: 30000 },
        expect.any(Function)
      );
    });

    it('should use default timeout of 60000ms', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(['test'], { filepath: '/test' });

      expect(exec).toHaveBeenCalledWith(
        'test',
        { timeout: 60000 },
        expect.any(Function)
      );
    });
  });

  describe('runExamineCommands - stopOnFailure mode', () => {
    it('should stop on first failure when stopOnFailure is true', async () => {
      (exec as unknown as jest.Mock)
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Command failed'), null);
        })
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await runExamineCommands(
        ['cmd1', 'cmd2'],
        { filepath: '/test' },
        undefined,
        true // stopOnFailure
      );

      expect(result).toBe(false);
      expect(exec).toHaveBeenCalledTimes(1); // Only first command executed
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[EXAMINE] Command failed')
      );
    });

    it('should continue on failure when stopOnFailure is false', async () => {
      (exec as unknown as jest.Mock)
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Command failed'), null);
        })
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await runExamineCommands(
        ['cmd1', 'cmd2'],
        { filepath: '/test' },
        undefined,
        false // continue on failure
      );

      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledTimes(2); // Both commands executed
    });

    it('should return false when all commands fail with stopOnFailure false', async () => {
      jest.resetAllMocks();
      (exec as unknown as jest.Mock)
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Command failed'), null);
          return {};
        })
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Command failed'), null);
          return {};
        })
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Command failed'), null);
          return {};
        });

      const result = await runExamineCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        { filepath: '/test' },
        undefined,
        false
      );

      expect(result).toBe(false);
      expect(exec).toHaveBeenCalledTimes(3);
    });
  });

  describe('runExamineCommands - validator callback', () => {
    it('should call validator after successful command execution', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const validator = jest.fn().mockResolvedValue(true);

      await runExamineCommands(
        ['test'],
        { filepath: '/test' },
        validator
      );

      expect(validator).toHaveBeenCalled();
    });

    it('should return true when validator returns true', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const validator = jest.fn().mockResolvedValue(true);

      const result = await runExamineCommands(
        ['test'],
        { filepath: '/test' },
        validator
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[EXAMINE] Validation succeeded')
      );
    });

    it('should continue to next command when validator returns false', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const validator = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await runExamineCommands(
        ['cmd1', 'cmd2'],
        { filepath: '/test' },
        validator
      );

      expect(result).toBe(true);
      expect(validator).toHaveBeenCalledTimes(2);
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('should not call validator when command fails', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(new Error('Command failed'), null);
      });

      const validator = jest.fn();

      await runExamineCommands(
        ['test'],
        { filepath: '/test' },
        validator,
        false
      );

      expect(validator).not.toHaveBeenCalled();
    });

    it('should return true on first successful validation', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const validator = jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await runExamineCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        { filepath: '/test' },
        validator
      );

      expect(result).toBe(true);
      expect(validator).toHaveBeenCalledTimes(2); // Stops after second validation succeeds
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('runExamineCommandsForDiz', () => {
    beforeEach(() => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.access as jest.Mock).mockResolvedValue(undefined);
    });

    it('should create work directory', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['unzip %f -d %w']
      );

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/work', { recursive: true });
    });

    it('should check for FILE_ID.DIZ after extraction', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['unzip %f -d %w']
      );

      expect(fs.access).toHaveBeenCalledWith('/tmp/work/FILE_ID.DIZ');
    });

    it('should return true when FILE_ID.DIZ is extracted', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });
      (fs.access as jest.Mock).mockResolvedValue(undefined); // File exists

      const result = await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['unzip %f -d %w']
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[FILE_ID.DIZ] Successfully extracted')
      );
    });

    it('should return false when FILE_ID.DIZ is not extracted', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['unzip %f -d %w']
      );

      expect(result).toBe(false);
    });

    it('should use 30 second timeout', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['test']
      );

      expect(exec).toHaveBeenCalledWith(
        'test',
        { timeout: 30000 },
        expect.any(Function)
      );
    });

    it('should continue trying commands until FILE_ID.DIZ is found', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      (fs.access as jest.Mock)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined);

      const result = await runExamineCommandsForDiz(
        '/uploads/test.zip',
        '/tmp/work',
        ['cmd1', 'cmd2']
      );

      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('runExamineCommandsForTesting', () => {
    it('should return true when no commands provided', async () => {
      const result = await runExamineCommandsForTesting('/test.zip', []);
      expect(result).toBe(true);
      expect(exec).not.toHaveBeenCalled();
    });

    it('should stop on first failure', async () => {
      (exec as unknown as jest.Mock)
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(new Error('Virus detected'), null);
        })
        .mockImplementationOnce((cmd: string, opts: any, callback: any) => {
          callback(null, { stdout: '', stderr: '' });
        });

      const result = await runExamineCommandsForTesting(
        '/test.zip',
        ['antivirus %f', 'checksumverify %f']
      );

      expect(result).toBe(false);
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('should return true when all tests pass', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await runExamineCommandsForTesting(
        '/test.zip',
        ['test1 %f', 'test2 %f', 'test3 %f']
      );

      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledTimes(3);
    });

    it('should use 60 second timeout', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommandsForTesting('/test.zip', ['test']);

      expect(exec).toHaveBeenCalledWith(
        'test',
        { timeout: 60000 },
        expect.any(Function)
      );
    });

    it('should not use validator callback', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await runExamineCommandsForTesting(
        '/test.zip',
        ['test']
      );

      expect(result).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in file paths', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(
        ['test %f'],
        { filepath: '/path/with spaces/file (1).zip' }
      );

      expect(exec).toHaveBeenCalledWith(
        'test /path/with spaces/file (1).zip',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle Windows-style paths', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(
        ['test %f'],
        { filepath: 'C:\\uploads\\test.zip' }
      );

      expect(exec).toHaveBeenCalledWith(
        'test C:\\uploads\\test.zip',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should handle timeout errors', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        const error = new Error('Command timeout');
        (error as any).code = 'ETIMEDOUT';
        callback(error, null);
      });

      const result = await runExamineCommands(
        ['slow-command'],
        { filepath: '/test' },
        undefined,
        true
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Command failed')
      );
    });

    it('should handle empty filepath gracefully', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await runExamineCommands(
        ['test %f'],
        { filepath: '' }
      );

      expect(exec).toHaveBeenCalledWith(
        'test ',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
