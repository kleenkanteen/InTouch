import type {
  Campaign,
  CsvImportResult,
  CsvMapping,
  DuplicateRecord,
  Prospect,
} from './types';
import { normalizeProfileUrl } from './storage';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function rowToProspect(row: string[], mapping: CsvMapping): Prospect {
  const fullName = row[Number(mapping.fullName)]?.trim() ?? '';
  const profileUrl = normalizeProfileUrl(row[Number(mapping.profileUrl)] ?? '');
  const company = row[Number(mapping.company)]?.trim() ?? '';
  const jobTitle = row[Number(mapping.jobTitle)]?.trim() ?? '';

  return {
    id: crypto.randomUUID(),
    fullName,
    profileUrl,
    company,
    jobTitle,
    status: 'Prospect',
  };
}

export function importCsvRows(
  parsed: ParsedCsv,
  mapping: CsvMapping,
  campaign: Campaign,
): CsvImportResult {
  const existing = new Set(
    campaign.prospects.map((prospect) => normalizeProfileUrl(prospect.profileUrl)),
  );
  const seenInFile = new Set<string>();

  const imported: Prospect[] = [];
  const duplicates: DuplicateRecord[] = [];
  const invalidRows: Array<{ row: number; reason: string }> = [];

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const prospect = rowToProspect(row, mapping);

    if (!prospect.profileUrl || !prospect.profileUrl.includes('linkedin.com/in/')) {
      invalidRows.push({ row: rowNumber, reason: 'Invalid or missing profile URL' });
      return;
    }

    if (!prospect.fullName) {
      invalidRows.push({ row: rowNumber, reason: 'Missing full name' });
      return;
    }

    if (existing.has(prospect.profileUrl)) {
      duplicates.push({
        fullName: prospect.fullName,
        profileUrl: prospect.profileUrl,
        sourceRowNumber: rowNumber,
        duplicateReason: 'exists_in_campaign',
      });
      return;
    }

    if (seenInFile.has(prospect.profileUrl)) {
      duplicates.push({
        fullName: prospect.fullName,
        profileUrl: prospect.profileUrl,
        sourceRowNumber: rowNumber,
        duplicateReason: 'duplicate_in_csv',
      });
      return;
    }

    seenInFile.add(prospect.profileUrl);
    imported.push(prospect);
  });

  return { imported, duplicates, invalidRows };
}
