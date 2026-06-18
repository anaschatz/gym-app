import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile("App.tsx", "utf8");
const calendarSource = await readFile("progressCalendar.ts", "utf8");
const calendarCheckSource = await readFile("scripts/progressCalendar.check.mjs", "utf8");

const countMatches = (source, pattern) => source.match(pattern)?.length ?? 0;

assert.equal(
  countMatches(appSource, /AsyncStorage\.getItem/g),
  1,
  "AsyncStorage reads should stay isolated in the storage loader helper",
);
assert.equal(
  countMatches(appSource, /AsyncStorage\.setItem/g),
  2,
  "AsyncStorage writes should stay isolated in the storage save helper",
);
assert.equal(
  countMatches(appSource, /JSON\.parse/g),
  1,
  "Stored JSON parsing should stay isolated in parseStoredJson",
);
assert.equal(
  countMatches(appSource, /JSON\.stringify/g),
  1,
  "Stored JSON serialization should stay isolated in saveStoredJson",
);
assert.match(
  appSource,
  /source:\s*"serialize"/,
  "JSON serialization failures should be logged with redacted structured context",
);

const consoleCalls = appSource.match(/console\.\w+\(/g) ?? [];
assert(
  consoleCalls.length > 0 && consoleCalls.every((call) => call === "console.warn("),
  "App logging should stay limited to structured warning paths",
);
assert.equal(
  countMatches(appSource, /console\.warn\("storage_issue"/g),
  consoleCalls.length,
  "Storage warnings should use the redacted storage_issue event",
);

[
  "MAX_STORED_WEEKS",
  "MAX_EXTRA_DAYS_PER_WEEK",
  "MAX_EXERCISES_PER_DAY",
  "MAX_SETS_PER_EXERCISE",
  "MAX_CALORIE_LOGS_PER_DAY",
  "MAX_COMPLETED_SET_IDS",
  "MAX_DAILY_CALORIE_TARGETS",
  "MAX_WORKOUT_BONUS_CLAIMS",
  "MAX_REST_SECONDS",
].forEach((constantName) => {
  assert.match(appSource, new RegExp(`const ${constantName} =`), `${constantName} should be explicit`);
});

assert.match(calendarSource, /MAX_COMPLETED_DATE_KEYS/, "Completed date keys should have an explicit safety cap");
assert.match(calendarSource, /MAX_PROGRESS_HISTORY_WEEKS/, "Progress history should have an explicit rendering cap");
assert.match(calendarCheckSource, /truncatedCount/, "Calendar checks should cover capped completed-date inputs");
assert.doesNotMatch(
  appSource,
  /buildWeekCalendarCells\([\s\S]{0,240}calorieIntakeByDate/,
  "Compact Stats calendar should not receive calorie totals",
);
assert.doesNotMatch(
  appSource,
  /const renderCalendarCell[\s\S]*?formatCalendarCalories[\s\S]*?const renderProgressMonthCell/,
  "Compact Stats calendar cells should not render calorie text",
);
assert.match(
  appSource,
  /buildProgressHistoryMonths\(completedProgressDateKeys,\s*todayDateKey,\s*1,\s*calorieIntakeByDate\)/,
  "Full progress calendar should receive calorie totals",
);
assert.match(
  appSource,
  /fontVariant:\s*\["tabular-nums"\]/,
  "Calendar calorie text should use stable tabular figures",
);
assert.match(
  appSource,
  /appendSessionCalendarCalorieLogs[\s\S]*?!isStarterCalorieLog\(log\)[\s\S]*?dateKey: sessionDateKey[\s\S]*?buildConsumedCaloriesByDate\(logs\)/,
  "Full progress calendar should ignore starter/demo calorie logs",
);
assert.match(
  appSource,
  /const calorieText = formatCalendarCalories\(cell\.calories\);/,
  "Full progress calendar should render valid session calories for previous days",
);
assert.match(
  appSource,
  /type CalorieLogSession[\s\S]*startedAt: string;[\s\S]*endedAt: string;[\s\S]*logs: CalorieLog\[\];/,
  "Nutrition reset history should keep explicit session boundaries",
);
assert.match(
  appSource,
  /startedAtSource: "stored" \| "inferred";/,
  "Nutrition calories should track whether startedAt came from stored session data",
);
assert.match(
  appSource,
  /const activeCalorieLogsForCalendar[\s\S]*startedAtSource === "stored"[\s\S]*dateKeyFromIso\(log\.createdAt\) === todayKey/,
  "Legacy active calorie logs should only count on today's calendar date",
);
assert.match(
  appSource,
  /resetNutritionForNewDay[\s\S]*logsToArchive = activeCalorieLogsForCalendar\(day\.calories,\s*todayDateKey\)[\s\S]*startedAtSource: "stored"[\s\S]*logs: logsToArchive/,
  "Nutrition reset should archive current logs before starting a new session",
);

console.log("safety checks passed");
