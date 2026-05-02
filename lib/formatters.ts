import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const LEAGUE_TIMEZONE = 'America/Chicago';

export function formatPublicDateTime(value: string | number | Date | null | undefined) {
  if (!value) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return formatInTimeZone(d, LEAGUE_TIMEZONE, 'EEE, MMM d · h:mm a zzz');
}

export function toLeagueDateTimeInput(value: string | number | Date | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, LEAGUE_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

export function fromLeagueDateTimeInput(value: string | null | undefined) {
  if (!value) return null;
  const utc = fromZonedTime(value, LEAGUE_TIMEZONE);
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

export function leagueDateKey(value: string | number | Date | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatInTimeZone(d, LEAGUE_TIMEZONE, 'yyyy-MM-dd');
}

export function nowLeagueDateKey() {
  return formatInTimeZone(new Date(), LEAGUE_TIMEZONE, 'yyyy-MM-dd');
}
