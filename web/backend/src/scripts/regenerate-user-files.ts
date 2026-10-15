
import { Database } from '../database';
import { userFileManager } from '../services/UserFileManager';

async function regenerate() {
console.log('Regenerating user files...');
  
  const db = new Database();
  await db.init();

  const users = await db.getUsers();
console.log(`Found ${users.length} users in database.`);

  // A SLOT IS THE ACCOUNT'S IDENTITY, not its position in a query.
  //
  // This assigned `slot = i + 1` from the order getUsers happened to return,
  // so every run renumbered every account - and user.misc, which is indexed
  // by the SAME slot, was not renumbered with it. The lockout bytes, the
  // password age and the rest then belonged to whoever landed on that offset
  // next: 'coffe was blocked but dalton is shown as blocked' is exactly that,
  // two accounts one slot apart (live, 2026-09-13).
  //
  // An account that already has a slot keeps it. Only an account with none
  // gets one, and it gets the first free one rather than a position.
  const withSlots = users.filter((u: any) => Number.isInteger(u.slotNumber) && u.slotNumber > 0);
  const taken = new Set<number>(withSlots.map((u: any) => u.slotNumber as number));
  let nextFree = 1;
  const slotFor = (u: any): number => {
    if (Number.isInteger(u.slotNumber) && u.slotNumber > 0) return u.slotNumber;
    while (taken.has(nextFree)) nextFree += 1;
    taken.add(nextFree);
    return nextFree;
  };

  // Clearing is safe now only because every write below names its own slot:
  // writeUserFiles used to append, so this pair rebuilt the file in query
  // order and duplicated anything already there.
  userFileManager.initializeUserFiles();

  for (const user of users) {
    const slot = slotFor(user);
console.log(`Writing user ${user.username} to slot ${slot}...`);
    userFileManager.writeUserFiles(user, slot);
    if (user.slotNumber !== slot) {
console.log(`Recording slot ${slot} for ${user.username} (had ${user.slotNumber ?? 'none'})`);
      await db.updateUser(user.id, { slotNumber: slot });
    }
  }
console.log('Done.');
  process.exit(0);
}

regenerate().catch((err) => {
console.error(err);
  process.exit(1);
});
