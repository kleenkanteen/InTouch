import type { ProspectStatus } from './types';

export type RuntimeMessage =
  | {
      type: 'START_CAMPAIGN';
      campaignId: string;
      tabId: number;
      dryRun?: boolean;
    }
  | { type: 'STOP_CAMPAIGN' }
  | { type: 'GET_RUN_STATE' }
  | { type: 'RUN_NEXT_STEP' }
  | {
      type: 'OPEN_PROFILE';
      profileUrl: string;
      tabId: number;
    }
  | {
      type: 'UPDATE_PROSPECT_STATUS';
      campaignId: string;
      prospectId: string;
      status: ProspectStatus;
      reason?: string;
    }
  | {
      type: 'PROCESS_CURRENT_PROFILE';
      campaignId: string;
      prospectId: string;
      note: string;
      dryRun?: boolean;
    };

export interface ProcessProfileResult {
  status: ProspectStatus;
  reason?: string;
  timeline: Array<{ step: string; at: string }>;
}
