// src/utils/timeUtils.ts

export type RelativeTime =
  | { kind: 'now' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'days'; count: number }
  | { kind: 'date'; date: string };

// SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC, with no
// timezone marker. JavaScript would read that as local time, so it is
// normalised to a proper UTC ISO string first.
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const parseTimestamp = (value: string): number => {
  const normalized = SQLITE_TIMESTAMP.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  return new Date(normalized).getTime();
};

/**
 * Converts a stored timestamp into a relative-time bucket for history cards.
 *
 * Accepts SQLite CURRENT_TIMESTAMP values and ISO 8601 strings. Returns a
 * structured value (not a string) so the caller can translate it with i18n.
 * Anything older than 7 days falls back to the locale date string.
 * Invalid or future timestamps never produce "NaN" or negative values.
 */
export const formatRelativeTime = (value: string): RelativeTime => {
  const time = parseTimestamp(value);
  if (Number.isNaN(time)) return { kind: 'date', date: '' };

  const diffMs = Date.now() - time;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return { kind: 'now' };
  if (minutes < 60) return { kind: 'minutes', count: minutes };
  if (hours < 24) return { kind: 'hours', count: hours };
  if (days < 7) return { kind: 'days', count: days };
  return { kind: 'date', date: new Date(time).toLocaleDateString() };
};