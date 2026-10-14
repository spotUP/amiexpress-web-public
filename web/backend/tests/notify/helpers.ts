/** Shared by the N2 suites: the test database and a user with an address. */
export async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

export function putUser(db: any, id: string, email: string | null): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare("INSERT INTO users (id, username, passwordhash, realname, email) VALUES (?, ?, 'x', ?, ?)").run(id, `name-${id}`, `Real ${id}`, email);
}
