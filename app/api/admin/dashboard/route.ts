import { NextRequest, NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';

import { listAuthUserProfiles, roleFromAuthUser } from '../../../../lib/auth/metadata';
import { normalizeTeamName } from '../../../../lib/csv/mapping';
import { getSupabaseEnvDiagnostics } from '../../../../lib/env';
import { isAdminRole, isCaptainRole } from '../../../../lib/roles';
import { resolveCurrentSeason } from '../../../../lib/seasons/current';
import { createAdminSupabaseClient } from '../../../../lib/supabase/admin';
import { createServerSupabaseClient } from '../../../../lib/supabase/server';

const GAME_STATUSES = new Set(['SCHEDULED', 'LIVE', 'FINAL', 'CANCELED']);
const PLAYER_IMPORT_MODES = new Set(['append', 'upsert', 'replace_all']);
const SCHEDULE_IMPORT_MODES = new Set(['append', 'replace_non_final', 'cancel_non_final']);
// CSV schedules are entered in local league time for the Pensacola/Navarre area.
const LEAGUE_TIME_ZONE = 'America/Chicago';
const CURRENT_SEASON_SELECTORS = new Set(['current', 'default', 'selected', 'open', 'active', 'all']);

class ActionError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'ActionError';
    this.status = status;
    this.details = details;
  }
}

function isAdminTestModeEnabled() {
  const flag = process.env.ADMIN_TEST_MODE === 'true';
  const env = process.env.VERCEL_ENV ?? 'development';
  return flag && env !== 'production';
}

async function getCurrentRole() {
  if (isAdminTestModeEnabled()) return { userId: 'test-admin', role: 'ADMIN' as const };

  const server = createServerSupabaseClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) return { userId: null, role: 'FAN' as const };

  return {
    userId: user.id,
    role: roleFromAuthUser(user) as 'FAN' | 'PLAYER' | 'CAPTAIN' | 'ADMIN',
  };
}

function nullableText(value: unknown) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function importText(value: unknown) {
  return nullableText(value) ?? '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function nullableUuid(value: unknown, field = 'UUID') {
  const text = nullableText(value);
  if (!text) return null;
  if (!isUuid(text)) throw new ActionError(`${field} must be a valid UUID.`);
  return text;
}

function requiredText(value: unknown, field: string) {
  const text = nullableText(value);
  if (!text) throw new ActionError(`${field} is required.`);
  return text;
}

