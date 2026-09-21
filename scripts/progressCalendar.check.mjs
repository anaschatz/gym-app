import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import vm from "node:vm";

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
  countDateKeysInWeek,
  dateKeyFromIso,
  getStartOfWeekDateKey,
  MAX_COMPLETED_DATE_KEYS,
  MAX_PROGRESS_HISTORY_MONTHS,
  MAX_PROGRESS_HISTORY_WEEKS,
  sanitizeCompletedDateKeys,
  resolveCalorieSessionStartedAt,
} = await import(pathToFileURL(tempModulePath).href);

// Exercise the application's real projection and reset callbacks with synthetic data.
const appSource = await readFile("App.tsx", "utf8");
const appAst = ts.createSourceFile("App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const calendarFunctions = new Set([
  "activeCalorieLogsForCalendar", "appendSessionCalendarCalorieLogs", "appendCalendarCalorieLogs",
]);
const appFunctions = appAst.statements
  .filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some(
    (declaration) => calendarFunctions.has(declaration.name.getText(appAst)),
  ))
  .map((node) => node.getText(appAst));
let resetCallback;
const findResetCallback = (node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === "resetNutritionForNewDay") {
    resetCallback = node.initializer.arguments[0].getText(appAst);
  }
  ts.forEachChild(node, findResetCallback);
};
findResetCallback(appAst);
assert(resetCallback, "nutrition reset callback must be covered by the regression check");
const runtimeSource = ts.transpileModule(
  `${appFunctions.join("\n")}\nconst reset = ${resetCallback};\nthis.project = appendCalendarCalorieLogs; this.reset = reset;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const originalTZ = process.env.TZ;
try {
  process.env.TZ = "Europe/Athens";
  const meal = (id, createdAt, amount = 2000) => ({ id, type: "add", amount, createdAt });
  const firstMeal = meal("sep-20", "2026-09-20T20:00:00+03:00");
  const resetTime = "2026-09-21T00:10:00+03:00";
  let day = { calories: { startedAt: resetTime, startedAtSource: "stored", logs: [firstMeal], history: [] } };
  let sequence = 0;
  const context = vm.createContext({
    dateKeyFromIso, resolveCalorieSessionStartedAt,
    isStarterCalorieLog: () => false,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [resetTime])); } },
    todayDateKey: "2026-09-21", activeDay: "Push", MAX_CALORIE_SESSIONS_PER_DAY: 1000,
    updateCurrentDay: (update) => { day = update(day); },
    makeId: () => `session-${++sequence}`,
    setQuickCalorieDrafts: () => {}, setCalorieDrafts: () => {}, setNutritionResetNotice: () => {},
    formatDateTime: (date) => date,
  });
  vm.runInContext(runtimeSource, context);
  const project = () => {
    const logs = [];
    context.project(logs, day.calories, "2026-09-21");
    return buildConsumedCaloriesByDate(logs);
  };
  assert.deepEqual(project(), { "2026-09-20": 2000 }, "a later session timestamp must not move September 20 meals to 21");
  const beforeProjection = JSON.stringify(day);
  project();
  assert.equal(JSON.stringify(day), beforeProjection, "calendar recovery must not rewrite saved data");
  context.reset();
  assert.equal(day.calories.history[0].startedAt, firstMeal.createdAt, "reset must archive the recovered start, not the reset date");
  assert.deepEqual(project(), { "2026-09-20": 2000 }, "the archived session must keep its recovered date");
  day.calories.history[0].startedAt = resetTime;
  assert.deepEqual(project(), { "2026-09-20": 2000 }, "existing archived data must also recover without a migration");
  context.reset();
  assert.equal(day.calories.history.length, 1, "an empty repeated reset must not duplicate history");
  day.calories.logs = [meal("sep-21", "2026-09-21T12:00:00+03:00", 500)];
  context.reset();
  assert.deepEqual(project(), { "2026-09-21": 500, "2026-09-20": 2000 }, "real September 21 intake must stay separate");

  const start = "2026-09-20T10:00:00+03:00";
  assert.equal(resolveCalorieSessionStartedAt(start, [meal("late", resetTime)]), start, "after-midnight intake must retain a valid earlier session start");
  assert.equal(resolveCalorieSessionStartedAt(null, [meal("late", resetTime), firstMeal]), firstMeal.createdAt, "missing starts must recover the earliest log across midnight");
  assert.equal(resolveCalorieSessionStartedAt("bad-date", [meal("bad", "bad-date")]), null, "invalid dates must not default to today");
  assert.equal(resolveCalorieSessionStartedAt(null, [meal("bad", start, NaN)]), null, "invalid calorie values must not establish a session start");
  assert.equal(
    dateKeyFromIso(resolveCalorieSessionStartedAt("2026-09-20T22:00:00Z", [meal("utc", "2026-09-20T20:30:00Z")])),
    "2026-09-20", "UTC timestamps near local midnight must resolve to the local meal date",
  );
  assert.equal(
    resolveCalorieSessionStartedAt("2026-10-25T03:10:00+02:00", [meal("dst", "2026-10-25T03:40:00+03:00")]),
    "2026-10-25T03:40:00+03:00", "session order must use instants during daylight-saving clock changes",
  );
  const september = buildMonthCalendarCells([], "2026-09", "2026-09-21", project());
  assert.equal(september.find((cell) => cell.key === "2026-09-20").calories, 2000);
  assert.equal(september.find((cell) => cell.key === "2026-09-21").calories, 500);
} finally {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
}

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

assert.equal(
  countDateKeysInWeek(["2026-06-15", "2026-06-15", "2026-06-17", "2026-06-22", "bad-date"], "2026-06-17"),
  2,
  "weekly workout count should count unique valid workout dates in the current Monday-Sunday week",
);
assert.equal(
  countDateKeysInWeek(["2026-06-15", "2026-06-17"], "2026-06-22"),
  0,
  "weekly workout count should reset when the next calendar week starts",
);

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
