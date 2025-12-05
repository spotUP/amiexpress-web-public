-- Seed file transfer protocols
-- Run this with: sqlite3 data/amiexpress.db < web/backend/seed-protocols.sql

-- Clear existing protocols (optional)
-- DELETE FROM protocols;

-- ZMODEM (Default for modern terminals)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'ZMODEM', 'Z',
  'sz', 'rz', 'sz',
  1, 1, 1,
  1, 1
);

-- YMODEM (Batch transfers)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'YMODEM (Batch)', 'Y',
  'sb', 'rb', 'sb',
  1, 1, 1,
  1, 0
);

-- XMODEM-1K (1024-byte blocks with CRC)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'XMODEM-1K', 'X1K',
  'sx', 'rx', 'sx',
  0, 0, 1,
  1, 0
);

-- XMODEM-CRC (128-byte blocks with CRC-16)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'XMODEM-CRC', 'XC',
  'sx', 'rx', 'sx',
  0, 0, 1,
  1, 0
);

-- XMODEM (Legacy checksum)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'XMODEM (Checksum)', 'X',
  'sx', 'rx', 'sx',
  0, 0, 1,
  1, 0
);

-- Punter (C64/C128 protocol)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'Punter (C64/C128)', 'P',
  'punter', 'punter-rx', 'punter-tx',
  0, 0, 1,
  1, 0
);

-- WebSocket (Browser transfers)
INSERT OR IGNORE INTO protocols (
  protocol_name, protocol_code,
  command, upload_command, download_command,
  batch_upload, batch_download, bidirectional,
  enabled, is_default
) VALUES (
  'WebSocket (Browser)', 'WS',
  'websocket', 'websocket-upload', 'websocket-download',
  1, 1, 1,
  1, 0
);

-- Verify inserted protocols
SELECT * FROM protocols;
