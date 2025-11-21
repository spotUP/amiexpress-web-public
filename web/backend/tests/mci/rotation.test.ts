import { sequentialFileManager, formatNumberedFilename } from '../../src/services/SequentialFileManager';

describe('MCI rotation (~SX_/~SR_) parity', () => {
  const base = 'Screens/logon.txt';

  beforeEach(() => {
    sequentialFileManager.resetCounter(base);
  });

  test('formatNumberedFilename uses 3-digit prefix', () => {
    expect(formatNumberedFilename(base, 3)).toBe('Screens/003.logon.txt');
    expect(formatNumberedFilename(base, 12)).toBe('Screens/012.logon.txt');
  });

  test('~SX_ counter starts at 1 and increments with zero padding', () => {
    const first = sequentialFileManager.getNextFile(base);
    const second = sequentialFileManager.getNextFile(base);
    expect(first.number).toBe(1);
    expect(first.filename).toBe('Screens/001.logon.txt');
    expect(second.number).toBe(2);
    expect(second.filename).toBe('Screens/002.logon.txt');
  });

  test('resetCounter zeros state before next increment', () => {
    sequentialFileManager.getNextFile(base);
    sequentialFileManager.resetCounter(base);
    const next = sequentialFileManager.getNextFile(base);
    expect(next.number).toBe(1);
    expect(next.filename).toBe('Screens/001.logon.txt');
  });
});
