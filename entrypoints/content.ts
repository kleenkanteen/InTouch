import { createApp } from 'vue';
import LinkedInAutomationApp from '@/components/li/LinkedInAutomationApp.vue';
import type { ProcessProfileResult, RuntimeMessage } from '@/lib/runtime-messages';
import { processCurrentProfile } from '@/lib/automation-runner';

let messageListenerRegistered = false;

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

    if (!messageListenerRegistered) {
      browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
        console.log('[InTouch][Content] runtime message', { type: message.type });
        if (message.type !== 'PROCESS_CURRENT_PROFILE') {
          return undefined;
        }

        console.log('[InTouch][Content] PROCESS_CURRENT_PROFILE:start', {
          campaignId: message.campaignId,
          prospectId: message.prospectId,
          dryRun: message.dryRun,
        });

        void processCurrentProfile(message.note, Boolean(message.dryRun))
          .then((result) => {
            sendResponse(result);
          })
          .catch((error) => {
            console.error('[InTouch][Content] PROCESS_CURRENT_PROFILE:error', error);
            const fallback: ProcessProfileResult = {
              status: 'Invalid Profile',
              reason: `Runner error: ${
                (error as { message?: string })?.message || String(error)
              }`,
              timeline: [{ step: 'runner-error', at: new Date().toISOString() }],
            };
            sendResponse(fallback);
          });

        return true;
      });
      messageListenerRegistered = true;
    }
  },
});
