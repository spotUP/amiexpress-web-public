import path from 'path';

// Strip the Doors/ prefix logic, extracted for unit testing
function normalizeDoorName(identifier: string): string {
  return identifier.replace(/^Doors[\\/]/i, '');
}

describe('deleteTypeScriptDoor name normalization', () => {
  it('strips Doors/ prefix from identifier', () => {
    expect(normalizeDoorName('Doors/arkanoid')).toBe('arkanoid');
  });

  it('leaves bare name unchanged', () => {
    expect(normalizeDoorName('arkanoid')).toBe('arkanoid');
  });

  it('is case-insensitive on prefix', () => {
    expect(normalizeDoorName('doors/arkanoid')).toBe('arkanoid');
  });

  it('handles Windows-style separators', () => {
    expect(normalizeDoorName('Doors\\arkanoid')).toBe('arkanoid');
  });
});
