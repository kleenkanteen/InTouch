export interface LinkedInElements {
  pendingButton: HTMLElement | null;
  messageButton: HTMLElement | null;
  connectButton: HTMLElement | null;
  moreButton: HTMLElement | null;
  connectInMenuButton: HTMLElement | null;
  addNoteButton: HTMLElement | null;
  noteTextArea: HTMLTextAreaElement | null;
  sendButton: HTMLElement | null;
}

export interface SelectorDebugCandidate {
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  title: string;
  className: string;
  matches: string[];
}

export interface LinkedInSelectorDebugSnapshot {
  roots: {
    hasProfileActionRoot: boolean;
    hasActiveMenuRoot: boolean;
    hasConnectionDialogRoot: boolean;
  };
  candidateCounts: {
    profileAction: number;
    activeMenu: number;
    connectionDialog: number;
  };
  candidates: {
    profileAction: SelectorDebugCandidate[];
    activeMenu: SelectorDebugCandidate[];
    connectionDialog: SelectorDebugCandidate[];
  };
}

const SELECTOR_DEBUG_KEYWORDS = [
  'connect',
  'invite',
  'more',
  'pending',
  'message',
  'send',
  'add a note',
];

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isDisabled(element: HTMLElement): boolean {
  const disabledAttr =
    element.getAttribute('disabled') !== null ||
    element.getAttribute('aria-disabled') === 'true';
  return disabledAttr;
}

function resolveClickableTarget(span: HTMLSpanElement): HTMLElement | null {
  const candidates = [
    span.closest<HTMLElement>('button'),
    span.closest<HTMLElement>('a[role="button"]'),
    span.closest<HTMLElement>('[role="menuitem"]'),
    span.closest<HTMLElement>('div[role="button"]'),
    span.closest<HTMLElement>('li[role="menuitem"]'),
    span.closest<HTMLElement>('li'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!isVisible(candidate)) continue;
    if (isDisabled(candidate)) continue;
    return candidate;
  }

  return null;
}

function findClickableFromSpanText(
  labels: string[],
  root?: ParentNode | null,
): HTMLElement | null {
  const searchRoot = root ?? document;
  const spans = Array.from(searchRoot.querySelectorAll<HTMLSpanElement>('span'));
  for (const span of spans) {
    const text = (span.textContent || '').trim().toLowerCase();
    if (!text) continue;
    if (!labels.some((label) => text === label.toLowerCase())) {
      continue;
    }

    const clickable = resolveClickableTarget(span);
    if (clickable) {
      return clickable;
    }
  }
  return null;
}

