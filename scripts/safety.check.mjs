import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile("App.tsx", "utf8");
const calendarSource = await readFile("progressCalendar.ts", "utf8");
const calendarCheckSource = await readFile("scripts/progressCalendar.check.mjs", "utf8");
const workoutHistorySource = await readFile("workoutHistory.ts", "utf8");
const workoutHistoryCheckSource = await readFile("scripts/workoutHistory.check.mjs", "utf8");

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
  /buildProgressHistoryMonths\(workoutProgressDateKeys,\s*todayDateKey,\s*1,\s*calorieIntakeByDate\)/,
  "Full progress calendar should receive calorie totals",
);
assert.match(
  appSource,
  /const workoutProgressDateKeys = useMemo\([\s\S]*?completedDatesFromCompletedSets\(completedSets\)[\s\S]*?\[completedSets\]/,
  "Blue progress completion should come from completed workout sets only",
);
assert.doesNotMatch(
  appSource,
  /completedNutritionDatesFrom/,
  "Nutrition calorie goals should not mark progress calendar days as completed",
);
assert.match(
  appSource,
  /countDateKeysInWeek\(workoutProgressDateKeys,\s*currentCalendarWeekStartKey\)/,
  "Weekly gym count should reset from the current calendar week",
);
assert.match(
  appSource,
  /gym visits this week/,
  "Stats copy should describe weekly gym visits instead of calorie-goal streaks",
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
assert.match(
  appSource,
  /HISTORY_RESET_START_STORAGE_KEY = "@iphone_gym_tracker\/history_reset_start_v1"/,
  "History reset should use a durable marker so the wipe only runs once",
);
assert.match(
  appSource,
  /const shouldResetHistory = savedHistoryReset\.value === null;/,
  "History reset should run only when the durable marker is missing",
);
assert.match(
  appSource,
  /pruneWeeksForHistoryStart\(savedWeeks,\s*historyResetDateKey,\s*historyResetAt\)/,
  "History reset should prune saved workout nutrition history before today",
);
assert.match(
  appSource,
  /pruneCompletedSetsForHistoryStart\(normalizedCompletedSets,\s*historyResetDateKey\)/,
  "History reset should prune old completed set history",
);
assert.match(
  appSource,
  /pruneCompletedDatesForHistoryStart\(nextCompletedDates,\s*historyResetDateKey\)/,
  "History reset should prune old completed date history",
);
assert.match(
  appSource,
  /saveStoredJson\(STORAGE_KEY,\s*resetWeeksToSave\)[\s\S]*saveStoredJson\(HISTORY_RESET_START_STORAGE_KEY/,
  "History reset should persist pruned data before writing the durable reset marker",
);
assert.match(
  appSource,
  /const \[todayDateKey,\s*setTodayDateKey\] = useState\(getTodayDateKey\)/,
  "Today calendar marker should be stateful instead of fixed at launch",
);
assert.match(
  appSource,
  /AppState\.addEventListener\("change"[\s\S]*refreshTodayDateKey/,
  "Today calendar marker should refresh when the app returns active",
);
assert.match(
  appSource,
  /cell\.isToday && styles\.calendarCellToday/,
  "Calendar cells should apply the today outline style",
);
assert.match(
  appSource,
  /cell\.isToday && styles\.calendarCellTextToday[\s\S]*cell\.isToday && styles\.calendarCalorieTextToday/,
  "Full calendar today cells should keep day and calorie text readable",
);
assert.match(
  appSource,
  /buildRememberedExerciseRecommendations\(\{[\s\S]*?weeks,[\s\S]*?extraDaysByWeek: extraWorkoutDays,[\s\S]*?baseDay: activeWorkoutBaseDay,[\s\S]*?beforeWeekIndex: activeWeekIndex/,
  "Exercise recommendations should use all remembered same-family workout history",
);
assert.match(
  appSource,
  /findPreviousExerciseByExactName\(\{[\s\S]*?exercise,[\s\S]*?weeks,[\s\S]*?extraDaysByWeek: extraWorkoutDays,[\s\S]*?baseDay: activeWorkoutBaseDay,[\s\S]*?beforeWeekIndex: activeWeekIndex/,
  "Set comparison should use exact exercise names from same-family workout history",
);
assert.doesNotMatch(
  appSource,
  /previousDayCandidates\[0\]\?\.exercises\[exerciseIndex\]/,
  "Set comparison should not fall back to same-index exercises",
);
assert.doesNotMatch(
  appSource,
  /Based on what you completed last week\./,
  "Recommendation copy should not imply the old one-week-only behavior",
);
assert.match(
  workoutHistorySource,
  /normalizeExerciseIdentity[\s\S]*replace\(\/\\s\+\/g,\s*" "\)/,
  "Exercise identity should normalize spacing without fuzzy substring matching",
);
assert.match(
  workoutHistorySource,
  /extraDay\.baseDay === baseDay/,
  "Extra Push/Pull/Legs days should be grouped with their base workout family",
);
assert.match(
  workoutHistoryCheckSource,
  /skipped in the immediately previous week/,
  "Workout history checks should cover exercises skipped for one week",
);
assert.match(
  workoutHistoryCheckSource,
  /should not match a random exercise only because it contains the same word/,
  "Workout history checks should cover exact-name comparison",
);
assert.match(
  appSource,
  /exerciseSearchQuery[\s\S]*?buildExerciseSearchSuggestions\(\{[\s\S]*?query: exerciseSearchQuery/,
  "Exercise input should search saved history using the letters typed by the user",
);
assert.match(
  workoutHistoryCheckSource,
  /multi-word letter prefixes should match the intended exercise/,
  "Workout checks should cover multi-word exercise autocomplete",
);
assert.match(
  appSource,
  /buildCustomWorkoutDayBlueprints\([\s\S]*?kind: "custom"[\s\S]*?Array\.from\([\s\S]*?\(\) => makeSet\(\)/,
  "New weeks should recreate remembered custom days with fresh set IDs and blank values",
);
assert.match(
  appSource,
  /record\.kind === "custom" \|\| record\.kind === "preset"[\s\S]*?isKnownPreset[\s\S]*?"custom"/,
  "Legacy extra days should receive a backward-compatible custom or preset classification",
);
assert.match(
  appSource,
  /Alert\.alert\([\s\S]*?"Delete Custom Day"[\s\S]*?style: "cancel"[\s\S]*?style: "destructive"/,
  "Custom workout day deletion should require an explicit native confirmation",
);
assert.match(
  appSource,
  /deleteActiveCustomWorkoutDay[\s\S]*?clearCompletedSetIds\(completedSetIds\)[\s\S]*?setActiveWorkoutDayId\(activeExtraWorkoutDay\.baseDay\)/,
  "Deleting a custom day should clean only its completed set IDs and return to a valid base day",
);
assert.match(
  workoutHistoryCheckSource,
  /only custom days and their valid exercise structure should carry into a new week/,
  "Workout checks should cover safe custom-day carry-forward behavior",
);

console.log("safety checks passed");