function toIso(value: unknown) {
  const text = nullableText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dateOnly(value: unknown, field: string) {
  const text = requiredText(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new ActionError(`${field} must be a valid date.`);
  return text.slice(0, 10);
}

function integerOrNull(value: unknown, field: string) {
  const text = nullableText(value);
  if (!text) return null;
  const n = Number(text);
  if (!Number.isInteger(n)) throw new ActionError(`${field} must be a whole number.`);
  return n;
}

function rowError(row: unknown, field: string, value: unknown, message: string, fix?: string) {
  return `Row ${String(row || '?')}, field ${field}, value "${String(value ?? '')}": ${message}${fix ? ` Possible fix: ${fix}` : ''}`;
}

function scheduleRowError(rowNumber: unknown, field: string, value: unknown, message: string, fix?: string) {
  return {
    rowNumber: String(rowNumber || '?'),
    field,
    value: String(value ?? ''),
    message,
    fix,
  };
}

function classifyDbError(error: any) {
  const message = String(error?.message ?? '');
  const code = String(error?.code ?? '');
  if (code === '23505') return 'Missing/violated unique constraint or duplicate row.';
  if (code === '22P02' || message.toLowerCase().includes('uuid')) return 'Invalid UUID value.';
  if (code === '42703' || message.toLowerCase().includes('column')) return 'Missing or mismatched database column.';
  if (code === '23502' || message.toLowerCase().includes('null value')) return 'Required database field is missing.';
  if (message.toLowerCase().includes('timestamp') || message.toLowerCase().includes('date/time')) return 'Invalid timestamp/date/time value.';
  if (message.toLowerCase().includes('enum')) return 'Invalid enum value.';
  if (message.toLowerCase().includes('constraint')) return 'Database constraint failure.';
  return null;
}

function safeErrorDetails(action: string, error: any, payload?: any) {
  const targetSeasonSelector = payload?.target_season_id ?? payload?.targetSeasonId ?? payload?.season_id ?? payload?.seasonId ?? null;
  return {
    action,
    message: error?.message ?? 'Operation failed.',
    code: error?.code ?? null,
    hint: error?.hint ?? null,
    details: error?.details ?? null,
    extra: error?.details ?? null,
    classification: classifyDbError(error),
    targetSeasonId: targetSeasonSelector,
    mappedFields: payload?.mapped_fields ?? null,
    mappedFieldList: payload?.mapped_field_list ?? null,
  };
}

async function validateTeamSeason(admin: any, seasonId: string | null | undefined, teamId: string | null | undefined) {
  if (!teamId) return;
  const { data: team, error } = await admin.from('teams').select('season_id').eq('id', teamId).maybeSingle();
  if (error) throw error;
  if (!team) throw new ActionError('Selected team does not exist.');
  if (seasonId && team.season_id !== seasonId) throw new ActionError('Selected team is not in the selected season.');
}

async function countByFilter(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length;
}

async function countIn(admin: any, table: string, column: string, values: string[]) {
  if (!values.length) return 0;
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, values);
  if (error) throw error;
  return count ?? 0;
}

async function setCaptainProfileRole(admin: any, userId: string | null | undefined) {
  // Profiles no longer exist in the simplified schema. Captain assignment is tracked on teams.captain_user_id.
  void admin;
  void userId;
}

async function updateLinkedPlayerRole(admin: any, row: { user_id: string | null; team_id: string | null }, requestedRole: unknown) {
  if (!row.user_id) return;
  const role = String(requestedRole || '').toUpperCase() === 'CAPTAIN' ? 'CAPTAIN' : 'PLAYER';
  if (role === 'CAPTAIN' && row.team_id) {
    const { error: teamError } = await admin.from('teams').update({ captain_user_id: row.user_id }).eq('id', row.team_id);
    if (teamError) throw teamError;
  }
}

function sanitizeSeason(payload: any) {
  return {
    name: requiredText(payload.name, 'Season name'),
    start_date: dateOnly(payload.start_date, 'Start date'),
    end_date: dateOnly(payload.end_date, 'End date'),
    registration_open_at: toIso(payload.registration_open_at),
    registration_close_at: toIso(payload.registration_close_at),
    waiver_text: nullableText(payload.waiver_text),
    rules: nullableText(payload.rules),
  };
}

function sanitizeTeam(payload: any) {
  return {
    name: requiredText(payload.name, 'Team name'),
    season_id: requiredText(payload.season_id, 'Season'),
    logo_url: nullableText(payload.logo_url),
    captain_user_id: nullableUuid(payload.captain_user_id),
  };
}

function sanitizePlayer(payload: any) {
  return {
    season_id: requiredText(payload.season_id, 'Season'),
    team_id: nullableUuid(payload.team_id),
    user_id: nullableUuid(payload.user_id),
    name: requiredText(payload.name, 'Player name'),
    jersey: integerOrNull(payload.jersey, 'Jersey'),
    position: nullableText(payload.position),
    nickname: nullableText(payload.nickname),
  };
}

function sanitizeGame(payload: any) {
  const status = String(payload.status || 'SCHEDULED').toUpperCase();
  if (!GAME_STATUSES.has(status)) throw new ActionError(`Unsupported game status: ${status}.`);
  const scheduledAt = toIso(payload.scheduled_at);
  if (!scheduledAt) throw new ActionError('Scheduled at must be a valid date/time.');
  const homeTeam = requiredText(payload.home_team, 'Home team');
  const awayTeam = requiredText(payload.away_team, 'Away team');
  if (homeTeam === awayTeam) throw new ActionError('Home and away teams cannot be the same.');
  return {
    season_id: requiredText(payload.season_id, 'Season'),
    home_team: homeTeam,
    away_team: awayTeam,
    scheduled_at: scheduledAt,
    location: nullableText(payload.location),
    status,
    home_score: Number(payload.home_score ?? 0),
    away_score: Number(payload.away_score ?? 0),
  };
}

async function preflightTeamDelete(admin: any, teamId: string) {
  const [playerCount, gameCount, tradeCount] = await Promise.all([
    countByFilter(admin.from('players').select('id').eq('team_id', teamId)),
    countByFilter(admin.from('games').select('id').or(`home_team.eq.${teamId},away_team.eq.${teamId}`)),
    countByFilter(admin.from('trades').select('id').or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`)),
  ]);
  const blockers = [
    playerCount ? `${playerCount} player(s)` : '',
    gameCount ? `${gameCount} game(s)` : '',
    tradeCount ? `${tradeCount} trade(s)` : '',
  ].filter(Boolean);
  if (blockers.length) throw new ActionError(`Team cannot be deleted because it is used by ${blockers.join(', ')}.`);
}

async function preflightSeasonDelete(admin: any, seasonId: string) {
  const [teamCount, gameCount, playerCount] = await Promise.all([
    countByFilter(admin.from('teams').select('id').eq('season_id', seasonId)),
    countByFilter(admin.from('games').select('id').eq('season_id', seasonId)),
    countByFilter(admin.from('players').select('id').eq('season_id', seasonId)),
  ]);
  const blockers = [
    teamCount ? `${teamCount} team(s)` : '',
    gameCount ? `${gameCount} game(s)` : '',
    playerCount ? `${playerCount} player(s)` : '',
  ].filter(Boolean);
  if (blockers.length) throw new ActionError(`Season cannot be deleted because it has ${blockers.join(', ')}.`);
}

async function resolveTargetSeasonId(admin: any, payload: any) {
  const { data: seasons, error } = await admin.from('seasons').select('id,name,start_date,end_date,registration_open_at,registration_close_at');
  if (error) throw error;
  const seasonRows = (seasons ?? []) as any[];
  const rawSelector = payload?.target_season_id ?? payload?.targetSeasonId ?? payload?.season_id ?? payload?.seasonId ?? null;
  const selector = nullableText(rawSelector);
  let target: string | null = null;

  if (selector && isUuid(selector)) {
    target = selector;
  } else if (selector && !CURRENT_SEASON_SELECTORS.has(selector.toLowerCase())) {
    const normalizedSelector = normalizeTeamName(selector);
    const matchedSeason = seasonRows.find((season: any) => normalizeTeamName(season.name) === normalizedSelector);
    if (!matchedSeason) {
      throw new ActionError('Target season selector must be a season UUID, a known season name, or current/default/all.', 400, {
        selector,
        availableSeasons: seasonRows.map((season: any) => season.name).filter(Boolean),
      });
    }
    target = matchedSeason.id;
  }

  target = target || resolveCurrentSeason(seasonRows).season?.id || null;
  if (!target) throw new ActionError('No target season could be resolved.');
  if (!seasonRows.some((season: any) => season.id === target)) {
    throw new ActionError('Target season does not exist or is not available to the admin importer.');
  }
  return { targetSeasonId: target, seasons: seasonRows };
}

function importDiagnostics(targetSeasonId: string, seasons: any[], availableTeams: string[], mode: string) {
  const season = seasons.find((row: any) => row.id === targetSeasonId);
  return {
    targetSeasonId,
    targetSeasonName: season?.name ?? null,
    mode,
    availableTeams,
  };
}

function buildTeamLookup(teams: any[], seasonId: string) {
  const map = new Map<string, string>();
  const available: string[] = [];
  for (const team of teams.filter((row: any) => row.season_id === seasonId)) {
    map.set(normalizeTeamName(team.name), team.id);
    available.push(team.name);
  }
  return { map, available };
}

async function getEmailLookup(admin: any) {
  const byEmail = new Map<string, string>();
  const authAdmin = (admin.auth as any)?.admin;
  if (!authAdmin?.listUsers) return byEmail;
  const result = await authAdmin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw result.error;
  for (const user of result.data?.users ?? []) {
    if (user.email && user.id) byEmail.set(String(user.email).toLowerCase(), user.id);
  }
  return byEmail;
}

function parseExcelSerialNumber(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return null;
  return serial;
}

function excelSerialToDateParts(serial: number) {
  const wholeDays = Math.floor(serial);
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + wholeDays * 86400000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function excelSerialToTimePart(serial: number) {
  const fraction = serial - Math.floor(serial);
  const totalSeconds = Math.round(fraction * 24 * 60 * 60);
  return {
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function leagueDateTimeToIso(
  date: { year: number; month: number; day: number },
  time: { hours: number; minutes: number; seconds?: number },
) {
  const local = `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(time.hours)}:${pad2(time.minutes)}:${pad2(time.seconds ?? 0)}`;
  return fromZonedTime(local, LEAGUE_TIME_ZONE).toISOString();
}

function validDateParts(date: { year: number; month: number; day: number }) {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return false;
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return false;
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return probe.getUTCFullYear() === date.year
    && probe.getUTCMonth() === date.month - 1
    && probe.getUTCDate() === date.day;
}

function parseDatePart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const excel = parseExcelSerialNumber(trimmed);
  if (excel) return excelSerialToDateParts(excel);
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    return {
      year: Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]),
      month: Number(slash[1]),
      day: Number(slash[2]),
    };
  }
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
  return null;
}

function parseTimePart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial >= 0 && serial < 1) {
    return excelSerialToTimePart(serial);
  }
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const meridian = match[4]?.toLowerCase();
  if (meridian === 'pm' && hours < 12) hours += 12;
  if (meridian === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function parseLocalDateTimeText(value: string) {
  const match = value.trim().match(/^(.+?)[ T]+(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?)$/i);
  if (!match) return null;
  const date = parseDatePart(match[1]);
  const time = parseTimePart(match[2]);
  if (!date || !validDateParts(date) || !time) return null;
  return leagueDateTimeToIso(date, time);
}

function parseScheduledAt(scheduledAt: string, dateValue: string, timeValue: string) {
  const direct = importText(scheduledAt);
  if (direct) {
    const excel = parseExcelSerialNumber(direct);
    if (excel) {
      if (Number.isInteger(Number(direct))) {
        return { iso: null, field: 'scheduled_at', value: direct, message: 'Scheduled at has a date but no time.' };
      }
      return {
        iso: leagueDateTimeToIso(excelSerialToDateParts(excel), excelSerialToTimePart(excel)),
        field: null,
        value: direct,
        message: null,
      };
    }
    const localDateTime = parseLocalDateTimeText(direct);
    if (localDateTime) {
      return { iso: localDateTime, field: null, value: direct, message: null };
    }
    const directDate = new Date(direct);
    if (!Number.isNaN(directDate.getTime())) {
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(direct) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(direct)) {
        return { iso: null, field: 'scheduled_at', value: direct, message: 'Scheduled at has a date but no time.' };
      }
      return { iso: directDate.toISOString(), field: null, value: direct, message: null };
    }
    return { iso: null, field: 'scheduled_at', value: direct, message: 'Scheduled at could not be parsed as a date/time.' };
  }

  const dateText = importText(dateValue);
  const timeText = importText(timeValue);
  if (!dateText) {
    return { iso: null, field: 'date', value: dateValue, message: 'Date is required when Scheduled at is not mapped.' };
  }
  if (!timeText) {
    return { iso: null, field: 'time', value: timeValue, message: 'Time is required when Date is mapped separately.' };
  }
  const date = parseDatePart(dateText);
  if (!date || !validDateParts(date)) return { iso: null, field: 'date', value: dateValue, message: 'Date could not be parsed.' };
  const time = parseTimePart(timeText);
  if (!time) return { iso: null, field: 'time', value: timeValue, message: 'Time could not be parsed.' };
  return { iso: leagueDateTimeToIso(date, time), field: null, value: `${dateText} ${timeText}`.trim(), message: null };
}

async function preflightPlayerReplace(admin: any, seasonId: string) {
  const { data: players, error } = await admin.from('players').select('id').eq('season_id', seasonId);
  if (error) throw error;
  const playerIds = (players ?? []).map((player: any) => player.id);
  if (!playerIds.length) return;

  const [gameStats, slatePlayers, entryPlayers, teamMembers, tradesRes] = await Promise.all([
    countIn(admin, 'game_stats', 'player_id', playerIds),
    countIn(admin, 'slate_players', 'player_id', playerIds),
    countIn(admin, 'contest_entry_players', 'player_id', playerIds),
    countIn(admin, 'team_members', 'player_id', playerIds),
    admin.from('trades').select('id,players_out,players_in').eq('season_id', seasonId),
  ]);
  if (tradesRes.error) throw tradesRes.error;
  const playerIdSet = new Set(playerIds);
  const tradeRows = (tradesRes.data ?? []).filter((trade: any) =>
    [...(trade.players_out ?? []), ...(trade.players_in ?? [])].some((playerId: string) => playerIdSet.has(playerId)),
  ).length;
  const blockers = [
    gameStats ? `${gameStats} game stat row(s)` : '',
    slatePlayers ? `${slatePlayers} DFS slate player row(s)` : '',
    entryPlayers ? `${entryPlayers} DFS entry player row(s)` : '',
    teamMembers ? `${teamMembers} team member row(s)` : '',
    tradeRows ? `${tradeRows} trade row(s)` : '',
  ].filter(Boolean);
  if (blockers.length) throw new ActionError(`Replace-all is blocked because target-season players have dependencies: ${blockers.join(', ')}.`);
}

async function importPlayers(admin: any, payload: any) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const dryRun = Boolean(payload.dry_run);
  const mode = PLAYER_IMPORT_MODES.has(payload.import_mode) ? payload.import_mode : 'append';
  const { targetSeasonId, seasons } = await resolveTargetSeasonId(admin, payload);
  const { data: teams, error: teamError } = await admin.from('teams').select('id,name,season_id');
  if (teamError) throw teamError;
  const needsEmailLookup = rows.some((row: any) => nullableText(row.email));
  let emailLookup = new Map<string, string>();
  const warnings: string[] = [];
  if (needsEmailLookup) {
    try {
      emailLookup = await getEmailLookup(admin);
    } catch (err: any) {
      warnings.push(`Email linking skipped: ${err?.message ?? 'Unable to read auth users.'}`);
    }
  }

  const teamLookup = buildTeamLookup(teams ?? [], targetSeasonId);
  const rowErrors: string[] = [];
  const mapped: any[] = [];

  rows.forEach((row: any, index: number) => {
    const rowNumber = row._rowNumber || index + 1;
    const name = String(row.name || [row.first_name, row.last_name].filter(Boolean).join(' ')).trim();
    const teamLabel = String(row.team ?? '').trim();
    const teamId = teamLabel ? teamLookup.map.get(normalizeTeamName(teamLabel)) : null;
    const jersey = nullableText(row.jersey);
    const grade = nullableText(row.grade)?.toUpperCase() ?? null;
    const email = nullableText(row.email)?.toLowerCase() ?? null;
    const rawUserId = nullableText(row.user_id);
    const userId = rawUserId && isUuid(rawUserId) ? rawUserId : (email ? emailLookup.get(email) ?? null : null);

    if (!name) rowErrors.push(rowError(rowNumber, 'name', row.name, 'Player name is required.', 'Map Player name, or map First name and Last name.'));
    if (teamLabel && !teamId) rowErrors.push(rowError(rowNumber, 'team', teamLabel, 'Team was not found in the target season.', `Available teams: ${teamLookup.available.join(', ') || 'none'}.`));
    if (jersey && !Number.isInteger(Number(jersey))) rowErrors.push(rowError(rowNumber, 'jersey', jersey, 'Jersey must be a whole number.'));
    if (grade && !['A', 'B', 'C', 'D', 'F'].includes(grade)) rowErrors.push(rowError(rowNumber, 'grade', grade, 'Grade must be A, B, C, D, or F.'));
    if (rawUserId && !isUuid(rawUserId)) rowErrors.push(rowError(rowNumber, 'user_id', rawUserId, 'Linked user id must be a valid UUID.', 'Use a Supabase auth user UUID or leave User ID unmapped.'));
    if (email && !userId) warnings.push(`Row ${rowNumber}: no auth user found for ${email}; imported without user_id.`);

    mapped.push({
      sourceRow: rowNumber,
      season_id: targetSeasonId,
      team_id: teamId,
      user_id: userId,
      name,
      jersey: jersey ? Number(jersey) : null,
      position: nullableText(row.position),
      nickname: nullableText(row.nickname),
      grade,
      notes: nullableText(row.notes),
    });
  });

  if (rowErrors.length) {
    return NextResponse.json({
      ok: false,
      action: 'import_players_csv',
      error: 'CSV validation failed.',
      rowErrors,
      importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode),
      mappedFields: payload.mapped_fields ?? null,
      counts: { inserted: 0, updated: 0, skipped: 0, errors: rowErrors.length },
    }, { status: 400 });
  }

  if (mode === 'replace_all') await preflightPlayerReplace(admin, targetSeasonId);

  if (!dryRun && mapped.some((row) => row.grade || row.notes)) {
    const { error: valuationCheckError } = await admin.from('player_valuation_inputs').select('id').limit(1);
    if (valuationCheckError) {
      const err = new ActionError(`Grade import cannot save to player_valuation_inputs: ${valuationCheckError.message}`, 500) as any;
      err.code = valuationCheckError.code;
      err.hint = valuationCheckError.hint;
      err.details = valuationCheckError.details;
      throw err;
    }
  }

  const { data: existingPlayers, error: existingError } = await admin.from('players').select('id,user_id,name').eq('season_id', targetSeasonId);
  if (existingError) throw existingError;
  const byUser = new Map<string, any>((existingPlayers ?? []).filter((player: any) => player.user_id).map((player: any) => [player.user_id, player]));
  const byName = new Map<string, any>((existingPlayers ?? []).map((player: any) => [normalizeTeamName(player.name), player]));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (dryRun) {
    if (mode === 'upsert') {
      for (const row of mapped) {
        const match = (row.user_id ? byUser.get(row.user_id) : null) || byName.get(normalizeTeamName(row.name));
        if (match) updated += 1;
        else inserted += 1;
      }
    } else {
      inserted = mapped.length;
    }
    return NextResponse.json({ ok: true, dryRun: true, mappedRows: mapped.slice(0, 25), warnings, mappedFields: payload.mapped_fields ?? null, importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode), counts: { inserted, updated, skipped, errors: 0 } });
  }

  async function saveValuation(playerId: string, row: any) {
    if (!row.grade && !row.notes) return;
    const valuationRow = {
      season_id: targetSeasonId,
      player_id: playerId,
      player_grade: row.grade || 'C',
      notes: row.notes,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: findError } = await admin
      .from('player_valuation_inputs')
      .select('id')
      .eq('season_id', targetSeasonId)
      .eq('player_id', playerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    const { error } = existing?.id
      ? await admin.from('player_valuation_inputs').update(valuationRow).eq('id', existing.id)
      : await admin.from('player_valuation_inputs').insert(valuationRow);
    if (error) throw error;
  }

  if (mode === 'replace_all') {
    const { error: deleteError } = await admin.from('players').delete().eq('season_id', targetSeasonId);
    if (deleteError) throw deleteError;
    if (mapped.length) {
      const { data: insertedRows, error: insertError } = await admin.from('players').insert(mapped.map(({ grade, notes, sourceRow, ...row }) => row)).select('id,name,user_id');
      if (insertError) throw insertError;
      inserted = insertedRows?.length ?? mapped.length;
      for (let index = 0; index < (insertedRows ?? []).length; index += 1) {
        await saveValuation(insertedRows[index].id, mapped[index]);
      }
    }
  } else if (mode === 'upsert') {
    for (const row of mapped) {
      const match = (row.user_id ? byUser.get(row.user_id) : null) || byName.get(normalizeTeamName(row.name));
      const { grade, notes, sourceRow, ...playerRow } = row;
      if (match) {
        const updateRow = row.user_id ? playerRow : { ...playerRow, user_id: undefined };
        const { error } = await admin.from('players').update(updateRow).eq('id', match.id);
        if (error) throw error;
        await saveValuation(match.id, row);
        updated += 1;
      } else {
        const { data: insertedRow, error } = await admin.from('players').insert(playerRow).select('id').single();
        if (error) throw error;
        await saveValuation(insertedRow.id, row);
        inserted += 1;
      }
    }
  } else {
    const duplicateUserIds = mapped.filter((row) => row.user_id && byUser.has(row.user_id));
    if (duplicateUserIds.length) {
      return NextResponse.json({
        ok: false,
        action: 'import_players_csv',
        error: 'Append-only import would duplicate linked users.',
        rowErrors: duplicateUserIds.map((row) => rowError(row.sourceRow, 'user_id', row.user_id, 'A player already exists for this user in the target season.', 'Use Upsert/update existing.')),
        importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode),
        mappedFields: payload.mapped_fields ?? null,
        counts: { inserted: 0, updated: 0, skipped: duplicateUserIds.length, errors: duplicateUserIds.length },
      }, { status: 400 });
    }
    if (mapped.length) {
      const { data: insertedRows, error } = await admin.from('players').insert(mapped.map(({ grade, notes, sourceRow, ...row }) => row)).select('id');
      if (error) throw error;
      inserted = insertedRows?.length ?? mapped.length;
      for (let index = 0; index < (insertedRows ?? []).length; index += 1) {
        await saveValuation(insertedRows[index].id, mapped[index]);
      }
    }
  }

  return NextResponse.json({ ok: true, warnings, mappedFields: payload.mapped_fields ?? null, importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode), counts: { inserted, updated, skipped, errors: 0 } });
}

async function relatedGameCounts(admin: any, gameIds: string[]) {
  if (!gameIds.length) return { gameStats: 0, slateGames: 0, bettingLines: 0, bets: 0, walletTransactions: 0 };
  const [gameStats, slateGames, bettingLines, bets, walletTransactions] = await Promise.all([
    countIn(admin, 'game_stats', 'game_id', gameIds),
    countIn(admin, 'slate_games', 'game_id', gameIds),
    countIn(admin, 'game_betting_lines', 'game_id', gameIds),
    countIn(admin, 'bets', 'game_id', gameIds),
    countByFilter(admin.from('wallet_transactions').select('id').eq('ref_type', 'game').in('ref_id', gameIds)),
  ]);
  return { gameStats, slateGames, bettingLines, bets, walletTransactions };
}

async function importGames(admin: any, payload: any) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const dryRun = Boolean(payload.dry_run);
  const mode = SCHEDULE_IMPORT_MODES.has(payload.existing_schedule_mode) ? payload.existing_schedule_mode : 'append';
  const { targetSeasonId, seasons } = await resolveTargetSeasonId(admin, payload);
  const { data: teams, error: teamError } = await admin.from('teams').select('id,name,season_id');
  if (teamError) throw teamError;
  const teamLookup = buildTeamLookup(teams ?? [], targetSeasonId);

  const rowErrors: any[] = [];
  const mapped: any[] = [];

  rows.forEach((row: any, index: number) => {
    const rowNumber = row._rowNumber || index + 1;
    const homeLabel = importText(row.home_team);
    const awayLabel = importText(row.away_team);
    const homeTeam = homeLabel ? teamLookup.map.get(normalizeTeamName(homeLabel)) : null;
    const awayTeam = awayLabel ? teamLookup.map.get(normalizeTeamName(awayLabel)) : null;
    const status = (importText(row.status) || 'SCHEDULED').toUpperCase();
    const scheduledAtResult = parseScheduledAt(importText(row.scheduled_at), importText(row.date), importText(row.time));
    const scheduledAt = scheduledAtResult.iso;

    if (!homeLabel) rowErrors.push(scheduleRowError(rowNumber, 'home_team', homeLabel, 'Home team is required.'));
    if (!awayLabel) rowErrors.push(scheduleRowError(rowNumber, 'away_team', awayLabel, 'Away team is required.'));
    if (homeLabel && !homeTeam) rowErrors.push(scheduleRowError(rowNumber, 'home_team', homeLabel, 'Team was not found in the target season.', `Available teams: ${teamLookup.available.join(', ') || 'none'}.`));
    if (awayLabel && !awayTeam) rowErrors.push(scheduleRowError(rowNumber, 'away_team', awayLabel, 'Team was not found in the target season.', `Available teams: ${teamLookup.available.join(', ') || 'none'}.`));
    if (homeTeam && awayTeam && homeTeam === awayTeam) rowErrors.push(scheduleRowError(rowNumber, 'away_team', awayLabel, 'Home and away teams cannot be the same.'));
    if (!scheduledAt) rowErrors.push(scheduleRowError(
      rowNumber,
      scheduledAtResult.field ?? 'scheduled_at',
      scheduledAtResult.value || importText(row.scheduled_at) || `${importText(row.date)} ${importText(row.time)}`.trim(),
      scheduledAtResult.message ?? 'A valid scheduled date/time is required.',
      'Map Scheduled at, or map Date plus Time.',
    ));
    if (!GAME_STATUSES.has(status)) rowErrors.push(scheduleRowError(rowNumber, 'status', row.status, 'Unsupported game status.', `Use ${Array.from(GAME_STATUSES).join(', ')}.`));

    mapped.push({
      sourceRow: rowNumber,
      season_id: targetSeasonId,
      home_team: homeTeam,
      away_team: awayTeam,
      scheduled_at: scheduledAt,
      location: nullableText(row.location),
      status,
    });
  });

  if (rowErrors.length) {
    return NextResponse.json({
      ok: false,
      action: 'import_games_csv',
      error: 'CSV validation failed.',
      rowErrors,
      importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode),
      mappedFields: payload.mapped_fields ?? null,
      counts: { inserted: 0, updated: 0, skipped: 0, errors: rowErrors.length },
    }, { status: 400 });
  }

  let updated = 0;
  if (mode !== 'append') {
    const { data: existing, error } = await admin.from('games').select('id,status').eq('season_id', targetSeasonId).neq('status', 'FINAL');
    if (error) throw error;
    const ids = (existing ?? []).map((game: any) => game.id);
    updated = ids.length;
    if (mode === 'replace_non_final') {
      const counts = await relatedGameCounts(admin, ids);
      const blockers = [
        counts.gameStats ? `${counts.gameStats} game stat row(s)` : '',
        counts.slateGames ? `${counts.slateGames} DFS slate game row(s)` : '',
        counts.bettingLines ? `${counts.bettingLines} betting line row(s)` : '',
        counts.bets ? `${counts.bets} bet row(s)` : '',
        counts.walletTransactions ? `${counts.walletTransactions} wallet transaction(s)` : '',
      ].filter(Boolean);
      if (blockers.length) throw new ActionError(`Replace non-final is blocked because existing games have related rows: ${blockers.join(', ')}. Use Cancel non-final, then append the corrected schedule.`);
    }
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, mappedRows: mapped.slice(0, 25), mappedFields: payload.mapped_fields ?? null, importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode), counts: { inserted: mapped.length, updated: mode === 'append' ? 0 : updated, skipped: 0, errors: 0 } });
  }

  if (mode !== 'append') {
    const { data: existing, error } = await admin.from('games').select('id,status').eq('season_id', targetSeasonId).neq('status', 'FINAL');
    if (error) throw error;
    const ids = (existing ?? []).map((game: any) => game.id);
    if (ids.length && mode === 'replace_non_final') {
      const { error: deleteError } = await admin.from('games').delete().in('id', ids);
      if (deleteError) throw deleteError;
    } else if (ids.length && mode === 'cancel_non_final') {
      const { error: cancelError } = await admin.from('games').update({ status: 'CANCELED' }).in('id', ids);
      if (cancelError) throw cancelError;
    }
  }

  const insertRows = mapped.map(({ sourceRow, ...row }) => row);
  const { data: insertedRows, error: insertError } = insertRows.length
    ? await admin.from('games').insert(insertRows).select('id')
    : { data: [] as any[], error: null };
  if (insertError) throw insertError;

  return NextResponse.json({ ok: true, mappedFields: payload.mapped_fields ?? null, importDiagnostics: importDiagnostics(targetSeasonId, seasons, teamLookup.available, mode), counts: { inserted: insertedRows?.length ?? mapped.length, updated: mode === 'append' ? 0 : updated, skipped: 0, errors: 0 } });
}

export async function GET() {
  const admin = createAdminSupabaseClient();
  const me = await getCurrentRole();
  if (!isAdminRole(me.role)) {
    return NextResponse.json({ ok: false, error: 'Admin access required.' }, { status: 403 });
  }

  const [seasons, teams, players, games, trades, gameStats] =
    await Promise.all([
      admin.from('seasons').select('*').order('start_date', { ascending: false }),
      admin.from('teams').select('*').order('name'),
      admin.from('players').select('*').order('name'),
      admin.from('games').select('*').order('scheduled_at', { ascending: true }),
      admin.from('trades').select('*').order('created_at', { ascending: false }),
      admin.from('game_stats').select('*').order('created_at', { ascending: false }),
    ]);

  const dashboardErrors = [
    ['seasons', seasons.error],
    ['teams', teams.error],
    ['players', players.error],
    ['games', games.error],
    ['trades', trades.error],
    ['game_stats', gameStats.error],
  ].filter((entry) => entry[1]);
  if (dashboardErrors.length) {
    console.error('[admin-dashboard] dataset load errors', dashboardErrors.map(([dataset, error]) => ({
      dataset,
      message: (error as any)?.message,
      code: (error as any)?.code,
      hint: (error as any)?.hint,
      details: (error as any)?.details,
    })));
  }
  const datasetErrors = dashboardErrors.map(([dataset, error]) => ({
    dataset,
    message: (error as any)?.message ?? 'Unknown dataset error.',
    code: (error as any)?.code ?? null,
    hint: (error as any)?.hint ?? null,
    details: (error as any)?.details ?? null,
  }));

  const authProfiles = await listAuthUserProfiles(admin);
  const resolved = resolveCurrentSeason((seasons.data ?? []) as any[]);

  return NextResponse.json({
    role: me.role,
    userId: me.userId,
    testMode: isAdminTestModeEnabled(),
    currentSeasonId: resolved.season?.id ?? null,
    diagnostics: {
      env: getSupabaseEnvDiagnostics(),
      currentSeasonId: resolved.season?.id ?? null,
      currentSeasonName: resolved.season?.name ?? null,
      currentRole: me.role,
      datasetErrors,
    },
    datasetErrors,
    profileEmailError: authProfiles.errorMessage,
    seasons: seasons.data ?? [],
    teams: teams.data ?? [],
    players: players.data ?? [],
    games: games.data ?? [],
    trades: trades.data ?? [],
    gameStats: gameStats.data ?? [],
    profiles: authProfiles.profiles,
  });
}

export async function POST(req: NextRequest) {
  const admin = createAdminSupabaseClient();
  const { action, payload } = await req.json();
  const me = await getCurrentRole();

  const adminOnly = new Set([
    'season_create',
    'season_update',
    'season_delete',
    'team_create',
    'team_update',
    'team_delete',
    'player_create',
    'player_update',
    'player_delete',
    'game_create',
    'game_update',
    'game_delete',
    'game_score_submit',
    'trade_approve',
    'trade_reject',
    'import_players_csv',
    'import_games_csv',
    'games_bulk_update',
  ]);

  if (adminOnly.has(action) && !isAdminRole(me.role)) {
    return NextResponse.json({ ok: false, error: 'Admin access required.' }, { status: 403 });
  }
  if (action === 'trade_propose' && !(isAdminRole(me.role) || isCaptainRole(me.role))) {
    return NextResponse.json({ ok: false, error: 'Captain or Admin role required to propose trades.' }, { status: 403 });
  }

  try {
    if (action === 'season_create') {
      const { error } = await admin.from('seasons').insert(sanitizeSeason(payload));
      if (error) throw error;
    } else if (action === 'season_update') {
      const id = requiredText(payload.id, 'Season id');
      const { error } = await admin.from('seasons').update(sanitizeSeason(payload)).eq('id', id);
      if (error) throw error;
    } else if (action === 'season_delete') {
      const id = requiredText(payload.id, 'Season id');
      await preflightSeasonDelete(admin, id);
      const { error } = await admin.from('seasons').delete().eq('id', id);
      if (error) throw error;
    } else if (action === 'team_create') {
      const row = sanitizeTeam(payload);
      const { error } = await admin.from('teams').insert(row);
      if (error) throw error;
      await setCaptainProfileRole(admin, row.captain_user_id);
    } else if (action === 'team_update') {
      const id = requiredText(payload.id, 'Team id');
      const row = sanitizeTeam(payload);
      const { error } = await admin.from('teams').update(row).eq('id', id);
      if (error) throw error;
      await setCaptainProfileRole(admin, row.captain_user_id);
    } else if (action === 'team_delete') {
      const id = requiredText(payload.id, 'Team id');
      await preflightTeamDelete(admin, id);
      const { error } = await admin.from('teams').delete().eq('id', id);
      if (error) throw error;
    } else if (action === 'player_create') {
      const row = sanitizePlayer(payload);
      await validateTeamSeason(admin, row.season_id, row.team_id);
      const { data: player, error } = await admin.from('players').insert(row).select('id,user_id,team_id').single();
      if (error) throw error;
      await updateLinkedPlayerRole(admin, { user_id: player.user_id, team_id: player.team_id }, payload.profile_role);
    } else if (action === 'player_update') {
      const id = requiredText(payload.id, 'Player id');
      const row = sanitizePlayer(payload);
      await validateTeamSeason(admin, row.season_id, row.team_id);
      const { data: player, error } = await admin.from('players').update(row).eq('id', id).select('id,user_id,team_id').single();
      if (error) throw error;
      await updateLinkedPlayerRole(admin, { user_id: player.user_id, team_id: player.team_id }, payload.profile_role);
    } else if (action === 'player_delete') {
      const { error } = await admin.from('players').delete().eq('id', requiredText(payload.id, 'Player id'));
      if (error) throw error;
    } else if (action === 'game_create') {
      const row = sanitizeGame(payload);
      await validateTeamSeason(admin, row.season_id, row.home_team);
      await validateTeamSeason(admin, row.season_id, row.away_team);
      const { error } = await admin.from('games').insert(row);
      if (error) throw error;
    } else if (action === 'game_update') {
      const id = requiredText(payload.id, 'Game id');
      const row = sanitizeGame(payload);
      await validateTeamSeason(admin, row.season_id, row.home_team);
      await validateTeamSeason(admin, row.season_id, row.away_team);
      const { error } = await admin.from('games').update(row).eq('id', id);
      if (error) throw error;
    } else if (action === 'game_delete') {
      const { error } = await admin.from('games').delete().eq('id', requiredText(payload.id, 'Game id'));
      if (error) throw error;
    } else if (action === 'game_score_submit') {
      const { gameId, homeScore, awayScore, stats } = payload;
      const { error: gameError } = await admin.from('games').update({ home_score: homeScore, away_score: awayScore, status: 'FINAL' }).eq('id', gameId);
      if (gameError) throw gameError;
      const { error: deleteError } = await admin.from('game_stats').delete().eq('game_id', gameId);
      if (deleteError) throw deleteError;
      if (Array.isArray(stats) && stats.length) {
        const { error: statsError } = await admin.from('game_stats').insert(
          stats.map((row: any) => ({
            game_id: gameId,
            player_id: row.player_id,
            is_goalie: Boolean(row.is_goalie || String(row.position || '').toLowerCase().includes('goal')),
            games_played: Number(row.games_played || 0),
            goals: Number(row.goals || 0),
            assists: Number(row.assists || 0),
            goals_against: Number(row.goals_against || 0),
          })),
        );
        if (statsError) throw statsError;
      }
    } else if (action === 'trade_propose') {
      const { error } = await admin.from('trades').insert({ ...payload, proposed_by: payload.proposed_by || me.userId, status: 'proposed' });
      if (error) throw error;
    } else if (action === 'trade_approve') {
      const { tradeId } = payload;
      const { data: trade, error: tradeErr } = await admin.from('trades').select('*').eq('id', tradeId).single();
      if (tradeErr) throw tradeErr;
      if (Array.isArray(trade.players_out) && trade.players_out.length) {
        const { error: outErr } = await admin.from('players').update({ team_id: trade.to_team_id }).in('id', trade.players_out);
        if (outErr) throw outErr;
      }
      if (Array.isArray(trade.players_in) && trade.players_in.length) {
        const { error: inErr } = await admin.from('players').update({ team_id: trade.from_team_id }).in('id', trade.players_in);
        if (inErr) throw inErr;
      }
      const { error: statusErr } = await admin.from('trades').update({ status: 'admin_approved' }).eq('id', tradeId);
      if (statusErr) throw statusErr;
    } else if (action === 'trade_reject') {
      const { error } = await admin.from('trades').update({ status: 'admin_declined' }).eq('id', payload.tradeId);
      if (error) throw error;
    } else if (action === 'games_bulk_update') {
      const ids: string[] = Array.isArray(payload.ids) ? payload.ids : [];
      const mode = String(payload.mode || '');
      if (!ids.length) return NextResponse.json({ error: 'No games selected.' }, { status: 400 });
      if (!['delete', 'cancel'].includes(mode)) return NextResponse.json({ error: 'Unsupported bulk game action.' }, { status: 400 });
      const { data: selected, error: selectedError } = await admin.from('games').select('id,status').in('id', ids);
      if (selectedError) throw selectedError;
      const finalCount = (selected ?? []).filter((game: any) => String(game.status) === 'FINAL').length;
      if (mode === 'delete' && finalCount) return NextResponse.json({ error: 'Cannot bulk delete FINAL games.' }, { status: 400 });
      if (mode === 'delete') {
        const counts = await relatedGameCounts(admin, ids);
        if (counts.bets || counts.walletTransactions) {
          return NextResponse.json({ error: 'Cannot bulk delete games with bets or wallet transactions. Use cancel instead.' }, { status: 400 });
        }
        await admin.from('game_stats').delete().in('game_id', ids);
        await admin.from('slate_games').delete().in('game_id', ids);
        await admin.from('game_betting_lines').delete().in('game_id', ids);
        const { error } = await admin.from('games').delete().in('id', ids);
        if (error) throw error;
        return NextResponse.json({ ok: true, deleted: ids.length });
      }
      const { error } = await admin.from('games').update({ status: 'CANCELED' }).in('id', ids).neq('status', 'FINAL');
      if (error) throw error;
      return NextResponse.json({ ok: true, updated: ids.length });
    } else if (action === 'import_players_csv') {
      return importPlayers(admin, payload);
    } else if (action === 'import_games_csv') {
      return importGames(admin, payload);
    } else {
      return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ActionError || e?.name === 'ActionError' ? e.status : 500;
    const details = safeErrorDetails(action, e, payload);
    console.error('[admin-dashboard] action failed', details, e);
    if (action === 'import_players_csv' || action === 'import_games_csv') {
      return NextResponse.json({
        ok: false,
        action,
        error: e?.message ?? 'Import failed.',
        rowErrors: e?.rowErrors ?? [],
        details,
        importDiagnostics: {
          targetSeasonId: details.targetSeasonId,
          mode: payload?.import_mode ?? payload?.existing_schedule_mode ?? null,
          availableTeams: e?.availableTeams ?? [],
        },
        mappedFields: details.mappedFields,
      }, { status });
    }
    return NextResponse.json({ ok: false, action, error: e?.message ?? 'Operation failed.', details }, { status });
  }
}
