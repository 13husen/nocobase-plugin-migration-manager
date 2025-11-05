import { Plugin } from '@nocobase/server';
import { MigrationController } from './controllers/migration';

export class PluginMigrationManagerServer extends Plugin {
  async afterAdd() {}
  async beforeLoad() {}

  async load() {
    this.app.resource({
      name: 'migration',
      actions: {
        export: MigrationController.export,
        import: MigrationController.import,
        list: MigrationController.list,
        validate: MigrationController.validate,
        apply: MigrationController.apply,
      },
    });

    this.app.acl.allow('migration', '*', 'admin');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

export default PluginMigrationManagerServer;
