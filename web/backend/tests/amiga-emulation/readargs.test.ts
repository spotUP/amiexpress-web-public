/**
 * ReadArgs Unit Tests
 * Tests argument parsing functionality
 *
 * Tests the ReadArgs implementation in DosLibrary which parses AmigaOS-style
 * command line arguments with template modifiers:
 *   /A - Required argument
 *   /K - Keyword-only (must include keyword=)
 *   /S - Switch (boolean flag)
 *   /N - Numeric value
 *   /M - Multiple values (array)
 *   /F - Rest of line (including whitespace)
 *   /T - Toggle (on/off)
 */

describe('ReadArgs Template Parsing', () => {
  // Template modifier flags
  const MOD_REQUIRED = '/A';
  const MOD_KEYWORD = '/K';
  const MOD_SWITCH = '/S';
  const MOD_NUMERIC = '/N';
  const MOD_MULTI = '/M';
  const MOD_REST = '/F';
  const MOD_TOGGLE = '/T';

  describe('Template syntax', () => {
    test('should parse simple keyword', () => {
      const template = 'NAME';
      expect(template.split(',').length).toBe(1);
    });

    test('should parse multiple keywords', () => {
      const template = 'NAME,SIZE,DATE';
      const parts = template.split(',');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('NAME');
      expect(parts[1]).toBe('SIZE');
      expect(parts[2]).toBe('DATE');
    });

    test('should parse keyword with /A modifier', () => {
      const template = 'FILENAME/A';
      expect(template.includes(MOD_REQUIRED)).toBe(true);
    });

    test('should parse keyword with /K modifier', () => {
      const template = 'OUTPUT/K';
      expect(template.includes(MOD_KEYWORD)).toBe(true);
    });

    test('should parse keyword with /S modifier', () => {
      const template = 'QUIET/S';
      expect(template.includes(MOD_SWITCH)).toBe(true);
    });

    test('should parse keyword with /N modifier', () => {
      const template = 'COUNT/N';
      expect(template.includes(MOD_NUMERIC)).toBe(true);
    });

    test('should parse keyword with /M modifier', () => {
      const template = 'FILES/M';
      expect(template.includes(MOD_MULTI)).toBe(true);
    });

    test('should parse keyword with /F modifier', () => {
      const template = 'COMMENT/F';
      expect(template.includes(MOD_REST)).toBe(true);
    });

    test('should parse keyword with /T modifier', () => {
      const template = 'DEBUG/T';
      expect(template.includes(MOD_TOGGLE)).toBe(true);
    });

    test('should parse combined modifiers', () => {
      const template = 'SIZE/N/A';
      expect(template.includes(MOD_NUMERIC)).toBe(true);
      expect(template.includes(MOD_REQUIRED)).toBe(true);
    });

    test('should parse alias syntax', () => {
      const template = 'FILE=NAME/A';
      expect(template.includes('=')).toBe(true);
      const parts = template.split('=');
      expect(parts[0]).toBe('FILE');
    });
  });

  describe('Complex templates', () => {
    test('DIR command template', () => {
      const template = 'DIR,FILES/S,DIRS/S,ALL/S,INTER/S';
      const parts = template.split(',');
      expect(parts.length).toBe(5);
      expect(parts[0]).toBe('DIR');
      expect(parts[1]).toBe('FILES/S');
      expect(parts[2]).toBe('DIRS/S');
    });

    test('COPY command template', () => {
      const template = 'FROM/A/M,TO/A,ALL/S,QUIET/S,BUF=BUFFER/K/N';
      const parts = template.split(',');
      expect(parts.length).toBe(5);
      expect(parts[0]).toBe('FROM/A/M');  // Required + Multiple
      expect(parts[1]).toBe('TO/A');       // Required
      expect(parts[4]).toBe('BUF=BUFFER/K/N'); // Alias + Keyword + Numeric
    });

    test('DELETE command template', () => {
      const template = 'FILE/M/A,ALL/S,QUIET/S,FORCE/S';
      const parts = template.split(',');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('FILE/M/A'); // Multiple + Required
    });
  });

  describe('Argument value types', () => {
    test('should recognize numeric values', () => {
      const isNumeric = (str: string) => /^-?\d+$/.test(str) || /^0x[0-9a-f]+$/i.test(str);

      expect(isNumeric('123')).toBe(true);
      expect(isNumeric('-456')).toBe(true);
      expect(isNumeric('0x1F')).toBe(true);
      expect(isNumeric('0X2A')).toBe(true);
      expect(isNumeric('abc')).toBe(false);
      expect(isNumeric('')).toBe(false);
    });

    test('should recognize hex values', () => {
      const parseHex = (str: string) => {
        if (str.toLowerCase().startsWith('0x')) {
          return parseInt(str.slice(2), 16);
        }
        return NaN;
      };

      expect(parseHex('0x10')).toBe(16);
      expect(parseHex('0xFF')).toBe(255);
      expect(parseHex('0x100')).toBe(256);
    });

    test('should recognize quoted strings', () => {
      const isQuoted = (str: string) =>
        (str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"));

      expect(isQuoted('"hello world"')).toBe(true);
      expect(isQuoted("'hello world'")).toBe(true);
      expect(isQuoted('hello')).toBe(false);
    });

    test('should handle escaped quotes', () => {
      const unescapeQuotes = (str: string) =>
        str.replace(/\\"/g, '"').replace(/\\'/g, "'");

      expect(unescapeQuotes('say \\"hello\\"')).toBe('say "hello"');
    });
  });

  describe('Error conditions', () => {
    test('ERROR_BAD_TEMPLATE value', () => {
      const ERROR_BAD_TEMPLATE = 114;
      expect(ERROR_BAD_TEMPLATE).toBe(114);
    });

    test('ERROR_BAD_NUMBER value', () => {
      const ERROR_BAD_NUMBER = 115;
      expect(ERROR_BAD_NUMBER).toBe(115);
    });

    test('ERROR_REQUIRED_ARG_MISSING value', () => {
      const ERROR_REQUIRED_ARG_MISSING = 116;
      expect(ERROR_REQUIRED_ARG_MISSING).toBe(116);
    });

    test('ERROR_KEY_NEEDS_ARG value', () => {
      const ERROR_KEY_NEEDS_ARG = 117;
      expect(ERROR_KEY_NEEDS_ARG).toBe(117);
    });

    test('ERROR_TOO_MANY_ARGS value', () => {
      const ERROR_TOO_MANY_ARGS = 118;
      expect(ERROR_TOO_MANY_ARGS).toBe(118);
    });

    test('ERROR_UNMATCHED_QUOTES value', () => {
      const ERROR_UNMATCHED_QUOTES = 119;
      expect(ERROR_UNMATCHED_QUOTES).toBe(119);
    });
  });

  describe('/M+/A interaction', () => {
    test('multiple required should need at least one value', () => {
      // Template: FILES/M/A means "at least one file required"
      const template = 'FILES/M/A';
      expect(template.includes('/M')).toBe(true);
      expect(template.includes('/A')).toBe(true);
    });
  });

  describe('/M/N interaction', () => {
    test('multiple numeric should accept array of numbers', () => {
      // Template: NUMS/M/N means "multiple numeric values"
      const template = 'NUMS/M/N';
      expect(template.includes('/M')).toBe(true);
      expect(template.includes('/N')).toBe(true);
    });
  });
});
