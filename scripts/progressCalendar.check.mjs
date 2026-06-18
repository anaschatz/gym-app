import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const helperSourcePath = path.resolve("progressCalendar.ts");
const helperSource = await readFile(helperSourcePath, "utf8");
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const tempDir = await mkdtemp(path.join(tmpdir(), "progress-calendar-check-"));
const tempModulePath = path.join(tempDir, "progressCalendar.mjs");
await writeFile(tempModulePath, transpiled.outputText);

const {
  addDaysToDateKey,
  buildConsumedCaloriesByDate,
  buildMonthCalendarCells,
  buildProgressHistoryMonths,
  buildProgressHistoryWeeks,
  buildWeekCalendarCells,
  getStartOfWeekDateKey,
  MAX_COMPLETED_DATE_KEYS,
  MAX_PROGRESS_HISTORY_MONTHS,
  MAX_PROGRESS_HISTORY_WEEKS,
  sanitizeCompletedDateKeys,
} = await import(pathToFileURL(tempModulePath).href);

const weekCells = buildWeekCalendarCells([], "2026-06-17", "2026-06-17");
assert.deepEqual(
  weekCells.map((cell) => cell.key),
  ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"],
  "current week should render Monday through Sunday",
);
assert.equal(weekCells[2].isToday, true, "today should land on the correct date cell");

const newYearWeekStart = getStartOfWeekDateKey("2026-01-01");
assert.equal(newYearWeekStart, "2025-12-29", "week start should cross year boundaries correctly");
assert.equal(addDaysToDateKey(newYearWeekStart, -7), "2025-12-22", "previous week should stay aligned");
assert.equal(addDaysToDateKey(newYearWeekStart, 7), "2026-01-05", "next week should stay aligned");

const completedCells = buildWeekCalendarCells(["2026-06-15", "2026-06-17"], "2026-06-17", "2026-06-17");
assert.deepEqual(
  completedCells.filter((cell) => cell.completed).map((cell) => cell.key),
  ["2026-06-15", "2026-06-17"],
  "completed dates should render on their exact calendar dates",
);
assert.deepEqual(
  completedCells.map((cell) => cell.calories),
  [0, 0, 0, 0, 0, 0, 0],
  "compact weekly calendar should have no calories unless explicitly supplied",
);

const consumedCaloriesByDate = buildConsumedCaloriesByDate([
  { id: "meal-1", type: "add", amount: 2500, createdAt: "2026-06-17T10:00:00.000Z" },
  { id: "meal-1", type: "add", amount: 2500, createdAt: "2026-06-17T10:00:00.000Z" },
  { id: "extract-1", type: "extract", amount: 400, createdAt: "2026-06-17T11:00:00.000Z" },
  { id: "meal-2", type: "add", amount: 3200, createdAt: "2026-06-18T10:00:00.000Z" },
  { id: "reset-session-meal", type: "add", amount: 2100, createdAt: "2026-06-18T23:00:00.000Z", dateKey: "2026-06-17" },
  { id: "bad-date", type: "add", amount: 9999, createdAt: "not-a-date" },
  { id: "bad-session-date", type: "add", amount: 1200, createdAt: "2026-06-20T10:00:00.000Z", dateKey: "2026-02-31" },
  { id: "bad-amount", type: "add", amount: Number.NaN, createdAt: "2026-06-19T10:00:00.000Z" },
  { id: "negative", type: "add", amount: -100, createdAt: "2026-06-19T10:00:00.000Z" },
]);
assert.deepEqual(
  consumedCaloriesByDate,
  { "2026-06-17": 4600, "2026-06-18": 3200, "2026-06-20": 1200 },
  "consumed calories should count valid add logs once on their exact or session dates",
);

const calorieWeekCells = buildWeekCalendarCells(
  ["2026-06-17"],
  "2026-06-17",
  "2026-06-17",
  { "2026-06-17": 1840.4, "2026-06-18": -20, "bad-key": 999 },
);
assert.equal(calorieWeekCells[2].calories, 1840, "weekly calendar should attach rounded calories to the exact date");
assert.equal(calorieWeekCells[3].calories, 0, "weekly calendar should ignore non-positive calorie totals");
assert.equal(
  calorieWeekCells.some((cell) => cell.calories === 999),
  false,
  "weekly calendar should ignore invalid calorie date keys",
);

const juneMonthCells = buildMonthCalendarCells(["2026-06-16"], "2026-06", "2026-06-16");
assert.equal(juneMonthCells.length, 35, "June 2026 should render as five full calendar rows");
assert.equal(juneMonthCells[0].key, "2026-06-01", "month calendar should align Monday starts without blanks");
assert.equal(juneMonthCells[15].key, "2026-06-16", "month calendar should place completed dates on exact dates");
assert.equal(juneMonthCells[15].completed, true, "month calendar should mark completed dates");
assert.equal(juneMonthCells[15].isToday, true, "month calendar should mark today on the correct date");
assert.equal(
  buildMonthCalendarCells([], "2026-06", "2026-06-16", { "2026-06-16": 2200 })
    .find((cell) => cell.key === "2026-06-16")?.calories,
  2200,
  "month calendar should attach calories to the correct day",
);

