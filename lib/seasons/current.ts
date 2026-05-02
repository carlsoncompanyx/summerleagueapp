import { formatInTimeZone } from 'date-fns-tz';
import { LEAGUE_TIMEZONE } from '../formatters';

export type SeasonRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  registration_open_at: string | null;
  registration_close_at: string | null;
};

export function resolveCurrentSeason(seasons: SeasonRow[], explicitSeasonId?: string | null, adminSeasonFilter?: string | null) {
  if (!seasons.length) return { season: null, reason: 'No seasons exist' as const };
  if (explicitSeasonId) {
    const season = seasons.find((s) => s.id === explicitSeasonId);
    if (season) return { season, reason: 'explicit' as const };
  }
  if (adminSeasonFilter && adminSeasonFilter !== 'all') {
    const season = seasons.find((s) => s.id === adminSeasonFilter);
    if (season) return { season, reason: 'admin_filter' as const };
  }

  const now = new Date();
  const nowTs = now.getTime();
  const todayKey = formatInTimeZone(now, LEAGUE_TIMEZONE, 'yyyy-MM-dd');

  const inRegistration = seasons.find((s) => {
    if (!s.registration_open_at || !s.registration_close_at) return false;
    return new Date(s.registration_open_at).getTime() <= nowTs && new Date(s.registration_close_at).getTime() >= nowTs;
  });
  if (inRegistration) return { season: inRegistration, reason: 'registration_window' as const };

  const inSeason = seasons.find((s) => {
    const start = String(s.start_date).slice(0, 10);
    const end = String(s.end_date).slice(0, 10);
    return start <= todayKey && todayKey <= end;
  });
  if (inSeason) return { season: inSeason, reason: 'season_window' as const };

  const sorted = [...seasons].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  return { season: sorted[0], reason: 'latest' as const };
}
