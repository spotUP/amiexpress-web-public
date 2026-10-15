const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_DIR 
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '..', 'data', 'amiexpress.db');

async function resetFileAreas() {
  const db = new Database(dbPath);
  
  try {
    console.log('📋 Current file areas:');
    const before = db.prepare('SELECT id, name, conferenceid FROM file_areas ORDER BY id').all();
    console.log(`   Total: ${before.length}`);
    before.forEach(row => {
      console.log(`   ${row.id}: ${row.name} (conf: ${row.conferenceid})`);
    });

    console.log('\n🗑️  Deleting file areas with ID > 5...');
    const deleteStmt = db.prepare('DELETE FROM file_areas WHERE id > 5');
    const deleteResult = deleteStmt.run();
    console.log(`   Deleted: ${deleteResult.changes} rows`);

    console.log('\n[OK] Remaining file areas:');
    const after = db.prepare('SELECT id, name, conferenceid FROM file_areas ORDER BY id').all();
    console.log(`   Total: ${after.length}`);
    after.forEach(row => {
      console.log(`   ${row.id}: ${row.name} (conf: ${row.conferenceid})`);
    });

    console.log('\n✓ Cleanup complete!');
  } catch (error) {
    console.error('[ERROR] Error:', error.message);
  } finally {
    db.close();
  }
}

resetFileAreas();
