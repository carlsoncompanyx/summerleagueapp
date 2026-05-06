export type CsvImportKind = 'players' | 'games';

export type CsvFieldMap = Record<string, string>;

export type CanonicalCsvRow = Record<string, string> & {
  _rowNumber?: string;
};

export type CsvFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
};

const PLAYER_FIELD_DEFINITIONS: CsvFieldDefinition[] = [
  { key: 'name', label: 'Player name', aliases: ['name', 'player name', 'player_name', 'full name', 'full_name', 'display name'] },
  { key: 'first_name', label: 'First name', aliases: ['first name', 'first_name', 'first'] },
  { key: 'last_name', label: 'Last name', aliases: ['last name', 'last_name', 'last', 'surname'] },
  { key: 'team', label: 'Team', aliases: ['team', 'team name', 'team_name', 'club'] },
  { key: 'jersey', label: 'Jersey number', aliases: ['jersey', 'jersey number', 'jersey_number', 'number', 'no', 'no.', '#', 'uniform number'] },
  { key: 'position', label: 'Position', aliases: ['position', 'pos'] },
  { key: 'nickname', label: 'Nickname', aliases: ['nickname', 'nick name', 'nick_name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'user email', 'user_email', 'contact email'] },
  { key: 'user_id', label: 'Linked user id', aliases: ['user id', 'user_id', 'profile id', 'profile_id'] },
  { key: 'grade', label: 'DFS grade', aliases: ['grade', 'player grade', 'dfs grade', 'valuation grade'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments', 'comment'] },
];

const GAME_FIELD_DEFINITIONS: CsvFieldDefinition[] = [
  { key: 'scheduled_at', label: 'Scheduled at', aliases: ['scheduled_at', 'scheduled at', 'datetime', 'date time', 'game time'] },
  { key: 'date', label: 'Date', aliases: ['date', 'game date', 'scheduled date'] },
  { key: 'time', label: 'Time', aliases: ['time', 'start time', 'game time', 'scheduled time'] },
  { key: 'home_team', label: 'Home team', required: true, aliases: ['home_team', 'home team', 'home', 'home club'] },
  { key: 'away_team', label: 'Away team', required: true, aliases: ['away_team', 'away team', 'away', 'visitor', 'visiting team', 'away club'] },
  { key: 'location', label: 'Location', aliases: ['location', 'rink', 'venue', 'court'] },
  { key: 'status', label: 'Status', aliases: ['status', 'game status'] },
];

function compactNormalizedHeader(value: string) {
  return normalizeHeader(value).replace(/\s+/g, '');
}

export function normalizeHeader(header: string | null | undefined) {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_.-]+/g, ' ')
    .replace(/[^\w#\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTeamName(name: string | null | undefined) {
  return String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCsvFieldDefinitions(kind: CsvImportKind) {
  return kind === 'players' ? PLAYER_FIELD_DEFINITIONS : GAME_FIELD_DEFINITIONS;
}

export function detectCsvFieldMap(headers: string[], kind: CsvImportKind): CsvFieldMap {
  const mapping: CsvFieldMap = {};
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
    compact: compactNormalizedHeader(header),
  }));

  for (const field of getCsvFieldDefinitions(kind)) {
    const aliases = field.aliases.map((alias) => ({
      normalized: normalizeHeader(alias),
      compact: compactNormalizedHeader(alias),
    }));

    const exact = normalizedHeaders.find((header) =>
      aliases.some((alias) => header.normalized === alias.normalized || header.compact === alias.compact),
    );
    if (exact) {
      mapping[field.key] = exact.original;
      continue;
    }

    const contains = normalizedHeaders.find((header) =>
      aliases.some((alias) => alias.normalized.length > 2 && header.normalized.includes(alias.normalized)),
    );
    if (contains) mapping[field.key] = contains.original;
  }

  return mapping;
}

export function applyCsvFieldMap(
  rows: Record<string, string>[],
  mapping: CsvFieldMap,
  kind: CsvImportKind,
): CanonicalCsvRow[] {
  const fields = getCsvFieldDefinitions(kind);
  return rows.map((row, index) => {
    const canonical: CanonicalCsvRow = { _rowNumber: String(index + 1) };
    for (const field of fields) {
      const header = mapping[field.key];
      canonical[field.key] = header ? String(row[header] ?? '').trim() : '';
    }

    if (kind === 'players' && !canonical.name) {
      canonical.name = [canonical.first_name, canonical.last_name].filter(Boolean).join(' ').trim();
    }

    return canonical;
  });
}

export function csvMappingHasRequiredFields(mapping: CsvFieldMap, kind: CsvImportKind) {
  if (kind === 'players') {
    return Boolean(mapping.name || (mapping.first_name && mapping.last_name));
  }

  return Boolean(mapping.home_team && mapping.away_team && (mapping.scheduled_at || (mapping.date && mapping.time)));
}
