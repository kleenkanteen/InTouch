import {
  CAMPAIGN_STORE_KEY,
  DEFAULT_CAMPAIGN_STORE,
  DEFAULT_RUN_STATE,
  RUN_STATE_KEY,
  type Campaign,
  type CampaignStore,
  type Prospect,
  type ProspectStatus,
  type RunState,
} from './types';

const CAMPAIGN_STORE_MIRROR_KEY = 'intouch:campaign-store:v1';

function readCampaignMirror(): CampaignStore | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORE_MIRROR_KEY);
    if (!raw) return null;
    return sanitizeCampaignStore(JSON.parse(raw) as CampaignStore);
  } catch {
    return null;
  }
}

function writeCampaignMirror(store: CampaignStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CAMPAIGN_STORE_MIRROR_KEY, JSON.stringify(store));
  } catch {
    // Ignore mirror write failures.
  }
}

function sanitizeCampaignStore(input?: Partial<CampaignStore>): CampaignStore {
  const campaigns = Array.isArray(input?.campaigns)
    ? input!.campaigns.filter(
        (campaign): campaign is Campaign =>
          Boolean(campaign) &&
          typeof campaign.id === 'string' &&
          typeof campaign.name === 'string' &&
          Array.isArray(campaign.prospects),
      )
    : [];

  const activeCampaignId =
    typeof input?.activeCampaignId === 'string' ? input.activeCampaignId : null;

  const floatingButtonPosition =
    input?.floatingButtonPosition &&
    Number.isFinite(input.floatingButtonPosition.x) &&
    Number.isFinite(input.floatingButtonPosition.y)
      ? input.floatingButtonPosition
      : DEFAULT_CAMPAIGN_STORE.floatingButtonPosition;

  const panelPosition =
    input?.panelPosition &&
    Number.isFinite(input.panelPosition.x) &&
    Number.isFinite(input.panelPosition.y)
      ? input.panelPosition
      : DEFAULT_CAMPAIGN_STORE.panelPosition;

  return {
    campaigns,
    activeCampaignId,
    floatingButtonPosition,
    panelPosition,
  };
}

function sanitizeRunState(input?: Partial<RunState>): RunState {
  const dailySentCountByPstDate =
    input?.dailySentCountByPstDate && typeof input.dailySentCountByPstDate === 'object'
      ? input.dailySentCountByPstDate
      : {};

  return {
    isRunning: Boolean(input?.isRunning),
    campaignId: typeof input?.campaignId === 'string' ? input.campaignId : null,
    queue: Array.isArray(input?.queue) ? input.queue.filter((id): id is string => typeof id === 'string') : [],
    currentProspectId:
      typeof input?.currentProspectId === 'string' ? input.currentProspectId : null,
    runStartedAt: typeof input?.runStartedAt === 'string' ? input.runStartedAt : null,
    dailySentCountByPstDate,
    nextActionLabel:
      typeof input?.nextActionLabel === 'string' ? input.nextActionLabel : null,
    nextActionAt:
      typeof input?.nextActionAt === 'number' && Number.isFinite(input.nextActionAt)
        ? input.nextActionAt
        : null,
  };
}

function withBrowserStorage<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (typeof browser === 'undefined' || !browser.storage?.local) {
    return Promise.resolve(fallback);
  }

  return fn().catch(() => fallback);
}

export async function getCampaignStore(): Promise<CampaignStore> {
  return withBrowserStorage(async () => {
    const out = await browser.storage.local.get(CAMPAIGN_STORE_KEY);
    const primary = sanitizeCampaignStore(out[CAMPAIGN_STORE_KEY] as CampaignStore | undefined);
    if (primary.campaigns.length) {
      return primary;
    }
    return readCampaignMirror() ?? primary;
  }, DEFAULT_CAMPAIGN_STORE);
}

export async function setCampaignStore(store: CampaignStore): Promise<void> {
  const sanitized = sanitizeCampaignStore(store);
  writeCampaignMirror(sanitized);
  await withBrowserStorage(
    async () =>
      browser.storage.local.set({
        [CAMPAIGN_STORE_KEY]: sanitized,
      }),
    undefined,
  );
}

export async function updateCampaignStore(
  updater: (store: CampaignStore) => CampaignStore,
): Promise<CampaignStore> {
  const store = await getCampaignStore();
  const updated = updater(store);
  await setCampaignStore(updated);
  return updated;
}

export async function getRunState(): Promise<RunState> {
  return withBrowserStorage(async () => {
    const out = await browser.storage.local.get(RUN_STATE_KEY);
    return sanitizeRunState(out[RUN_STATE_KEY] as RunState | undefined);
  }, DEFAULT_RUN_STATE);
}

export async function setRunState(runState: RunState): Promise<void> {
  const sanitized = sanitizeRunState(runState);
  await withBrowserStorage(
    async () => browser.storage.local.set({ [RUN_STATE_KEY]: sanitized }),
    undefined,
  );
}

export async function updateRunState(
  updater: (state: RunState) => RunState,
): Promise<RunState> {
  const runState = await getRunState();
  const updated = updater(runState);
  await setRunState(updated);
  return updated;
}

export function normalizeCampaignName(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase();
}

export function normalizeProfileUrl(profileUrl: string): string {
  const raw = profileUrl.trim();
  if (!raw) {
    return '';
  }

  let candidate = raw;
  if (/^www\.linkedin\.com\//i.test(candidate) || /^linkedin\.com\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  } else if (/^\/in\//i.test(candidate)) {
    candidate = `https://www.linkedin.com${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin.toLowerCase()}${normalizedPath}`;
  } catch {
    return candidate.replace(/\/+$/, '').toLowerCase();
  }
}

export function createCampaign(name: string): Campaign {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    dailyLimit: 20,
    connectionNote: '',
    prospects: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProspectStatus(
  campaign: Campaign,
  prospectId: string,
  status: ProspectStatus,
  reason?: string,
): Campaign {
  const now = new Date().toISOString();
  const prospects = campaign.prospects.map((prospect: Prospect) => {
    if (prospect.id !== prospectId) {
      return prospect;
    }

    return {
      ...prospect,
      status,
      lastAttemptAt: now,
      lastStatusReason: reason,
    };
  });

  return {
    ...campaign,
    prospects,
    updatedAt: now,
  };
}
