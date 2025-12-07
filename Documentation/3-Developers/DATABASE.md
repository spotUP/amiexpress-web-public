# Database Overview (Summary)
**Full audits, fixes, and migration guides live in `archive/DATABASE_AUDIT.md`, `archive/DATABASE_FIX_DOCUMENTATION.md`, and `archive/AMIGAFS_MIGRATION.md`.**

## 1. Schema Highlights
- SQLite holds tables for `users`, `conferences`, `files`, `messages`, and `doors`. Each user row mirrors express.e’s 110+ fields (name, real name, access flags, statistics, answer scripts).
- File areas store DirX metadata plus ASCII continuation blocks so FR/FS output can reproduce the original layout.
- Logging tables capture uploads/downloads for FR and door auditing.

## 2. Audit & Migration
- `DATABASE_AUDIT.md` documents every express.e column mapped to the new schema; use it when adding new fields or bridging to Arexx.
- Migration scripts (TypeScript) keep the `securityLevels` table aligned with express.e ACS bits.
- `DATABASE_FIX_DOCUMENTATION.md` covers how we treat zero-based indexing vs express.e's 1-based structures.

## 3. Operational Notes
- When DB errors occur, check `logs/backend.log` and run the `Archive` script replicating the Amiga `User.data` import.
- Use `BCRYPT_MIGRATION_COMPLETE.md` strategies to ensure password storage matches both express.e and the modern bcrypt requirement.

**Need deeper detail?** Dive into the archived docs for sample SQL, auditing spreadsheets, and migration commands that keep this database 1:1.
