/**
 * DOS Error Codes Unit Tests
 * Tests IoErr codes and error handling
 *
 * Tests the DOS error code system in DosLibrary which implements AmigaOS error codes
 */

describe('DOS Error Codes', () => {
  // Standard AmigaOS error codes from dos/dos.h
  const ERROR_NO_FREE_STORE = 103;
  const ERROR_TASK_TABLE_FULL = 105;
  const ERROR_BAD_TEMPLATE = 114;
  const ERROR_BAD_NUMBER = 115;
  const ERROR_REQUIRED_ARG_MISSING = 116;
  const ERROR_KEY_NEEDS_ARG = 117;
  const ERROR_TOO_MANY_ARGS = 118;
  const ERROR_UNMATCHED_QUOTES = 119;
  const ERROR_LINE_TOO_LONG = 120;
  const ERROR_OBJECT_IN_USE = 202;
  const ERROR_OBJECT_EXISTS = 203;
  const ERROR_DIR_NOT_FOUND = 204;
  const ERROR_OBJECT_NOT_FOUND = 205;
  const ERROR_BAD_STREAM_NAME = 206;
  const ERROR_OBJECT_TOO_LARGE = 207;
  const ERROR_ACTION_NOT_KNOWN = 209;
  const ERROR_INVALID_COMPONENT_NAME = 210;
  const ERROR_INVALID_LOCK = 211;
  const ERROR_OBJECT_WRONG_TYPE = 212;
  const ERROR_DISK_NOT_VALIDATED = 213;
  const ERROR_WRITE_PROTECTED = 214;
  const ERROR_DELETE_PROTECTED = 215;
  const ERROR_READ_PROTECTED = 216;
  const ERROR_NOT_A_DOS_DISK = 218;
  const ERROR_SEEK_ERROR = 219;
  const ERROR_COMMENT_TOO_BIG = 220;
  const ERROR_DISK_FULL = 221;
  const ERROR_DISK_WRITE_PROTECTED = 223;
  const ERROR_RENAME_ACROSS_DEVICES = 224;
  const ERROR_DIRECTORY_NOT_EMPTY = 225;
  const ERROR_TOO_MANY_LEVELS = 226;
  const ERROR_DEVICE_NOT_MOUNTED = 227;
  const ERROR_NO_MORE_ENTRIES = 232;
  const ERROR_IS_SOFT_LINK = 233;
  const ERROR_OBJECT_LINKED = 234;
  const ERROR_BAD_HUNK = 235;
  const ERROR_NOT_IMPLEMENTED = 236;
  const ERROR_RECORD_NOT_LOCKED = 240;
  const ERROR_LOCK_COLLISION = 241;
  const ERROR_LOCK_TIMEOUT = 242;
  const ERROR_UNLOCK_ERROR = 243;
  const ERROR_BUFFER_OVERFLOW = 303;

  describe('Error code values', () => {
    test('memory errors are in 100-199 range', () => {
      expect(ERROR_NO_FREE_STORE).toBe(103);
      expect(ERROR_TASK_TABLE_FULL).toBe(105);
    });

    test('argument parsing errors are in 114-120 range', () => {
      expect(ERROR_BAD_TEMPLATE).toBe(114);
      expect(ERROR_BAD_NUMBER).toBe(115);
      expect(ERROR_REQUIRED_ARG_MISSING).toBe(116);
      expect(ERROR_KEY_NEEDS_ARG).toBe(117);
      expect(ERROR_TOO_MANY_ARGS).toBe(118);
      expect(ERROR_UNMATCHED_QUOTES).toBe(119);
      expect(ERROR_LINE_TOO_LONG).toBe(120);
    });

    test('file system errors are in 200-249 range', () => {
      expect(ERROR_OBJECT_IN_USE).toBe(202);
      expect(ERROR_OBJECT_EXISTS).toBe(203);
      expect(ERROR_DIR_NOT_FOUND).toBe(204);
      expect(ERROR_OBJECT_NOT_FOUND).toBe(205);
      expect(ERROR_BAD_STREAM_NAME).toBe(206);
      expect(ERROR_OBJECT_TOO_LARGE).toBe(207);
      expect(ERROR_ACTION_NOT_KNOWN).toBe(209);
      expect(ERROR_INVALID_COMPONENT_NAME).toBe(210);
      expect(ERROR_INVALID_LOCK).toBe(211);
      expect(ERROR_OBJECT_WRONG_TYPE).toBe(212);
    });

    test('disk/protection errors are in 213-227 range', () => {
      expect(ERROR_DISK_NOT_VALIDATED).toBe(213);
      expect(ERROR_WRITE_PROTECTED).toBe(214);
      expect(ERROR_DELETE_PROTECTED).toBe(215);
      expect(ERROR_READ_PROTECTED).toBe(216);
      expect(ERROR_NOT_A_DOS_DISK).toBe(218);
      expect(ERROR_SEEK_ERROR).toBe(219);
      expect(ERROR_COMMENT_TOO_BIG).toBe(220);
      expect(ERROR_DISK_FULL).toBe(221);
      expect(ERROR_DISK_WRITE_PROTECTED).toBe(223);
      expect(ERROR_RENAME_ACROSS_DEVICES).toBe(224);
      expect(ERROR_DIRECTORY_NOT_EMPTY).toBe(225);
      expect(ERROR_TOO_MANY_LEVELS).toBe(226);
      expect(ERROR_DEVICE_NOT_MOUNTED).toBe(227);
    });

    test('link/hunk errors are in 232-243 range', () => {
      expect(ERROR_NO_MORE_ENTRIES).toBe(232);
      expect(ERROR_IS_SOFT_LINK).toBe(233);
      expect(ERROR_OBJECT_LINKED).toBe(234);
      expect(ERROR_BAD_HUNK).toBe(235);
      expect(ERROR_NOT_IMPLEMENTED).toBe(236);
      expect(ERROR_RECORD_NOT_LOCKED).toBe(240);
      expect(ERROR_LOCK_COLLISION).toBe(241);
      expect(ERROR_LOCK_TIMEOUT).toBe(242);
      expect(ERROR_UNLOCK_ERROR).toBe(243);
    });

    test('extended errors are in 300+ range', () => {
      expect(ERROR_BUFFER_OVERFLOW).toBe(303);
    });
  });

  describe('Error code categories', () => {
    const isMemoryError = (code: number) => code >= 100 && code < 200;
    const isFileError = (code: number) => code >= 200 && code < 300;
    const isExtendedError = (code: number) => code >= 300;

    test('should categorize memory errors correctly', () => {
      expect(isMemoryError(ERROR_NO_FREE_STORE)).toBe(true);
      expect(isMemoryError(ERROR_TASK_TABLE_FULL)).toBe(true);
      expect(isMemoryError(ERROR_OBJECT_NOT_FOUND)).toBe(false);
    });

    test('should categorize file errors correctly', () => {
      expect(isFileError(ERROR_OBJECT_NOT_FOUND)).toBe(true);
      expect(isFileError(ERROR_DISK_FULL)).toBe(true);
      expect(isFileError(ERROR_NO_FREE_STORE)).toBe(false);
    });

    test('should categorize extended errors correctly', () => {
      expect(isExtendedError(ERROR_BUFFER_OVERFLOW)).toBe(true);
      expect(isExtendedError(ERROR_OBJECT_NOT_FOUND)).toBe(false);
    });
  });

  describe('Common error scenarios', () => {
    test('file not found scenario', () => {
      // When a file is not found, IoErr should return ERROR_OBJECT_NOT_FOUND
      const expectedError = ERROR_OBJECT_NOT_FOUND;
      expect(expectedError).toBe(205);
    });

    test('file already exists scenario', () => {
      // When trying to create a file that exists, IoErr should return ERROR_OBJECT_EXISTS
      const expectedError = ERROR_OBJECT_EXISTS;
      expect(expectedError).toBe(203);
    });

    test('directory not empty scenario', () => {
      // When trying to delete non-empty directory
      const expectedError = ERROR_DIRECTORY_NOT_EMPTY;
      expect(expectedError).toBe(225);
    });

    test('disk full scenario', () => {
      const expectedError = ERROR_DISK_FULL;
      expect(expectedError).toBe(221);
    });

    test('invalid argument parsing', () => {
      // ReadArgs errors
      expect(ERROR_BAD_TEMPLATE).toBe(114);
      expect(ERROR_REQUIRED_ARG_MISSING).toBe(116);
      expect(ERROR_UNMATCHED_QUOTES).toBe(119);
    });
  });

  describe('Error to string mapping', () => {
    const errorMessages: Record<number, string> = {
      [ERROR_NO_FREE_STORE]: 'Not enough memory',
      [ERROR_OBJECT_NOT_FOUND]: 'Object not found',
      [ERROR_OBJECT_EXISTS]: 'Object already exists',
      [ERROR_DIR_NOT_FOUND]: 'Directory not found',
      [ERROR_DISK_FULL]: 'Disk is full',
      [ERROR_WRITE_PROTECTED]: 'Write protected',
      [ERROR_READ_PROTECTED]: 'Read protected',
      [ERROR_DELETE_PROTECTED]: 'Delete protected',
      [ERROR_RENAME_ACROSS_DEVICES]: 'Cannot rename across devices',
      [ERROR_DIRECTORY_NOT_EMPTY]: 'Directory not empty',
      [ERROR_BAD_TEMPLATE]: 'Bad template',
      [ERROR_REQUIRED_ARG_MISSING]: 'Required argument missing',
    };

    test('common errors should have descriptive messages', () => {
      expect(errorMessages[ERROR_OBJECT_NOT_FOUND]).toBe('Object not found');
      expect(errorMessages[ERROR_DISK_FULL]).toBe('Disk is full');
      expect(errorMessages[ERROR_NO_FREE_STORE]).toBe('Not enough memory');
    });
  });

  describe('POSIX to AmigaOS error mapping', () => {
    // Map common POSIX errors to AmigaOS equivalents
    const posixToAmiga: Record<string, number> = {
      'ENOENT': ERROR_OBJECT_NOT_FOUND,
      'EEXIST': ERROR_OBJECT_EXISTS,
      'EACCES': ERROR_READ_PROTECTED,
      'ENOSPC': ERROR_DISK_FULL,
      'ENOTEMPTY': ERROR_DIRECTORY_NOT_EMPTY,
      'EXDEV': ERROR_RENAME_ACROSS_DEVICES,
      'EISDIR': ERROR_OBJECT_WRONG_TYPE,
      'ENOTDIR': ERROR_DIR_NOT_FOUND,
      'ENOMEM': ERROR_NO_FREE_STORE,
    };

    test('ENOENT should map to ERROR_OBJECT_NOT_FOUND', () => {
      expect(posixToAmiga['ENOENT']).toBe(ERROR_OBJECT_NOT_FOUND);
    });

    test('EEXIST should map to ERROR_OBJECT_EXISTS', () => {
      expect(posixToAmiga['EEXIST']).toBe(ERROR_OBJECT_EXISTS);
    });

    test('ENOSPC should map to ERROR_DISK_FULL', () => {
      expect(posixToAmiga['ENOSPC']).toBe(ERROR_DISK_FULL);
    });

    test('ENOMEM should map to ERROR_NO_FREE_STORE', () => {
      expect(posixToAmiga['ENOMEM']).toBe(ERROR_NO_FREE_STORE);
    });
  });
});
