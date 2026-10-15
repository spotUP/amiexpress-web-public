import { parseMciCodes } from '../../src/handlers/screen.handler';

describe('~CR_ prompt handling', () => {
  test('marks hasPause and preserves prompt text', async () => {
    const session: any = { user: { secLevel: 10 } };
    const input = 'Hello~CR_Press a key||World';
    const result = await parseMciCodes(input, session);
    expect(result.parsed).toContain('Hello');
    expect(result.parsed).toContain('Press a key');
    expect(result.parsed).toContain('World');
    expect(result.hasPause).toBe(true);
  });
});
