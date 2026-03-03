import { delayRandom } from './random-delay';
import { getLinkedInElements, isLinkedInProfilePage } from './linkedin-selectors';
import type { ProcessProfileResult } from './runtime-messages';

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

  if (!isLinkedInProfilePage()) {
    return { status: 'Invalid Profile', reason: 'Not on /in/ profile page', timeline };
  }

  await delayRandom(record, 'post-navigation-delay');
  let elements = getLinkedInElements();

  if (elements.pendingButton || elements.messageButton) {
    return { status: 'Already connected', reason: 'Pending or Message detected', timeline };
  }

  if (!elements.connectButton && elements.moreButton) {
    await delayRandom(record, 'pre-click-more');
    elements.moreButton.click();
    record('clicked-more');
    await waitFor(800);
    elements = getLinkedInElements();
  }

  const connectButton = elements.connectButton || elements.connectInMenuButton;
  if (!connectButton) {
    return { status: 'Invalid Profile', reason: 'Connect button unavailable', timeline };
  }

  await delayRandom(record, 'pre-click-connect');
  connectButton.click();
  record('clicked-connect');
  await waitFor(1200);

  elements = getLinkedInElements();
  if (elements.addNoteButton) {
    await delayRandom(record, 'pre-click-add-note');
    elements.addNoteButton.click();
    record('clicked-add-note');
    await waitFor(700);
  }

  elements = getLinkedInElements();
  if (elements.noteTextArea && note.trim()) {
    await delayRandom(record, 'pre-fill-note');
    elements.noteTextArea.focus();
    elements.noteTextArea.value = note;
    elements.noteTextArea.dispatchEvent(new Event('input', { bubbles: true }));
    elements.noteTextArea.dispatchEvent(new Event('change', { bubbles: true }));
    record('filled-note');
  }

  elements = getLinkedInElements();
  if (!elements.sendButton) {
    return {
      status: 'Invalid Profile',
      reason: 'Send button not found after connect flow',
      timeline,
    };
  }

  if (dryRun) {
    record('dry-run-before-send');
    return {
      status: 'Sent Request',
      reason: 'Dry run completed before send click',
      timeline,
    };
  }

  await delayRandom(record, 'pre-click-send');
  elements.sendButton.click();
  record('clicked-send');

  return { status: 'Sent Request', timeline };
}