const mayMonthCells = buildMonthCalendarCells([], "2026-05", "2026-06-16");
assert.deepEqual(
  mayMonthCells.slice(0, 4).map((cell) => cell.isBlank),
  [true, true, true, true],
  "month calendar should add leading blanks before Friday month starts",
);
assert.equal(mayMonthCells[4].key, "2026-05-01", "first real day should follow leading blanks");

const leapMonthCells = buildMonthCalendarCells([], "2024-02", "2024-02-10");
assert.equal(
  leapMonthCells.filter((cell) => !cell.isBlank).length,
  29,
  "leap-year February should render 29 real days",
);

const deduped = sanitizeCompletedDateKeys(["2026-06-16", "2026-06-16", "2026-06-17"]);
assert.deepEqual(deduped.dateKeys, ["2026-06-16", "2026-06-17"], "duplicate completed dates should be removed");
assert.equal(deduped.duplicateCount, 1, "duplicate count should be reported");

const invalid = sanitizeCompletedDateKeys(["2026-02-31", "not-a-date", 12, "2026-06-16"]);
assert.deepEqual(invalid.dateKeys, ["2026-06-16"], "invalid stored date keys should be ignored");
assert.equal(invalid.invalidCount, 3, "invalid count should be reported");

const excessiveDates = Array.from({ length: MAX_COMPLETED_DATE_KEYS + 2 }, (_, index) => {
  const date = new Date(Date.UTC(2000, 0, 1 + index));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
});
const truncated = sanitizeCompletedDateKeys(excessiveDates);
assert.equal(truncated.dateKeys.length, MAX_COMPLETED_DATE_KEYS, "completed date keys should have a safe cap");
assert(truncated.truncatedCount > 0, "truncated completed date keys should be reported");

const fullHistoryWeeks = buildProgressHistoryWeeks(["2026-04-01", "2026-06-16"], "2026-06-16", 1);
assert.equal(fullHistoryWeeks[0].startKey, "2026-06-15", "full history should show the newest week first");
assert.equal(
  fullHistoryWeeks[fullHistoryWeeks.length - 1].startKey,
  "2026-03-30",
  "full history should include the earliest available completed week",
);
assert(
  fullHistoryWeeks.length > 4,
  "full history should not be limited to the old 28-day snapshot",
);
assert(
  fullHistoryWeeks.some((week) => week.cells.some((cell) => cell.key === "2026-04-01" && cell.completed)),
  "full history should preserve older completed progress dates",
);

const fullHistoryMonths = buildProgressHistoryMonths(["2026-04-01", "bad-date", "2026-04-01", "2026-06-16"], "2026-06-16");
assert.deepEqual(
  fullHistoryMonths.map((month) => month.monthKey),
  ["2026-06", "2026-05", "2026-04"],
  "full monthly history should include every available month from newest to oldest",
);
assert.equal(fullHistoryMonths[0].label, "June 2026", "monthly history should include the correct month and year label");
assert(
  fullHistoryMonths
    .find((month) => month.monthKey === "2026-04")
    ?.cells.some((cell) => cell.key === "2026-04-01" && cell.completed),
  "monthly history should preserve older completed progress dates",
);
assert.equal(
  fullHistoryMonths.find((month) => month.monthKey === "2026-04")?.completedCount,
  1,
  "monthly history should dedupe duplicate completed dates",
);

const calorieOnlyHistoryMonths = buildProgressHistoryMonths([], "2026-06-16", 1, { "2026-04-02": 2450 });
assert.deepEqual(
  calorieOnlyHistoryMonths.map((month) => month.monthKey),
  ["2026-06", "2026-05", "2026-04"],
  "monthly history should include months with calorie progress even without completed days",
);
assert.equal(
  calorieOnlyHistoryMonths
    .find((month) => month.monthKey === "2026-04")
    ?.cells.find((cell) => cell.key === "2026-04-02")?.calories,
  2450,
  "monthly history should preserve calories on the exact progress date",
);

const emptyHistoryMonths = buildProgressHistoryMonths([], "2026-06-16");
assert.deepEqual(
  emptyHistoryMonths.map((month) => month.monthKey),
  ["2026-06"],
  "empty history should safely fall back to the current month",
);
assert.equal(emptyHistoryMonths[0].completedCount, 0, "empty history fallback should have no completed days");

const longHistory = buildProgressHistoryWeeks(["1900-01-01"], "2026-06-16", 1);
assert(longHistory.length <= MAX_PROGRESS_HISTORY_WEEKS, "full history rendering should have a safe week cap");

const longMonthlyHistory = buildProgressHistoryMonths(["1900-01-01"], "2026-06-16", 1);
assert(
  longMonthlyHistory.length <= MAX_PROGRESS_HISTORY_MONTHS,
  "full monthly history rendering should have a safe month cap",
);
assert.equal(
  longMonthlyHistory[0].monthKey,
  "2026-06",
  "capped monthly history should preserve the newest visible month",
);

console.log("progressCalendar checks passed");
