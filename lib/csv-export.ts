import type { Campaign } from './types';

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function exportCampaignPeopleCsv(campaign: Campaign): {
  filename: string;
  content: string;
} {
  const headers = [
    'Full Name',
    'Profile URL',
    'Company',
    'Job Title',
    'Status',
    'Last Attempt At',
    'Status Reason',
  ];

  const rows = campaign.prospects.map((prospect) =>
    [
      prospect.fullName,
      prospect.profileUrl,
      prospect.company,
      prospect.jobTitle,
      prospect.status,
      prospect.lastAttemptAt ?? '',
      prospect.lastStatusReason ?? '',
    ]
      .map((value) => escapeCsv(String(value)))
      .join(','),
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${toSlug(campaign.name || 'campaign')}-people-${date}.csv`;

  return {
    filename,
    content: [headers.join(','), ...rows].join('\n'),
  };
}
