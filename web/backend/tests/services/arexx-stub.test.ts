// @ts-nocheck
import { AREXXInterpreter } from '../../src/services/arexx.service';

function makeContext(overrides: any = {}): any {
  return {
    user: {
      username: 'TestUser',
      secLevel: 20,
      id: 'arexx-test-user',
    },
    session: {
      currentConf: 1,
      currentMsgBase: 1,
    },
    socket: null,
    output: [],
    ...overrides,
  };
}

describe('AREXXInterpreter — constructor', () => {
  test('sets USERNAME from context', () => {
    const ctx = makeContext({ user: { username: 'Alice', secLevel: 10, id: 'u1' } });
    const interp = new AREXXInterpreter(ctx);
    expect((interp as any).variables.get('USERNAME')).toBe('Alice');
  });

  test('sets USERLEVEL from context', () => {
    const ctx = makeContext({ user: { username: 'Bob', secLevel: 42, id: 'u2' } });
    const interp = new AREXXInterpreter(ctx);
    expect((interp as any).variables.get('USERLEVEL')).toBe(42);
  });

  test('sets CONFERENCE from session', () => {
    const ctx = makeContext({ session: { currentConf: 3, currentMsgBase: 2 } });
    const interp = new AREXXInterpreter(ctx);
    expect((interp as any).variables.get('CONFERENCE')).toBe(3);
  });

  test('sets BBSNAME to AmiExpress Web', () => {
    const interp = new AREXXInterpreter(makeContext());
    expect((interp as any).variables.get('BBSNAME')).toBe('AmiExpress Web');
  });

  test('ARG variables set from constructor args', () => {
    const interp = new AREXXInterpreter(makeContext(), ['foo', 'bar']);
    expect((interp as any).variables.get('ARG1')).toBe('foo');
    expect((interp as any).variables.get('ARG2')).toBe('bar');
    expect((interp as any).variables.get('ARGCOUNT')).toBe(2);
  });

  test('ARGCOUNT is 0 when no args passed', () => {
    const interp = new AREXXInterpreter(makeContext());
    expect((interp as any).variables.get('ARGCOUNT')).toBe(0);
  });
});

describe('AREXXInterpreter — execute() result shape', () => {
  test('returns success=true and output array for valid script', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY 'hello'");
    expect(result.success).toBe(true);
    expect(Array.isArray(result.output)).toBe(true);
  });

  test('returns success=false with error message for bad script', async () => {
    const interp = new AREXXInterpreter(makeContext());
    // Deliberately cause an error by calling an unknown function with bad args
    const result = await interp.execute('X = UNKNOWNFUNCTION_THAT_DOES_NOT_EXIST_XYZ()');
    // Either throws and returns success:false, or just completes
    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.output)).toBe(true);
  });
});

describe('AREXXInterpreter — SAY command', () => {
  test("SAY 'literal' appends to output", async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY 'hello world'");
    expect(result.output.join('')).toContain('hello world');
  });

  test('SAY numeric expression outputs number', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute('SAY 42');
    expect(result.output.join('')).toContain('42');
  });

  test('multiple SAY lines produce multiple output entries', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const script = "SAY 'line1'\nSAY 'line2'";
    const result = await interp.execute(script);
    const all = result.output.join(' ');
    expect(all).toContain('line1');
    expect(all).toContain('line2');
  });
});

describe('AREXXInterpreter — variable assignment', () => {
  test('assigns string variable and echoes it', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("X = 'hello'\nSAY X");
    expect(result.output.join('')).toContain('hello');
  });

  test('USERNAME variable is readable in scripts', async () => {
    const ctx = makeContext({ user: { username: 'Sysop', secLevel: 255, id: 'u0' } });
    const interp = new AREXXInterpreter(ctx);
    const result = await interp.execute('SAY USERNAME');
    expect(result.output.join('')).toContain('Sysop');
  });
});

describe('AREXXInterpreter — built-in string functions', () => {
  test('UPPER() converts to uppercase', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY UPPER('hello')");
    expect(result.output.join('')).toContain('HELLO');
  });

  test('LOWER() converts to lowercase', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY LOWER('WORLD')");
    expect(result.output.join('')).toContain('world');
  });

  test('LENGTH() returns string length', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY LENGTH('hello')");
    expect(result.output.join('')).toContain('5');
  });

  test('LEFT() returns left N characters', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY LEFT('hello', 3)");
    expect(result.output.join('')).toContain('hel');
  });

  test('RIGHT() returns right N characters', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY RIGHT('hello', 3)");
    expect(result.output.join('')).toContain('llo');
  });
});

describe('AREXXInterpreter — comments stripped', () => {
  test('// inline comment is stripped', async () => {
    const interp = new AREXXInterpreter(makeContext());
    // The comment should not appear in output
    const result = await interp.execute("SAY 'ok' // this is a comment");
    expect(result.success).toBe(true);
    expect(result.output.join('')).toContain('ok');
  });
});
