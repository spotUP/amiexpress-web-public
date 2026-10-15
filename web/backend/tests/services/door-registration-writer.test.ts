import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeNewDoorRegistration } from '../../src/services/config-services/door-info-file.service';
import { readTooltypeMap } from '../../src/utils/info-file.util';

test('a new registration carries what the admin Add Door writes, and no ACCESS for a door open to all', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  const file = writeNewDoorRegistration(root, { door_command: 'WEBTERM', door_type: 'TS', door_path: 'Doors/web-terminal', door_name: 'Web terminal', min_security_level: 0 });
  expect(file).toBe(path.join(root, 'Commands', 'BBSCmd', 'WEBTERM.info'));
  const tt = readTooltypeMap(file);
  expect(tt.get('LOCATION')).toBe('Doors/web-terminal');
  expect(tt.get('TYPE')).toBe('TS');
  expect(tt.get('MULTINODE')).toBe('YES');
  expect(tt.has('ACCESS')).toBe(false);
  fs.rmSync(root, { recursive: true, force: true });
});
