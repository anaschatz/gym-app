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
  calories: number;
};

export type CalendarWeek = {
  key: string;
  startKey: string;
  endKey: string;
  rangeLabel: string;
  completedCount: number;
  cells: CalendarCell[];
};

export type CalendarMonthCell = CalendarCell & {
  dateKey: string | null;
  isBlank: boolean;
};

export type CalendarMonth = {
  key: string;
  monthKey: string;
  label: string;
  year: number;
  month: number;
  completedCount: number;
  cells: CalendarMonthCell[];
};

type DateKeyParts = {
  year: number;
  month: number;
  day: number;
};

export const CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MAX_COMPLETED_DATE_KEYS = 10000;
export const MAX_PROGRESS_HISTORY_WEEKS = 1200;
export const MAX_PROGRESS_HISTORY_MONTHS = Math.ceil(MAX_PROGRESS_HISTORY_WEEKS / 4);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
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

const formatMonthKeyParts = ({ year, month }: Pick<DateKeyParts, "year" | "month">) =>
  `${year}-${String(month).padStart(2, "0")}`;

const getMonthKeyFromDateKey = (dateKey: string) => {
  const parts = parseDateKeyParts(dateKey);
  return parts ? formatMonthKeyParts(parts) : null;
};

const parseMonthKeyParts = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
};

const addMonthsToMonthKey = (monthKey: string, monthOffset: number) => {
  const parts = parseMonthKeyParts(monthKey);
  if (!parts || !Number.isFinite(monthOffset)) {
    return null;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + Math.trunc(monthOffset), 1));
  return formatMonthKeyParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
};

const getMonthKeyDistance = (fromMonthKey: string, toMonthKey: string) => {
  const fromParts = parseMonthKeyParts(fromMonthKey);
  const toParts = parseMonthKeyParts(toMonthKey);
  if (!fromParts || !toParts) {
    return null;
  }

  return (toParts.year - fromParts.year) * 12 + (toParts.month - fromParts.month);
};

const getDaysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const buildCompletedDateKeySet = (completedDates: readonly string[]) =>
  new Set(sanitizeCompletedDateKeys(completedDates).dateKeys);

const buildCalendarCaloriesByDate = (caloriesByDate: Readonly<Record<string, number>> = {}) =>
  Object.entries(caloriesByDate).reduce((totals, [dateKey, calories]) => {
    if (isValidDateKey(dateKey) && Number.isFinite(calories) && calories > 0) {
      totals.set(dateKey, Math.round(calories));
    }

    return totals;
  }, new Map<string, number>());

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
  caloriesByDate: Readonly<Record<string, number>> = {},
): CalendarCell[] => {
  const weekStartKey = getSafeStartOfWeekDateKey(anchorDateKey, todayKey);
  const completedDateKeys = buildCompletedDateKeySet(completedDates);
  const calendarCaloriesByDate = buildCalendarCaloriesByDate(caloriesByDate);

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
      calories: calendarCaloriesByDate.get(dateKey) ?? 0,
    };
  });
};

export const buildMonthCalendarCells = (
  completedDates: readonly string[],
  monthKey: string,
  todayKey = formatDateKey(new Date()),
  caloriesByDate: Readonly<Record<string, number>> = {},
): CalendarMonthCell[] => {
  const parts = parseMonthKeyParts(monthKey);
  if (!parts) {
    return [];
  }

  const completedDateKeys = buildCompletedDateKeySet(completedDates);
  const calendarCaloriesByDate = buildCalendarCaloriesByDate(caloriesByDate);
  const safeTodayKey = getSafeDateKey(todayKey, formatDateKey(new Date()));
  const firstDay = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const leadingBlankCount = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = getDaysInMonth(parts.year, parts.month);
  const monthLabel = MONTH_LABELS[parts.month - 1];
  const blankCell = (index: number, weekdayIndex: number): CalendarMonthCell => ({
    key: `${monthKey}-blank-${index}`,
    dateKey: null,
    dayNumber: 0,
    weekdayLabel: CALENDAR_WEEKDAY_LABELS[weekdayIndex],
    monthLabel,
    completed: false,
    isToday: false,
    calories: 0,
    isBlank: true,
  });

  const cells: CalendarMonthCell[] = Array.from({ length: leadingBlankCount }, (_, index) =>
    blankCell(index, index),
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateKeyParts({ year: parts.year, month: parts.month, day });
    const weekdayIndex = (leadingBlankCount + day - 1) % 7;
    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      weekdayLabel: CALENDAR_WEEKDAY_LABELS[weekdayIndex],
      monthLabel,
      completed: completedDateKeys.has(dateKey),
      isToday: dateKey === safeTodayKey,
      calories: calendarCaloriesByDate.get(dateKey) ?? 0,
      isBlank: false,
    });
  }

  const trailingBlankStartIndex = cells.length;
  const trailingBlankCount = (7 - (trailingBlankStartIndex % 7)) % 7;
  for (let index = 0; index < trailingBlankCount; index += 1) {
    cells.push(blankCell(leadingBlankCount + daysInMonth + index, (trailingBlankStartIndex + index) % 7));
  }

  return cells;
};

