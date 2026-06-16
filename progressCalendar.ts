export type DateKeySanitizationResult = {
  dateKeys: string[];
  duplicateCount: number;
  invalidCount: number;
  truncatedCount: number;
};

export type CalendarCell = {
  key: string;
  dayNumber: number;
  weekdayLabel: string;
  monthLabel: string;
  completed: boolean;
  isToday: boolean;
};

export type CalendarWeek = {
  key: string;
  startKey: string;
  endKey: string;
  rangeLabel: string;
  completedCount: number;
  cells: CalendarCell[];
};

type DateKeyParts = {
  year: number;
  month: number;
  day: number;
};

export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MAX_COMPLETED_DATE_KEYS = 10000;
export const MAX_PROGRESS_HISTORY_WEEKS = 1200;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_DATE_KEY = "1970-01-05";

const formatDateKeyParts = ({ year, month, day }: DateKeyParts) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const formatUtcDateKey = (date: Date) =>
  formatDateKeyParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });

const parseDateKeyParts = (dateKey: string): DateKeyParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const dateKeyToUtcDate = (dateKey: string) => {
  const parts = parseDateKeyParts(dateKey);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
};

const getSafeDateKey = (dateKey: string, fallbackDateKey: string) =>
  parseDateKeyParts(dateKey) ? dateKey : parseDateKeyParts(fallbackDateKey) ? fallbackDateKey : FALLBACK_DATE_KEY;

export const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isValidDateKey = (value: string) => Boolean(parseDateKeyParts(value));

export const dateKeyFromIso = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateKey(date);
};

export const dateKeyToTime = (dateKey: string) => {
  const parts = parseDateKeyParts(dateKey);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
};

export const getDateKeyDistance = (fromDateKey: string, toDateKey: string) => {
  const fromTime = dateKeyToTime(fromDateKey);
  const toTime = dateKeyToTime(toDateKey);
  if (fromTime === null || toTime === null) {
    return null;
  }

  return Math.floor((toTime - fromTime) / MS_PER_DAY);
};

export const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = dateKeyToUtcDate(dateKey);
  if (!date || !Number.isFinite(days)) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return formatUtcDateKey(date);
};

export const getPreviousDateKey = (dateKey: string) => addDaysToDateKey(dateKey, -1);

export const getStartOfWeekDateKey = (dateKey: string) => {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) {
    return null;
  }

  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return formatUtcDateKey(date);
};

const getSafeStartOfWeekDateKey = (dateKey: string, fallbackDateKey: string) =>
  getStartOfWeekDateKey(getSafeDateKey(dateKey, fallbackDateKey)) ?? FALLBACK_DATE_KEY;

const formatShortDateLabel = (dateKey: string) => {
  const parts = parseDateKeyParts(dateKey);
  return parts ? `${MONTH_LABELS[parts.month - 1]} ${parts.day}` : "";
};

const buildCompletedDateKeySet = (completedDates: readonly string[]) =>
  new Set(sanitizeCompletedDateKeys(completedDates).dateKeys);

export const sanitizeCompletedDateKeys = (value: unknown): DateKeySanitizationResult => {
  if (!Array.isArray(value)) {
    return {
      dateKeys: [],
      duplicateCount: 0,
      invalidCount: value === undefined || value === null ? 0 : 1,
      truncatedCount: 0,
    };
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  let truncatedCount = 0;
  const dateKeys: string[] = [];

  value.forEach((rawDateKey) => {
    if (typeof rawDateKey !== "string") {
      invalidCount += 1;
      return;
    }

    const dateKey = rawDateKey.trim();
    if (!isValidDateKey(dateKey)) {
      invalidCount += 1;
      return;
    }

    if (seen.has(dateKey)) {
      duplicateCount += 1;
      return;
    }

    if (dateKeys.length >= MAX_COMPLETED_DATE_KEYS) {
      truncatedCount += 1;
      return;
    }

    seen.add(dateKey);
    dateKeys.push(dateKey);
  });

  return {
    dateKeys,
    duplicateCount,
    invalidCount,
    truncatedCount,
  };
};

export const mergeCompletedDateKeys = (...dateKeyGroups: Array<readonly string[]>) =>
  sanitizeCompletedDateKeys(dateKeyGroups.flat()).dateKeys;

export const getCalendarWeekRangeLabel = (weekStartKey: string) => {
  const endKey = addDaysToDateKey(weekStartKey, 6) ?? weekStartKey;
  return `${formatShortDateLabel(weekStartKey)} - ${formatShortDateLabel(endKey)}`;
};

export const buildWeekCalendarCells = (
  completedDates: readonly string[],
  anchorDateKey: string,
  todayKey = formatDateKey(new Date()),
): CalendarCell[] => {
  const weekStartKey = getSafeStartOfWeekDateKey(anchorDateKey, todayKey);
  const completedDateKeys = buildCompletedDateKeySet(completedDates);

  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysToDateKey(weekStartKey, index) ?? weekStartKey;
    const parts = parseDateKeyParts(dateKey);

    return {
      key: dateKey,
      dayNumber: parts?.day ?? 0,
      weekdayLabel: CALENDAR_WEEKDAY_LABELS[index],
      monthLabel: parts ? MONTH_LABELS[parts.month - 1] : "",
      completed: completedDateKeys.has(dateKey),
      isToday: dateKey === todayKey,
    };
  });
};

