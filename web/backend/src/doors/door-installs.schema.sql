-- What THIS node installed. The shared catalog lives in the door server;
-- these rows are the one thing that is genuinely local, and they replace
-- door_catalog's installed / installed_as / install_dir columns.
CREATE TABLE IF NOT EXISTS door_installs (
  id              TEXT PRIMARY KEY,
  catalog_id      TEXT,
  archive_name    TEXT NOT NULL,
  command         TEXT NOT NULL UNIQUE,
  install_dir     TEXT NOT NULL,
  door_type       TEXT,
  name            TEXT,
  md5             TEXT,
  -- Display metadata, snapshotted at install time. BBSApi overlays these
  -- onto the doors list (BBSApi.ts, the .map() after buildDoorList), and the
  -- shared catalog is no longer local to read them from. They describe the
  -- version THIS node installed, which is the honest thing to show anyway.
  description     TEXT,
  category        TEXT,
  version         TEXT,
  release_group   TEXT,
  installed_at    INTEGER NOT NULL,
  source_url      TEXT,
  source_revision TEXT
);
CREATE INDEX IF NOT EXISTS idx_door_installs_archive ON door_installs(archive_name);
