
import { Database } from '../database';
import { userFileManager } from '../services/UserFileManager';

async function regenerate() {
  console.log('Regenerating user files...');
  
  const db = new Database();
  await db.init();

  const users = await db.getUsers();
  console.log(`Found ${users.length} users in database.`);

  // Initialize empty files first (clears existing)
  userFileManager.initializeUserFiles();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const slot = i + 1;
    console.log(`Writing user ${user.username} to slot ${slot}...`);
    
    // Write to disk
    userFileManager.writeUserFiles(user, slot);
    
    // Update slot number in DB if missing or incorrect
    // Note: db.updateUser will also try to write to disk, but that's safe
    if (user.slotNumber !== slot) {
       console.log(`Updating DB slot number for ${user.username} from ${user.slotNumber} to ${slot}`);
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
