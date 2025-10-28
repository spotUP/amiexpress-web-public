const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_DIR 
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '..', 'data', 'amiexpress.db');

async function cleanupFileAreas() {
  const db = new Database(dbPath);
  
  try {
    console.log('Checking file areas...');
    const result = db.prepare('SELECT id, name, conferenceid FROM file_areas ORDER BY id').all();
    console.log(`Found ${result.length} file_areas:`);
    result.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, ConfID: ${row.conferenceid}`);
    });

    console.log('\nDeleting file areas with ID > 5...');
    const deleteStmt = db.prepare('DELETE FROM file_areas WHERE id > 5');
    const deleteResult = deleteStmt.run();
    console.log(`Deleted ${deleteResult.changes} rows`);

    console.log('\nRemaining file areas:');
    const finalResult = db.prepare('SELECT id, name, conferenceid FROM file_areas ORDER BY id').all();
    finalResult.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, ConfID: ${row.conferenceid}`);
    });

    console.log('\n✓ Cleanup complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

cleanupFileAreas();
