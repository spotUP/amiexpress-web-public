/**
 * express.e:8303-8317 myDirProtect: '--------' with hsparwed letters; rwed are
 * active-low (set bit = denied), a/p/s/h active-high.
 */
jest.mock('../../src/database', () => ({ db: {} }));
import { myDirProtect } from '../../src/handlers/message/message-entry.handler';

describe('myDirProtect', () => {
  it('bits 0 (everything allowed) read ----rwed', () => {
    expect(myDirProtect(0)).toBe('----rwed');
  });
  it('a set rwed bit is shown as denied', () => {
    expect(myDirProtect(0x01 | 0x04)).toBe('----r-e-');
    expect(myDirProtect(0x0f)).toBe('--------');
  });
  it('the high bits are active-high: a p s h', () => {
    expect(myDirProtect(0xf0 | 0x0f)).toBe('hspa----');
    expect(myDirProtect(0x10 | 0x0f)).toBe('---a----');
  });
});
