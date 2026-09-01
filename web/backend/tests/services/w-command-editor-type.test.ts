/**
 * W's editor setting writes a column that exists.
 *
 * Option 12 did `db.updateUser(id, { editorType })`, and there is no
 * editortype column: fieldToColumn falls back to the lower-cased field name
 * (user-repository.ts:51), so the UPDATE named a column SQLite does not have,
 * threw, and the W command answered "[ERROR] Command processing failed" -
 * reported from the board on 2026-09-01.
 *
 * The setting had never persisted either. `editorType` is a runtime-only
 * number; what is stored is `editor`, holding 'Prompt', 'Line' or 'Full' -
 * the same three the disk record encodes (UserFileManager.editorTypeToInt).
 * The display read the number, so every user was shown PROMPT whatever they
 * had chosen.
 */

import * as fs from 'fs';
import * as path from 'path';

const HANDLER = path.join(__dirname, '../../src/handlers/commands/info-commands.handler.ts');
const source = fs.readFileSync(HANDLER, 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe("the W command's editor setting", () => {
  it('updates the editor column, never a field with no column', () => {
    expect(code).toContain("await db.updateUser(session.user.id, { editor: nextEditor })");
    expect(code).not.toMatch(/updateUser\([^)]*\{\s*editorType/);
  });

  it('cycles the three editors the record can hold', () => {
    expect(code).toContain("EDITOR_ORDER: string[] = ['Prompt', 'Line', 'Full']");
  });

  it('shows what is stored rather than the runtime number', () => {
    expect(code).toContain('EDITOR_DISPLAY[editorValue(currentUser)]');
    expect(code).not.toContain("const editorType = currentUser.editorType || 0");
  });

  // fieldToColumn is what turned a wrong field name into a thrown query.
  it('has no column mapping for editorType, which is why it must not be written', () => {
    const repo = fs.readFileSync(
      path.join(__dirname, '../../src/database/user-repository.ts'), 'utf8');

    expect(repo).toContain("return map[field] || field.toLowerCase();");
    expect(repo).not.toMatch(/editorType:\s*'/);
  });
});
