import { createApp } from 'vue';
import LinkedInAutomationApp from '@/components/li/LinkedInAutomationApp.vue';
import type { RuntimeMessage } from '@/lib/runtime-messages';
import { processCurrentProfile } from '@/lib/automation-runner';

export default defineContentScript({
  matches: ['*://www.linkedin.com/*'],
  runAt: 'document_idle',
  main() {
    const rootId = 'intouch-li-extension-root';
    if (!document.getElementById(rootId)) {
      const root = document.createElement('div');
      root.id = rootId;
      document.body.appendChild(root);
      createApp(LinkedInAutomationApp).mount(root);
    }

    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type !== 'PROCESS_CURRENT_PROFILE') {
        return undefined;
      }

      return processCurrentProfile(message.note, Boolean(message.dryRun));
    });
  },
});
