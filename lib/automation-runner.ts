import { delayRandom } from './random-delay';
import {
  getLinkedInElements,
  getLinkedInSelectorDebugSnapshot,
  hasVisibleConnectionModalSendControls,
  isLinkedInProfilePage,
} from './linkedin-selectors';
import type { ProcessProfileResult, RuntimeMessage } from './runtime-messages';

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForActionControls(timeoutMs = 8_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let latest = getLinkedInElements();
  while (Date.now() < deadline) {
    if (latest.connectButton || latest.moreButton || latest.connectInMenuButton) {
      return latest;
    }
    await waitFor(intervalMs);
    latest = getLinkedInElements();
  }
  return latest;
}

function clickActionTarget(target: HTMLElement): void {
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.click();
}

function logSelectorDebugSnapshot(
  stage: string,
  elements: ReturnType<typeof getLinkedInElements>,
): void {
  const snapshot = getLinkedInSelectorDebugSnapshot();
  console.log('[InTouch][Runner] selector-debug-snapshot', {
    stage,
    href: location.href,
    detected: {
      hasPending: Boolean(elements.pendingButton),
      hasMessage: Boolean(elements.messageButton),
      hasConnect: Boolean(elements.connectButton),
      hasMore: Boolean(elements.moreButton),
      hasConnectInMenu: Boolean(elements.connectInMenuButton),
      hasAddNote: Boolean(elements.addNoteButton),
      hasNoteTextArea: Boolean(elements.noteTextArea),
      hasSend: Boolean(elements.sendButton),
    },
    snapshot,
  });
}

async function waitForSendCompletion(timeoutMs = 8_000, intervalMs = 250): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const latest = getLinkedInElements();
    if (latest.pendingButton || latest.messageButton) {
      return true;
    }

    if (!hasVisibleConnectionModalSendControls()) {
      return true;
    }

    await waitFor(intervalMs);
  }

  const latest = getLinkedInElements();
  return Boolean(
    latest.pendingButton || latest.messageButton || !hasVisibleConnectionModalSendControls(),
  );
}

