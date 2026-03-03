import { createApp } from 'vue';
import LinkedInAutomationApp from '@/components/li/LinkedInAutomationApp.vue';
import type { RuntimeMessage } from '@/lib/runtime-messages';
import { processCurrentProfile } from '@/lib/automation-runner';

export default defineContentScript({
  matches: ['*://www.linkedin.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[InTouch][Content] mounted', { href: location.href });
    const rootId = 'intouch-li-extension-root';
    if (!document.getElementById(rootId)) {
      const root = document.createElement('div');
      root.id = rootId;
      document.body.appendChild(root);
      createApp(LinkedInAutomationApp).mount(root);
      console.log('[InTouch][Content] app mounted');
    }

    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      console.log('[InTouch][Content] runtime message', { type: message.type });
      if (message.type !== 'PROCESS_CURRENT_PROFILE') {
        return undefined;
      }

      console.log('[InTouch][Content] PROCESS_CURRENT_PROFILE:start', {
        campaignId: message.campaignId,
        prospectId: message.prospectId,
        dryRun: message.dryRun,
      });
      return processCurrentProfile(message.note, Boolean(message.dryRun));
    });
  },
});
