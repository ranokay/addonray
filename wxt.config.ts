import { defineConfig } from 'wxt';

export default defineConfig({
  targetBrowsers: ['firefox', 'chrome'],
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-{{browser}}-sources.zip',
    zipSources: true,
    includeSources: [
      'entrypoints/**',
      'lib/**',
      'public/**',
      'wxt.config.ts',
      'tsconfig.json',
      'bunfig.toml',
      'mise.toml',
      'package.json',
      'bun.lock',
      'SOURCE_CODE_REVIEW.md',
    ],
  },
  hooks: {
    'config:resolved'(wxt) {
      if (
        !['firefox', 'chrome'].includes(wxt.config.browser) ||
        wxt.config.manifestVersion !== 3
      ) {
        throw new Error(
          'AddonRay builds support Firefox MV3 and Chrome MV3 only.',
        );
      }
      if (wxt.config.browser === 'firefox') {
        wxt.config.zip.artifactTemplate = '{{name}}-{{version}}-firefox.xpi';
      }
    },
  },
  manifest: ({ browser }) => ({
    name: 'AddonRay',
    description: 'Inspect extension metadata and selected-page capabilities.',
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      96: 'icon-96.png',
      128: 'icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        96: 'icon-96.png',
        128: 'icon-128.png',
      },
    },
    permissions: ['activeTab'],
    optional_permissions: ['management', 'scripting'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'addonray@ranokay.dev',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '156' }),
  }),
});
