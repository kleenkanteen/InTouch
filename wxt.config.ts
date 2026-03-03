import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    permissions: ['storage', 'tabs'],
    host_permissions: ['*://www.linkedin.com/*'],
  },
});
