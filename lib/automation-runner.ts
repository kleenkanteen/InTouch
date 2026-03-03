import { delayRandom } from './random-delay';
import { getLinkedInElements, isLinkedInProfilePage } from './linkedin-selectors';
import type { ProcessProfileResult, RuntimeMessage } from './runtime-messages';

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    await browser.runtime.sendMessage({
      type: 'SET_RUN_NEXT_ACTION',
      nextActionLabel: label,
      nextActionAt: at,
    } satisfies RuntimeMessage);
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

  await waitForAction('post-navigation-delay', 'Scan profile action buttons');
  let elements = getLinkedInElements();
  console.log('[InTouch][Runner] elements:initial', {
    hasPending: Boolean(elements.pendingButton),
    hasMessage: Boolean(elements.messageButton),
    hasConnect: Boolean(elements.connectButton),
    hasMore: Boolean(elements.moreButton),
  });

  if (elements.pendingButton || elements.messageButton) {
    console.log('[InTouch][Runner] already-connected');
    await setNextAction(null, null);
    return { status: 'Already connected', reason: 'Pending or Message detected', timeline };
  }

  if (!elements.connectButton && elements.moreButton) {
    await waitForAction('pre-click-more', 'Click More');
    elements.moreButton.click();
    record('clicked-more');
    await waitFor(800);
    elements = getLinkedInElements();
    console.log('[InTouch][Runner] elements:after-more', {
      hasConnectInMenu: Boolean(elements.connectInMenuButton),
      hasConnect: Boolean(elements.connectButton),
    });
  }

  const connectButton = elements.connectButton || elements.connectInMenuButton;
  if (!connectButton) {
    console.warn('[InTouch][Runner] invalid-profile:no-connect-button');
    await setNextAction(null, null);
    return { status: 'Invalid Profile', reason: 'Connect button unavailable', timeline };
  }

  await waitForAction('pre-click-connect', 'Click Connect');
  connectButton.click();
  record('clicked-connect');
  console.log('[InTouch][Runner] clicked-connect');
  await waitFor(1200);

  elements = getLinkedInElements();
  if (elements.addNoteButton) {
    await waitForAction('pre-click-add-note', 'Click Add a note');
    elements.addNoteButton.click();
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
  elements.sendButton.click();
  record('clicked-send');
  console.log('[InTouch][Runner] clicked-send');
  await setNextAction(null, null);

  return { status: 'Sent Request', timeline };
}
