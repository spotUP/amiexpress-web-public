// Configuration page — wraps the SystemConfigPage component with the renamed
// registry id 'configuration' (matches web config-app's /admin/system route).
// The web's path is 'system' but its sidebar label is 'Configuration'.

import { SystemConfigPage } from './SystemConfigPage.js';

export function ConfigurationPage() {
  return <SystemConfigPage />;
}
