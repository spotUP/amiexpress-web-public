import { Database } from '../web/backend/src/database';
import { SystemConfigService } from '../web/backend/src/services/config-services/system-config.service';

async function debug() {
  const db = new Database();
  await db.init();
  const service = new SystemConfigService(db);
  const config = await service.getSystemConfig();
  console.log('MAX_NODES:', config.max_nodes);
  console.log('FULL_CONFIG:', JSON.stringify(config, null, 2));
  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
