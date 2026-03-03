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
  ).filter(isVisible);

  return (
    all.find((element) => {
      const text = elementText(element);
      return labels.some((label) => text === label || text.startsWith(`${label} `) || text.includes(label));
    }) ?? null
  );
}

export function getLinkedInElements(): LinkedInElements {
  const profileTopCard = getProfileActionRoot();
  const openMenus = Array.from(document.querySelectorAll('[role="menu"], .artdeco-dropdown__content'));
  const activeMenuRoot = openMenus.find((menu) => (menu as HTMLElement).offsetParent !== null) ?? null;

  const pendingButton = queryButtonByLabel(['pending'], profileTopCard);
  const messageButton = queryButtonByLabel(['message'], profileTopCard);
  const connectButton =
    queryButtonByLabel(['connect'], profileTopCard) ||
    findClickableFromSpanText(['connect'], profileTopCard);
  const moreButton =
    queryButtonByLabel(['more', 'more actions'], profileTopCard) ||
    findClickableFromSpanText(['more', 'more actions'], profileTopCard);
  const connectInMenuButton =
    queryButtonByLabel(['connect'], activeMenuRoot) ||
    findClickableFromSpanText(['connect'], activeMenuRoot);
  const addNoteButton =
    queryButtonByLabel(['add a note']) ||
    findClickableFromSpanText(['add a note']);
  const noteTextArea = document.querySelector<HTMLTextAreaElement>(
    'textarea[name="message"], textarea#custom-message',
  );
  const sendButton =
    queryButtonByLabel(['send']) ||
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

export function isLinkedInProfilePage(url = window.location.href): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.linkedin.com' && parsed.pathname.startsWith('/in/');
  } catch {
    return false;
  }
}