export const buildProgressHistoryMonths = (
  completedDates: readonly string[],
  todayKey = formatDateKey(new Date()),
  minimumMonthCount = 1,
  caloriesByDate: Readonly<Record<string, number>> = {},
): CalendarMonth[] => {
  const sanitizedCompletedDates = [...sanitizeCompletedDateKeys(completedDates).dateKeys].sort();
  const calendarCaloriesByDate = buildCalendarCaloriesByDate(caloriesByDate);
  const availableProgressDateKeys = [
    ...new Set([...sanitizedCompletedDates, ...calendarCaloriesByDate.keys()]),
  ].sort();
  const safeTodayKey = getSafeDateKey(todayKey, formatDateKey(new Date()));
  const oldestProgressKey = availableProgressDateKeys[0] ?? safeTodayKey;
  const newestProgressKey = availableProgressDateKeys[availableProgressDateKeys.length - 1] ?? safeTodayKey;
  const latestDateKey =
    (getDateKeyDistance(newestProgressKey, safeTodayKey) ?? 0) >= 0 ? safeTodayKey : newestProgressKey;
  const safeTodayMonthKey = getMonthKeyFromDateKey(safeTodayKey) ?? getMonthKeyFromDateKey(FALLBACK_DATE_KEY)!;
  let firstMonthKey = getMonthKeyFromDateKey(oldestProgressKey) ?? safeTodayMonthKey;
  const lastMonthKey = getMonthKeyFromDateKey(latestDateKey) ?? safeTodayMonthKey;
  const requestedMinimumMonths = Math.max(1, Math.floor(minimumMonthCount));
  const visibleMonthDistance = getMonthKeyDistance(firstMonthKey, lastMonthKey);

  if (visibleMonthDistance === null || visibleMonthDistance < 0) {
    firstMonthKey = safeTodayMonthKey;
  } else if (visibleMonthDistance < requestedMinimumMonths - 1) {
    firstMonthKey = addMonthsToMonthKey(lastMonthKey, -(requestedMinimumMonths - 1)) ?? firstMonthKey;
  }

  const cappedMonthDistance = getMonthKeyDistance(firstMonthKey, lastMonthKey);
  if (cappedMonthDistance !== null && cappedMonthDistance >= MAX_PROGRESS_HISTORY_MONTHS) {
    firstMonthKey = addMonthsToMonthKey(lastMonthKey, -(MAX_PROGRESS_HISTORY_MONTHS - 1)) ?? firstMonthKey;
  }

  const months: CalendarMonth[] = [];
  let cursorKey = firstMonthKey;
  let guard = 0;

  while ((getMonthKeyDistance(cursorKey, lastMonthKey) ?? -1) >= 0 && guard < MAX_PROGRESS_HISTORY_MONTHS) {
    const parts = parseMonthKeyParts(cursorKey);
    if (!parts) {
      break;
    }

    const cells = buildMonthCalendarCells(sanitizedCompletedDates, cursorKey, safeTodayKey, caloriesByDate);
    months.push({
      key: cursorKey,
      monthKey: cursorKey,
      label: `${FULL_MONTH_LABELS[parts.month - 1]} ${parts.year}`,
      year: parts.year,
      month: parts.month,
      completedCount: cells.filter((cell) => cell.completed).length,
      cells,
    });
    cursorKey = addMonthsToMonthKey(cursorKey, 1) ?? lastMonthKey;
    guard += 1;
  }

  if (months.length === 0) {
    const cells = buildMonthCalendarCells(sanitizedCompletedDates, safeTodayMonthKey, safeTodayKey, caloriesByDate);
    const parts = parseMonthKeyParts(safeTodayMonthKey) ?? { year: 1970, month: 1 };
    return [
      {
        key: safeTodayMonthKey,
        monthKey: safeTodayMonthKey,
        label: `${FULL_MONTH_LABELS[parts.month - 1]} ${parts.year}`,
        year: parts.year,
        month: parts.month,
        completedCount: cells.filter((cell) => cell.completed).length,
        cells,
      },
    ];
  }

  return months.reverse();
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
