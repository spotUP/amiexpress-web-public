// @ts-nocheck

describe('modeCmd (door slash command)', () => {
  let modeCmd: any;
  beforeAll(() => {
    modeCmd = require('../../../../Doors/livechat/commands/mode').modeCmd;
  });

  it('rejects empty args', () => {
    const r = modeCmd.handler({}, []);
    expect(r.error).toBeTruthy();
  });

  it('rejects mode strings that do not start with + or -', () => {
    const r = modeCmd.handler({}, ['xyz']);
    expect(r.error).toBeTruthy();
  });

  it('parses +i with no params', () => {
    const r = modeCmd.handler({}, ['+i']);
    expect(r.data.modeString).toBe('+i');
    expect(r.data.params).toEqual([]);
  });

  it('parses +o alice with one param', () => {
    const r = modeCmd.handler({}, ['+o', 'alice']);
    expect(r.data.modeString).toBe('+o');
    expect(r.data.params).toEqual(['alice']);
  });

  it('parses combined +mi (no params)', () => {
    const r = modeCmd.handler({}, ['+mi']);
    expect(r.data.modeString).toBe('+mi');
    expect(r.data.params).toEqual([]);
  });

  it('parses alternating signs +m-i', () => {
    const r = modeCmd.handler({}, ['+m-i']);
    expect(r.data.modeString).toBe('+m-i');
  });
});
