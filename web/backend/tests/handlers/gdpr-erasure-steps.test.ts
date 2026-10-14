import * as bcrypt from 'bcryptjs';
import { refuseErasureConfirm, refuseErasurePassword, refuseErasureUsername, myDataRows } from '../../src/handlers/user/gdpr.handler';

const user: any = { username: 'Spot', passwordHash: bcrypt.hashSync('Abc123!x', 4), realname: 'Johan', location: 'Old Town', secLevel: 10 };
test('the three questions refuse with the texts the board flow prints', async () => {
  expect(refuseErasureConfirm('yes erase')).toBe('Deletion cancelled.');
  expect(refuseErasureConfirm('YES ERASE')).toBeNull();
  expect(await refuseErasurePassword(user, 'wrong')).toBe('Password incorrect. Deletion cancelled.');
  expect(await refuseErasurePassword({ ...user, passwordHash: '' }, 'x')).toBe('No password set on this account. Contact the sysop.');
  expect(await refuseErasurePassword(user, 'Abc123!x')).toBeNull();
  expect(refuseErasureUsername(user, 'spot')).toBe('Username did not match. Deletion cancelled.');
  expect(refuseErasureUsername(user, 'Spot')).toBeNull();
});
test('the record a caller is shown is the one W 19 prints', () => {
  const rows = myDataRows(user);
  expect(rows[0]).toEqual(['Handle', 'Spot']);
  expect(rows.find(([k]) => k === 'Group')?.[1]).toBe('Old Town');
});