export async function processCurrentProfile(
  note: string,
  dryRun = false,
): Promise<ProcessProfileResult> {
  const timeline: Array<{ step: string; at: string }> = [];
  const record = (step: string) => {
    timeline.push({ step, at: new Date().toISOString() });
  };

  record('start');
  console.log('[InTouch][Runner] process:start', {
    href: location.href,
    dryRun,
    noteLength: note.length,
  });

  const setNextAction = async (label: string | null, at: number | null) => {
    try {
      await browser.runtime.sendMessage({
        type: 'SET_RUN_NEXT_ACTION',
        nextActionLabel: label,
        nextActionAt: at,
      } satisfies RuntimeMessage);
    } catch (error) {
      console.warn('[InTouch][Runner] setNextAction:failed', { label, at, error });
    }
  };

  const waitForAction = async (step: string, nextActionLabel: string) => {
    console.log('[InTouch][Runner] wait:start', { step, nextActionLabel });
    await delayRandom(record, step, async (delayMs) => {
      console.log('[InTouch][Runner] wait:scheduled', { step, delayMs, nextActionLabel });
      await setNextAction(nextActionLabel, Date.now() + delayMs);
    });
    console.log('[InTouch][Runner] wait:done', { step });
    await setNextAction(null, null);
  };

  if (!isLinkedInProfilePage()) {
    console.warn('[InTouch][Runner] invalid-profile:not-on-profile-page', { href: location.href });
    await setNextAction(null, null);
    return { status: 'Invalid Profile', reason: 'Not on /in/ profile page', timeline };
  }

  await setNextAction('Wait for profile to fully load', Date.now() + 3000);
  await waitFor(3000);
  record('profile-load-wait-3s');
  await setNextAction(null, null);

  await waitForAction('post-navigation-delay', 'Scan profile action buttons');
  let elements = await waitForActionControls(8_000, 250);
  console.log('[InTouch][Runner] elements:initial', {
    hasPending: Boolean(elements.pendingButton),
    hasMessage: Boolean(elements.messageButton),
    hasConnect: Boolean(elements.connectButton),
    hasMore: Boolean(elements.moreButton),
  });
  logSelectorDebugSnapshot('initial', elements);

  if (!elements.connectButton && elements.moreButton) {
    await waitForAction('pre-click-more', 'Click More');
    clickActionTarget(elements.moreButton);
    record('clicked-more');
    await waitFor(900);
    elements = await waitForActionControls(4_000, 200);
    console.log('[InTouch][Runner] elements:after-more', {
      hasConnectInMenu: Boolean(elements.connectInMenuButton),
      hasConnect: Boolean(elements.connectButton),
    });
    logSelectorDebugSnapshot('after-more', elements);
  }

  const connectButton = elements.connectButton || elements.connectInMenuButton;
  if (!connectButton) {
    await waitForAction('retry-connect-button-lookup', 'Retry Connect button lookup');
    elements = await waitForActionControls(6_000, 250);
    const retryConnectButton = elements.connectButton || elements.connectInMenuButton;
    if (retryConnectButton) {
      console.log('[InTouch][Runner] connect-button-found:retry', {
        tag: retryConnectButton.tagName,
        className: retryConnectButton.className,
        text: (retryConnectButton.textContent || '').trim().slice(0, 120),
      });
    }
    logSelectorDebugSnapshot('retry-connect-lookup', elements);
  }

  const resolvedConnectButton = elements.connectButton || elements.connectInMenuButton;
  if (!resolvedConnectButton) {
    logSelectorDebugSnapshot('no-connect-found', elements);
    const hasConnectedState = Boolean(elements.pendingButton || elements.messageButton);
    if (hasConnectedState) {
      console.log('[InTouch][Runner] already-connected:no-connect-button', {
        hasPending: Boolean(elements.pendingButton),
        hasMessage: Boolean(elements.messageButton),
      });
      await setNextAction(null, null);
      return {
        status: 'Already connected',
        reason: 'Pending or Message action is already visible on the profile',
        timeline,
      };
    }

    console.warn('[InTouch][Runner] invalid-profile:no-connect-button');
    await setNextAction(null, null);
    return {
      status: 'Invalid Profile',
      reason: 'Connect button not found after direct and More-menu checks',
      timeline,
    };
  }

  console.log('[InTouch][Runner] connect-button-found', {
    tag: resolvedConnectButton.tagName,
    className: resolvedConnectButton.className,
    text: (resolvedConnectButton.textContent || '').trim().slice(0, 120),
  });
  await waitForAction('pre-click-connect', 'Click Connect');
  clickActionTarget(resolvedConnectButton);
  record('clicked-connect');
  console.log('[InTouch][Runner] clicked-connect');
  await waitFor(1200);

  elements = getLinkedInElements();
  if (elements.addNoteButton) {
    await waitForAction('pre-click-add-note', 'Click Add a note');
    clickActionTarget(elements.addNoteButton);
    record('clicked-add-note');
    console.log('[InTouch][Runner] clicked-add-note');
    await waitFor(700);
  }

  elements = getLinkedInElements();
  if (elements.noteTextArea && note.trim()) {
    await waitForAction('pre-fill-note', 'Fill connection note');
    elements.noteTextArea.focus();
    elements.noteTextArea.value = note;
    elements.noteTextArea.dispatchEvent(new Event('input', { bubbles: true }));
    elements.noteTextArea.dispatchEvent(new Event('change', { bubbles: true }));
    record('filled-note');
    console.log('[InTouch][Runner] filled-note');
  }

  elements = getLinkedInElements();
  if (!elements.sendButton) {
    logSelectorDebugSnapshot('no-send-found', elements);
    console.warn('[InTouch][Runner] invalid-profile:no-send-button');
    await setNextAction(null, null);
    return {
      status: 'Invalid Profile',
      reason: 'Send button not found after connect flow',
      timeline,
    };
  }

  if (dryRun) {
    record('dry-run-before-send');
    console.log('[InTouch][Runner] dry-run-stop-before-send');
    await setNextAction(null, null);
    return {
      status: 'Sent Request',
      reason: 'Dry run completed before send click',
      timeline,
    };
  }

  await waitForAction('pre-click-send', 'Click Send');
  clickActionTarget(elements.sendButton);
  record('clicked-send');
  console.log('[InTouch][Runner] clicked-send');
  await waitForAction('post-click-send-delay', 'Wait for connection request confirmation');
  const isSendConfirmed = await waitForSendCompletion(8_000, 250);
  if (!isSendConfirmed) {
    console.warn('[InTouch][Runner] send-not-confirmed');
    await setNextAction(null, null);
    return {
      status: 'Invalid Profile',
      reason: 'Connection request submission was not confirmed after clicking Send',
      timeline,
    };
  }

  record('send-confirmed');
  console.log('[InTouch][Runner] send-confirmed');
  await setNextAction(null, null);

  return { status: 'Sent Request', timeline };
}
