const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://spot@localhost/amiexpress_web',
});

async function cleanupFileAreas() {
  const client = await pool.connect();
  try {
    console.log('Checking file areas...');
    const result = await client.query('SELECT id, name, conferenceid FROM file_areas ORDER BY id');
    console.log(`Found ${result.rows.length} file areas:`);
    result.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, ConfID: ${row.conferenceid}`);
    });

    console.log('\nDeleting file areas with ID > 5...');
    const deleteResult = await client.query('DELETE FROM file_areas WHERE id > 5');
    console.log(`Deleted ${deleteResult.rowCount} rows`);

    console.log('\nRemaining file areas:');
    const finalResult = await client.query('SELECT id, name, conferenceid FROM file_areas ORDER BY id');
    finalResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Name: ${row.name}, ConfID: ${row.conferenceid}`);
    });

    console.log('\n✓ Cleanup complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupFileAreas();
