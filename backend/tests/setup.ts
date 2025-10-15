import { Database } from '../src/database';

declare const beforeAll: any;
declare const afterAll: any;

beforeAll(async () => {
  // Setup test database
  const testDb = new Database();
  // Call initializeDefaultData directly since initDatabase is private
  await testDb.initializeDefaultData();

  // Wait much longer for initialization to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Store in global for tests
  (global as any).testDb = testDb;
}, 60000);

afterAll(async () => {
  // Cleanup
  const testDb = (global as any).testDb;
  if (testDb) {
    await testDb.close();
  }
}, 30000);