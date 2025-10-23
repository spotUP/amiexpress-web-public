const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('❌ No DATABASE_URL or POSTGRES_URL found');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function resetFileAreas() {
  const client = await pool.connect();
  try {
    console.log('📋 Current file areas:');
    const before = await client.query('SELECT id, name, conferenceid FROM file_areas ORDER BY id');
    console.log(`   Total: ${before.rows.length}`);
    before.rows.forEach(row => {
      console.log(`   ${row.id}: ${row.name} (conf: ${row.conferenceid})`);
    });

    console.log('\n🗑️  Deleting file areas with ID > 5...');
    const deleteResult = await client.query('DELETE FROM file_areas WHERE id > 5');
    console.log(`   Deleted: ${deleteResult.rowCount} rows`);

    console.log('\n✅ Remaining file areas:');
    const after = await client.query('SELECT id, name, conferenceid FROM file_areas ORDER BY id');
    console.log(`   Total: ${after.rows.length}`);
    after.rows.forEach(row => {
      console.log(`   ${row.id}: ${row.name} (conf: ${row.conferenceid})`);
    });

    console.log('\n✓ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

resetFileAreas();