function elementText(element: HTMLElement): string {
  const text = element.innerText || element.textContent || '';
  const aria = element.getAttribute('aria-label') || '';
  const title = element.getAttribute('title') || '';
  return `${text} ${aria} ${title}`.trim().toLowerCase();
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getProfileActionRoot(): HTMLElement | null {
  const h1 = document.querySelector('main h1');
  if (!h1) {
    return null;
  }

  let current: HTMLElement | null = h1.parentElement;
  const main = document.querySelector('main');

  while (current && current !== main) {
    const actionCandidates = Array.from(
      current.querySelectorAll<HTMLElement>('button, a[role="button"]'),
    );
    const hasProfileAction = actionCandidates.some((button) => {
      const text = elementText(button);
      return (
        text.includes('more') ||
        text.includes('connect') ||
        text.includes('pending') ||
        text.includes('message')
      );
    });

    if (hasProfileAction) {
      return current;
    }

    current = current.parentElement;
  }

  return (main as HTMLElement | null) ?? null;
}

function queryButtonByLabel(labels: string[], root?: ParentNode | null): HTMLElement | null {
  const searchRoot = root ?? document;
  const all = Array.from(
    searchRoot.querySelectorAll<HTMLElement>('button, a[role="button"], [role="menuitem"]'),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  return (
    all.find((element) => {
      const text = elementText(element);
      return labels.some((label) => text === label || text.startsWith(`${label} `) || text.includes(label));
    }) ?? null
  );
}

function queryButtonByAriaContains(
  labels: string[],
  root?: ParentNode | null,
): HTMLElement | null {
  const searchRoot = root ?? document;
  const all = Array.from(
    searchRoot.querySelectorAll<HTMLElement>(
      'button, a[role="button"], [role="menuitem"], div[role="button"]',
    ),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  return (
    all.find((element) => {
      const aria = (element.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!aria) return false;
      return labels.some((label) => aria.includes(label));
    }) ?? null
  );
}

function queryNoteTextArea(root?: ParentNode | null): HTMLTextAreaElement | null {
  const searchRoot = root ?? document;
  const all = Array.from(
    searchRoot.querySelectorAll<HTMLTextAreaElement>('textarea[name="message"], textarea#custom-message'),
  );
  return all.find((textarea) => isVisible(textarea)) ?? null;
}

function getConnectionDialogRoot(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], .artdeco-modal'),
  ).filter(isVisible);

  for (const candidate of candidates) {
    const hasConnectionControls =
      Boolean(queryNoteTextArea(candidate)) ||
      Boolean(queryButtonByLabel(['add a note', 'send'], candidate)) ||
      Boolean(findClickableFromSpanText(['add a note', 'send'], candidate));
    if (hasConnectionControls) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

function collectSelectorDebugCandidates(
  root: ParentNode | null,
  limit = 50,
): SelectorDebugCandidate[] {
  if (!root) {
    return [];
  }

  const all = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, a[role="button"], [role="menuitem"], div[role="button"]',
    ),
  );
  const candidates: SelectorDebugCandidate[] = [];

  for (const element of all) {
    if (!isVisible(element) || isDisabled(element)) {
      continue;
    }

    const text = normalizeInlineText(element.innerText || element.textContent || '');
    const ariaLabel = normalizeInlineText(element.getAttribute('aria-label') || '');
    const title = normalizeInlineText(element.getAttribute('title') || '');
    const combined = `${text} ${ariaLabel} ${title}`.trim().toLowerCase();
    if (!combined) {
      continue;
    }

    const matches = SELECTOR_DEBUG_KEYWORDS.filter((keyword) => combined.includes(keyword));
    candidates.push({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || '',
      text: text.slice(0, 200),
      ariaLabel: ariaLabel.slice(0, 200),
      title: title.slice(0, 200),
      className: normalizeInlineText(element.className || '').slice(0, 240),
      matches,
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates;
}

export function getLinkedInElements(): LinkedInElements {
  const profileTopCard = getProfileActionRoot();
  const mainRoot = document.querySelector('main');
  const profileActionRoot = profileTopCard ?? mainRoot ?? document;
  const openMenus = Array.from(document.querySelectorAll('[role="menu"], .artdeco-dropdown__content'));
  const activeMenuRoot = openMenus.find((menu) => (menu as HTMLElement).offsetParent !== null) ?? null;
  const connectionDialogRoot = getConnectionDialogRoot();

  const pendingButton =
    queryButtonByLabel(['pending'], profileActionRoot) ||
    queryButtonByAriaContains(['pending'], profileActionRoot);
  const messageButton =
    queryButtonByLabel(['message'], profileActionRoot) ||
    queryButtonByAriaContains(['message'], profileActionRoot);
  const connectButton =
    queryButtonByLabel(['connect', 'invite'], profileActionRoot) ||
    queryButtonByAriaContains(['connect', 'invite'], profileActionRoot) ||
    findClickableFromSpanText(['connect', 'invite'], profileActionRoot);
  const moreButton =
    queryButtonByLabel(['more', 'more actions'], profileActionRoot) ||
    queryButtonByAriaContains(['more actions'], profileActionRoot) ||
    findClickableFromSpanText(['more', 'more actions'], profileActionRoot);
  const connectInMenuButton =
    queryButtonByLabel(['connect', 'invite'], activeMenuRoot) ||
    queryButtonByAriaContains(['connect', 'invite'], activeMenuRoot) ||
    findClickableFromSpanText(['connect', 'invite'], activeMenuRoot);
  const addNoteButton =
    queryButtonByLabel(['add a note'], connectionDialogRoot) ||
    queryButtonByAriaContains(['add a note'], connectionDialogRoot) ||
    findClickableFromSpanText(['add a note'], connectionDialogRoot) ||
    queryButtonByLabel(['add a note']) ||
    queryButtonByAriaContains(['add a note']) ||
    findClickableFromSpanText(['add a note']);
  const noteTextArea = queryNoteTextArea(connectionDialogRoot) || queryNoteTextArea();
  const sendButton =
    queryButtonByLabel(['send'], connectionDialogRoot) ||
    queryButtonByAriaContains(['send invitation', 'send'], connectionDialogRoot) ||
    findClickableFromSpanText(['send'], connectionDialogRoot) ||
    queryButtonByLabel(['send']) ||
    queryButtonByAriaContains(['send invitation', 'send']) ||
    findClickableFromSpanText(['send']);

  return {
    pendingButton,
    messageButton,
    connectButton,
    moreButton,
    connectInMenuButton,
    addNoteButton,
    noteTextArea,
    sendButton,
  };
}

export function hasVisibleConnectionModalSendControls(): boolean {
  const dialogRoot = getConnectionDialogRoot();
  if (!dialogRoot) {
    return false;
  }

  const sendButton =
    queryButtonByLabel(['send'], dialogRoot) ||
    queryButtonByAriaContains(['send invitation', 'send'], dialogRoot) ||
    findClickableFromSpanText(['send'], dialogRoot);
  const addNoteButton =
    queryButtonByLabel(['add a note'], dialogRoot) ||
    queryButtonByAriaContains(['add a note'], dialogRoot) ||
    findClickableFromSpanText(['add a note'], dialogRoot);
  const noteTextArea = queryNoteTextArea(dialogRoot);

  return Boolean(sendButton || addNoteButton || noteTextArea);
}

export function getLinkedInSelectorDebugSnapshot(): LinkedInSelectorDebugSnapshot {
  const profileActionRoot = getProfileActionRoot();
  const openMenus = Array.from(document.querySelectorAll('[role="menu"], .artdeco-dropdown__content'));
  const activeMenuRoot = openMenus.find((menu) => (menu as HTMLElement).offsetParent !== null) ?? null;
  const connectionDialogRoot = getConnectionDialogRoot();

  const profileActionCandidates = collectSelectorDebugCandidates(profileActionRoot);
  const activeMenuCandidates = collectSelectorDebugCandidates(activeMenuRoot);
  const connectionDialogCandidates = collectSelectorDebugCandidates(connectionDialogRoot);

  return {
    roots: {
      hasProfileActionRoot: Boolean(profileActionRoot),
      hasActiveMenuRoot: Boolean(activeMenuRoot),
      hasConnectionDialogRoot: Boolean(connectionDialogRoot),
    },
    candidateCounts: {
      profileAction: profileActionCandidates.length,
      activeMenu: activeMenuCandidates.length,
      connectionDialog: connectionDialogCandidates.length,
    },
    candidates: {
      profileAction: profileActionCandidates,
      activeMenu: activeMenuCandidates,
      connectionDialog: connectionDialogCandidates,
    },
  };
}

export function isLinkedInProfilePage(url = window.location.href): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.linkedin.com' && parsed.pathname.startsWith('/in/');
  } catch {
    return false;
  }
}
