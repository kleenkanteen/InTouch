export type ProspectStatus =
  | 'Prospect'
  | 'Sent Request'
  | 'Already connected'
  | 'Invalid Profile';

export interface Prospect {
  id: string;
  fullName: string;
  profileUrl: string;
  company: string;
  jobTitle: string;
  status: ProspectStatus;
  lastAttemptAt?: string;
  lastStatusReason?: string;
}

export interface Campaign {
  id: string;
  name: string;
  dailyLimit: number;
  connectionNote: string;
  prospects: Prospect[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStore {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  floatingButtonPosition: {
    x: number;
    y: number;
  };
  panelPosition: {
    x: number;
    y: number;
  };
}

export interface RunState {
  isRunning: boolean;
  campaignId: string | null;
  queue: string[];
  currentProspectId: string | null;
  runStartedAt: string | null;
  dailySentCountByPstDate: Record<string, number>;
  nextActionLabel: string | null;
  nextActionAt: number | null;
}

export interface DuplicateRecord {
  fullName: string;
  profileUrl: string;
  sourceRowNumber: number;
  duplicateReason: 'exists_in_campaign' | 'duplicate_in_csv';
}

export interface InvalidRow {
  row: number;
  reason: string;
}

export interface CsvImportResult {
  imported: Prospect[];
  duplicates: DuplicateRecord[];
  invalidRows: InvalidRow[];
}

export interface CsvMapping {
  fullName: string;
  profileUrl: string;
  company: string;
  jobTitle: string;
}

export const CAMPAIGN_STORE_KEY = 'liCampaigns:v1';
export const RUN_STATE_KEY = 'liRunState:v1';

export const DEFAULT_BUTTON_POSITION = { x: 24, y: 120 };

export const DEFAULT_RUN_STATE: RunState = {
  isRunning: false,
  campaignId: null,
  queue: [],
  currentProspectId: null,
  runStartedAt: null,
  dailySentCountByPstDate: {},
  nextActionLabel: null,
  nextActionAt: null,
};

export const DEFAULT_CAMPAIGN_STORE: CampaignStore = {
  campaigns: [],
  activeCampaignId: null,
  floatingButtonPosition: DEFAULT_BUTTON_POSITION,
  panelPosition: { x: 24, y: 30 },
};
