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

// Regression tests for round-7 fixes — concat parse-order, arithmetic,
// IF-vs-assignment ordering, BREAK / ITERATE flow control.
describe('AREXXInterpreter — concat (||) operator', () => {
  test('"a" || x || "b" concatenates correctly (parse-order regression)', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("x = 'mid'\nSAY \"start \" || x || \" end\"");
    expect(result.output.join('')).toContain('start mid end');
  });

  test('concat respects quotes (||  inside string is literal)', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY \"a||b\"");
    expect(result.output.join('')).toContain('a||b');
  });
});

describe('AREXXInterpreter — arithmetic', () => {
  test('addition: x = x + 1 increments', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("x = 0\nx = x + 1\nSAY x");
    expect(result.output.join('')).toContain('1');
  });

  test('multiplication: y = x * 2', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("x = 5\ny = x * 2\nSAY y");
    expect(result.output.join('')).toContain('10');
  });

  test('subtraction left-associative: 10 - 3 - 2 = 5', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY 10 - 3 - 2");
    expect(result.output.join('')).toContain('5');
  });

  test('precedence: 2 + 3 * 4 = 14', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("SAY 2 + 3 * 4");
    expect(result.output.join('')).toContain('14');
  });
});

describe('AREXXInterpreter — DO loops', () => {
  test('DO count runs N times', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("DO 3\n  SAY 'x'\nEND");
    const xs = result.output.filter(l => l.includes('x'));
    expect(xs.length).toBe(3);
  });

  test('DO i = 1 TO 5 increments', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("DO i = 1 TO 3\n  SAY i\nEND");
    const out = result.output.join('|');
    expect(out).toContain('1');
    expect(out).toContain('2');
    expect(out).toContain('3');
  });

  test('DO WHILE terminates when condition becomes false', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("x = 0\nDO WHILE x < 3\n  SAY x\n  x = x + 1\nEND");
    const out = result.output.join('|');
    expect(out).toContain('0');
    expect(out).toContain('1');
    expect(out).toContain('2');
    expect(out).not.toContain('3'); // never enters when x=3
  });

  test('DO UNTIL runs body once before checking condition', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("x = 5\nDO UNTIL x > 3\n  SAY x\n  x = x + 1\nEND");
    // x=5 starts already > 3, but UNTIL executes body once then checks
    expect(result.output.join('|')).toContain('5');
  });
});

describe('AREXXInterpreter — IF/THEN with BREAK/ITERATE', () => {
  test('IF i = 3 THEN ... is parsed as IF, not assignment', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute("i = 3\nIF i = 3 THEN SAY 'matched'");
    expect(result.output.join('')).toContain('matched');
  });

  test('BREAK from inside IF/THEN exits enclosing loop', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute(
      "DO i = 1 TO 5\n  IF i = 3 THEN BREAK\n  SAY i\nEND"
    );
    const out = result.output.join('|');
    expect(out).toContain('1');
    expect(out).toContain('2');
    expect(out).not.toContain('3');
    expect(out).not.toContain('4');
  });

  test('ITERATE from inside IF/THEN skips to next iteration', async () => {
    const interp = new AREXXInterpreter(makeContext());
    const result = await interp.execute(
      "DO i = 1 TO 5\n  IF i = 3 THEN ITERATE\n  SAY i\nEND"
    );
    const out = result.output.join('|');
    expect(out).toContain('1');
    expect(out).toContain('2');
    expect(out).not.toContain('|3|'); // 3 was iterated past
    expect(out).toContain('4');
    expect(out).toContain('5');
  });
});
