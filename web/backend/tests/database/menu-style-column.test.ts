/**
 * The menu style column is a copy of the long-menu column (plan 2026-10-17 S2):
 * stored scroll/pages/'' arrive unchanged, and the old column is kept.
 */
import BetterSqlite3 from 'better-sqlite3';
import { addMenuStyleColumn } from '../../src/database/user-repository';

test('menustyle copies scroll, pages and the board default unchanged and keeps menuoverflow', () => {
  const db = new BetterSqlite3(':memory:');
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, menuoverflow TEXT DEFAULT '')");
  db.exec("INSERT INTO users (id, menuoverflow) VALUES (1, 'scroll'), (2, 'pages'), (3, ''), (4, NULL)");
  addMenuStyleColumn(db);
  const rows = db.prepare('SELECT id, menuoverflow, menustyle FROM users ORDER BY id').all();
  expect(rows).toEqual([
    { id: 1, menuoverflow: 'scroll', menustyle: 'scroll' },
    { id: 2, menuoverflow: 'pages', menustyle: 'pages' },
    { id: 3, menuoverflow: '', menustyle: '' },
    { id: 4, menuoverflow: null, menustyle: '' },
  ]);
  db.exec('INSERT INTO users (id) VALUES (5)');
  expect(db.prepare('SELECT menustyle FROM users WHERE id = 5').get()).toEqual({ menustyle: '' });
  db.close();
});
