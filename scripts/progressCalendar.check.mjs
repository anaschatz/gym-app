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
  buildProgressHistoryWeeks,
  buildWeekCalendarCells,
  getStartOfWeekDateKey,
  MAX_COMPLETED_DATE_KEYS,
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

const longHistory = buildProgressHistoryWeeks(["1900-01-01"], "2026-06-16", 1);
assert(longHistory.length <= MAX_PROGRESS_HISTORY_WEEKS, "full history rendering should have a safe week cap");

console.log("progressCalendar checks passed");
