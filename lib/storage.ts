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

function withBrowserStorage<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (typeof browser === 'undefined' || !browser.storage?.local) {
    return Promise.resolve(fallback);
  }

  return fn().catch(() => fallback);
}

export async function getCampaignStore(): Promise<CampaignStore> {
  return withBrowserStorage(async () => {
    const out = await browser.storage.local.get(CAMPAIGN_STORE_KEY);
    return sanitizeCampaignStore(out[CAMPAIGN_STORE_KEY] as CampaignStore | undefined);
  }, DEFAULT_CAMPAIGN_STORE);
}

export async function setCampaignStore(store: CampaignStore): Promise<void> {
  await withBrowserStorage(
    async () =>
      browser.storage.local.set({
        [CAMPAIGN_STORE_KEY]: sanitizeCampaignStore(store),
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
    return {
      ...DEFAULT_RUN_STATE,
      ...(out[RUN_STATE_KEY] as RunState | undefined),
    };
  }, DEFAULT_RUN_STATE);
}

export async function setRunState(runState: RunState): Promise<void> {
  await withBrowserStorage(
    async () => browser.storage.local.set({ [RUN_STATE_KEY]: runState }),
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

  try {
    const parsed = new URL(raw);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${parsed.origin.toLowerCase()}${normalizedPath}`;
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
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