export const buildProgressHistoryWeeks = (
  completedDates: readonly string[],
  todayKey = formatDateKey(new Date()),
  minimumWeekCount = 4,
): CalendarWeek[] => {
  const sanitizedCompletedDates = [...sanitizeCompletedDateKeys(completedDates).dateKeys].sort();
  const safeTodayKey = getSafeDateKey(todayKey, formatDateKey(new Date()));
  const currentWeekStartKey = getSafeStartOfWeekDateKey(safeTodayKey, safeTodayKey);
  const oldestCompletedKey = sanitizedCompletedDates[0] ?? safeTodayKey;
  const newestCompletedKey = sanitizedCompletedDates[sanitizedCompletedDates.length - 1] ?? safeTodayKey;
  const latestDateKey =
    (getDateKeyDistance(newestCompletedKey, safeTodayKey) ?? 0) >= 0 ? safeTodayKey : newestCompletedKey;
  let firstWeekStartKey = getSafeStartOfWeekDateKey(oldestCompletedKey, safeTodayKey);
  const lastWeekStartKey = getSafeStartOfWeekDateKey(latestDateKey, safeTodayKey);
  const requestedMinimumWeeks = Math.max(1, Math.floor(minimumWeekCount));
  const visibleWeekDistance = getDateKeyDistance(firstWeekStartKey, lastWeekStartKey);

  if (visibleWeekDistance !== null && visibleWeekDistance < (requestedMinimumWeeks - 1) * 7) {
    firstWeekStartKey = addDaysToDateKey(lastWeekStartKey, -(requestedMinimumWeeks - 1) * 7) ?? firstWeekStartKey;
  }

  const weeks: CalendarWeek[] = [];
  let cursorKey = firstWeekStartKey;
  let guard = 0;

  while ((getDateKeyDistance(cursorKey, lastWeekStartKey) ?? -1) >= 0 && guard < MAX_PROGRESS_HISTORY_WEEKS) {
    const cells = buildWeekCalendarCells(sanitizedCompletedDates, cursorKey, safeTodayKey);
    const endKey = addDaysToDateKey(cursorKey, 6) ?? cursorKey;
    weeks.push({
      key: cursorKey,
      startKey: cursorKey,
      endKey,
      rangeLabel: getCalendarWeekRangeLabel(cursorKey),
      completedCount: cells.filter((cell) => cell.completed).length,
      cells,
    });
    cursorKey = addDaysToDateKey(cursorKey, 7) ?? lastWeekStartKey;
    guard += 1;
  }

  if (weeks.length === 0) {
    const cells = buildWeekCalendarCells(sanitizedCompletedDates, currentWeekStartKey, safeTodayKey);
    return [
      {
        key: currentWeekStartKey,
        startKey: currentWeekStartKey,
        endKey: addDaysToDateKey(currentWeekStartKey, 6) ?? currentWeekStartKey,
        rangeLabel: getCalendarWeekRangeLabel(currentWeekStartKey),
        completedCount: cells.filter((cell) => cell.completed).length,
        cells,
      },
    ];
  }

  return weeks.reverse();
};
