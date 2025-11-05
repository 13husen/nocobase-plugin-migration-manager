import { Plugin } from '@nocobase/client';
import { MigrationPage } from './pages/MigrationPage';

export class PluginMigrationManagerClient extends Plugin {
  async load() {
    this.app.router.add('admin.migration', {
      path: '/admin/migration',
      Component: MigrationPage,
    });

    this.app.pluginSettingsManager.add('migration-manager', {
      title: 'Migration Manager',
      icon: 'SwapOutlined',
      Component: MigrationPage,
      aclSnippet: 'pm.migration.manager',
    });
  }
}

export default PluginMigrationManagerClient;
