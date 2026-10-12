/**
 * The expert byte of user.data (express.e UserData.expert, a CHAR).
 *
 * Values express.e knows: 'X' = expert mode on (menus suppressed, express.e
 * 24595, 26114-26119, 28583) and 'N' = off (the new-account default, 30452).
 * Nothing else is ever stored. Callers speak it as 'X'/'N' (the User type),
 * as a boolean (the admin form's checkbox) or as 1/0 (the users.expert
 * column); expertLetter folds all of them to the one letter.
 */

export const EXPERT_X = 0x58;
export const EXPERT_N = 0x4e;

export type ExpertLetter = 'X' | 'N';

export function expertLetter(value: unknown): ExpertLetter {
  if (value === true || value === 1 || value === '1') return 'X';
  return String(value ?? '').toUpperCase() === 'X' ? 'X' : 'N';
}

export function expertToByte(expert: unknown): number {
  return expertLetter(expert) === 'X' ? EXPERT_X : EXPERT_N;
}

/** '' for a byte that is neither letter (the old writer's 0x01). */
export function byteToExpert(byte: number): string {
  if (byte === EXPERT_X) return 'X';
  if (byte === EXPERT_N) return 'N';
  return '';
}
