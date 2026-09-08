/**
 * The co-sysop's admin settings survive a round trip: its name, its tools,
 * the time-grant cap, the RAWG key. K5 of the plan, and the sysop's ask -
 * "he needs an internet name as well grumpy bot is not nice".
 */
process.env.SKIP_DB_INIT = '1';
import Database from 'better-sqlite3';
import { OperatorChatRepository } from '../../../src/database/operator-chat.repository';

describe('the co-sysop settings', () => {
  it('default to Kevin, tools on, a 30-minute cap, no RAWG key', () => {
    const repo = new OperatorChatRepository(new Database(':memory:'));
    const c = repo.getConfig();
    expect(c.aiSysopName).toBe('Kevin');
    expect(c.aiToolsEnabled).toBe(true);
    expect(c.aiTimeGrantCapMinutes).toBe(30);
    expect(c.rawgApiKey).toBe('');
  });
  it("renames a board still carrying the old default, and leaves a chosen name alone", () => {
    const db = new Database(':memory:');
    new OperatorChatRepository(db);                       // creates the table
    db.prepare(`UPDATE operator_chat_config SET ai_sysop_name = 'Agnus'`).run();
    expect(new OperatorChatRepository(db).getConfig().aiSysopName).toBe('Kevin');
    db.prepare(`UPDATE operator_chat_config SET ai_sysop_name = 'Denise'`).run();
    expect(new OperatorChatRepository(db).getConfig().aiSysopName).toBe('Denise');
  });

  it('round-trip what the admin sets, within bounds', () => {
    const repo = new OperatorChatRepository(new Database(':memory:'));
    repo.updateConfig({ aiSysopName: 'Denise', aiToolsEnabled: false, aiTimeGrantCapMinutes: 45, rawgApiKey: 'rawg-123' } as any);
    const c = repo.getConfig();
    expect(c.aiSysopName).toBe('Denise');
    expect(c.aiToolsEnabled).toBe(false);
    expect(c.aiTimeGrantCapMinutes).toBe(45);
    expect(c.rawgApiKey).toBe('rawg-123');
    // A partial update keeps the rest (the admin page sends only what changed).
    repo.updateConfig({ pageTimeout: 90 } as any);
    expect(repo.getConfig().aiSysopName).toBe('Denise');
    // Bounds: an empty name falls back, the cap is clamped.
    repo.updateConfig({ aiSysopName: '', aiTimeGrantCapMinutes: 9999 } as any);
    expect(repo.getConfig().aiSysopName).toBe('Kevin');
    expect(repo.getConfig().aiTimeGrantCapMinutes).toBe(600);
  });
});
