import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AddonRay',
    description:
      'Inspect Firefox extension metadata and selected-page capabilities.',
    permissions: ['activeTab'],
    optional_permissions: ['management', 'scripting'],
    browser_specific_settings: {
      gecko: {
        id: 'addonray@ranokay.dev',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
